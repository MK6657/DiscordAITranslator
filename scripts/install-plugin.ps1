<#
.SYNOPSIS
Installs the generated DiscordAITranslator BetterDiscord plugin on Windows.

.DESCRIPTION
Validates JavaScript syntax, creates a timestamped backup, verifies SHA256, and
optionally enables the plugin in each BetterDiscord profile using atomic JSON replacement.

Before installing into %APPDATA% (also with -WhatIf), it writes and removes a small probe file there to
detect a window running inside a packaged app (for example an AI desktop app). Such a window's new
AppData files are redirected to %LOCALAPPDATA%\Packages\<app>\LocalCache\Roaming, which a normally
started Discord never reads, so the script then stops with exit code 2 and changes nothing.

.PARAMETER PluginPath
Path to the generated .plugin.js file. Defaults to the repository root artifact.

.PARAMETER PluginsDir
BetterDiscord plugins directory. Defaults to the current user's APPDATA directory. Profile
enable state comes from the sibling data directory unless -ProfileDir selects a profile.

.PARAMETER ProfileDir
Directory of one BetterDiscord profile containing plugins.json, such as BetterDiscord\data\stable.

.PARAMETER SkipSyntaxCheck
Skips the Node.js syntax check.

.PARAMETER NoEnable
Installs the plugin without changing BetterDiscord profile enable state.

.PARAMETER AllowRedirectedAppData
Installs even when this window's AppData writes are redirected into an app package. The plugin then
lands in that app's private copy, which only a Discord started from inside that app loads.

.EXAMPLE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-plugin.ps1 -WhatIf

.EXAMPLE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-plugin.ps1 -NoEnable
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
    [string]$PluginPath = "",
    [string]$PluginsDir = "",
    [string]$ProfileDir = "",
    [switch]$SkipSyntaxCheck,
    [switch]$NoEnable,
    [switch]$AllowRedirectedAppData
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    # Get-FileHash is not reliably available in fresh Windows PowerShell hosts,
    # including CI. Use the built-in .NET stream API without module discovery.
    $stream = $null
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $stream = [System.IO.File]::OpenRead($Path)
        return [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace("-", "")
    }
    finally {
        if ($null -ne $stream) { $stream.Dispose() }
        $sha.Dispose()
    }
}

function Set-Utf8NoBomContent {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Value, $encoding)
}

function Invoke-InstallerRollback {
    param([Parameter(Mandatory = $true)][scriptblock]$Restore)

    for ($attempt = 0; ; $attempt++) {
        try {
            & $Restore
            return
        }
        catch {
            $failure = $_.Exception.GetBaseException()
            if ($attempt -ge 8 -or $failure -isnot [System.IO.IOException] -or ($failure.HResult -band 0xffff) -notin (32, 33)) {
                throw
            }
            Start-Sleep -Milliseconds 125
        }
    }
}

function Read-InstallerProfile {
    param([Parameter(Mandatory = $true)][string]$Path)

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = [System.BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "")
    }
    finally { $sha.Dispose() }

    $state = [System.Collections.Specialized.OrderedDictionary]::new([System.StringComparer]::Ordinal)
    $raw = [System.Text.Encoding]::UTF8.GetString($bytes).TrimStart([char]0xFEFF).Trim()
    if ($raw) {
        if (-not $raw.StartsWith("{")) { throw "Expected a JSON object in profile file: $Path" }
        $parsed = ConvertFrom-Json -InputObject $raw -ErrorAction Stop
        foreach ($property in $parsed.PSObject.Properties) {
            $state[$property.Name] = $property.Value
        }
    }
    return [pscustomobject]@{ Hash = $hash; State = $state }
}

function Restore-InstallerBackup {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Backup,
        [string]$ExpectedHash = ""
    )

    $restoreTemp = "$Path.tmp-$([guid]::NewGuid().ToString('N'))"
    try {
        [System.IO.File]::Copy($Backup, $restoreTemp)
        if ($ExpectedHash) {
            if ((Get-Sha256 -Path $Path) -ne $ExpectedHash) {
                throw "File changed before rollback: $Path"
            }
            [System.IO.File]::Replace($restoreTemp, $Path, [NullString]::Value, $true)
        }
        else {
            [System.IO.File]::Move($restoreTemp, $Path)
        }
    }
    finally {
        if ([System.IO.File]::Exists($restoreTemp)) {
            Remove-Item -LiteralPath $restoreTemp -Force -ErrorAction SilentlyContinue
        }
    }
}

function Undo-InstallerProfileChange {
    param(
        [Parameter(Mandatory = $true)][pscustomobject]$Change,
        [Parameter(Mandatory = $true)][string]$PluginName
    )

    $path = $Change.Path
    $backup = $Change.Backup
    if (-not $Change.Committed) {
        if ([System.IO.File]::Exists($backup) -and -not [System.IO.File]::Exists($path)) {
            Restore-InstallerBackup -Path $path -Backup $backup
        }
        return
    }

    $current = Read-InstallerProfile -Path $path
    if ($current.Hash -eq $Change.InstalledHash) {
        Restore-InstallerBackup -Path $path -Backup $backup -ExpectedHash $current.Hash
        return
    }

    $state = $current.State
    if ($state[$PluginName] -isnot [bool] -or -not $state[$PluginName]) {
        Write-Warning "Profile changed after enable. Preserved its current state at '$path'. Backup retained: '$backup'." -WarningAction Continue
        return
    }

    $original = (Read-InstallerProfile -Path $backup).State
    if ($original.Contains($PluginName)) {
        $state[$PluginName] = $original[$PluginName]
    }
    else {
        $state.Remove($PluginName)
    }
    $restoreTemp = "$path.tmp-$([guid]::NewGuid().ToString('N'))"
    try {
        Set-Utf8NoBomContent -Path $restoreTemp -Value (ConvertTo-Json -InputObject $state -Depth 100)
        if ((Get-Sha256 -Path $path) -ne $current.Hash) {
            throw "Profile changed before rollback: $path"
        }
        [System.IO.File]::Replace($restoreTemp, $path, [NullString]::Value, $true)
    }
    finally {
        if ([System.IO.File]::Exists($restoreTemp)) {
            Remove-Item -LiteralPath $restoreTemp -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Warning "Profile changed after enable. Rolled back only '$PluginName' in '$path'. Backup retained: '$backup'." -WarningAction Continue
}

function Enable-BetterDiscordPlugin {
    param(
        [Parameter(Mandatory = $true)][AllowNull()][AllowEmptyCollection()][string[]]$ProfileFiles,
        [Parameter(Mandatory = $true)][string]$PluginName
    )

    $changes = [System.Collections.Generic.List[object]]::new()
    try {
        foreach ($pluginsJson in $ProfileFiles) {
            $original = Read-InstallerProfile -Path $pluginsJson
            $state = $original.State
            if ($state[$PluginName] -is [bool] -and $state[$PluginName]) { continue }
            $state[$PluginName] = $true
            $runId = [guid]::NewGuid().ToString("N")
            $temp = "$pluginsJson.tmp-$runId"
            $backup = "$pluginsJson.bak-enable-$runId"
            try {
                Set-Utf8NoBomContent -Path $temp -Value (ConvertTo-Json -InputObject $state -Depth 100)
                $staged = Read-InstallerProfile -Path $temp
                if ($staged.State[$PluginName] -isnot [bool] -or -not $staged.State[$PluginName]) {
                    throw "Plugin enable verification failed for profile file: $pluginsJson"
                }
                if ((Get-Sha256 -Path $pluginsJson) -ne $original.Hash) {
                    throw "Profile file changed during installation: $pluginsJson"
                }
                $change = [pscustomobject]@{
                    Path = $pluginsJson
                    Backup = $backup
                    InstalledHash = $staged.Hash
                    Committed = $false
                }
                $changes.Add($change)
                [System.IO.File]::Replace($temp, $pluginsJson, $backup, $true)
                $change.Committed = $true
                if ((Get-Sha256 -Path $backup) -ne $original.Hash) {
                    throw "Profile file changed during installation: $pluginsJson"
                }
            }
            finally {
                if ([System.IO.File]::Exists($temp)) {
                    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
    catch {
        for ($index = $changes.Count - 1; $index -ge 0; $index--) {
            $change = $changes[$index]
            try {
                Invoke-InstallerRollback -Restore { Undo-InstallerProfileChange -Change $change -PluginName $PluginName }
            }
            catch {
                Write-Warning "Profile rollback failed for '$($change.Path)'. Recovery backup: '$($change.Backup)'. $($_.Exception.Message)" -WarningAction Continue
            }
        }
        throw
    }

    return $changes | ForEach-Object { $_.Path }
}

function Get-PluginVersion {
    param([Parameter(Mandatory = $true)][string]$Path)
    # The BetterDiscord metadata banner is at the top of the file.
    $header = Get-Content -LiteralPath $Path -TotalCount 12 -Encoding UTF8 -ErrorAction SilentlyContinue
    $match = [regex]::Match(($header -join "`n"), '@version\s+(\S+)')
    if ($match.Success) { return $match.Groups[1].Value }
    return "unknown"
}

function Get-PluginName {
    param([Parameter(Mandatory = $true)][string]$Path)
    $header = Get-Content -LiteralPath $Path -TotalCount 24 -Encoding UTF8 -ErrorAction Stop
    $match = [regex]::Match(($header -join "`n"), '(?m)^[ \t]*\*[ \t]*@name[ \t]+([^\r\n]+)')
    if (-not $match.Success -or -not $match.Groups[1].Value.Trim()) {
        throw "The plugin metadata must contain an @name: $Path"
    }
    return $match.Groups[1].Value.Trim()
}

# Packaged desktop apps redirect files that a process inside them creates under %APPDATA% to
# %LOCALAPPDATA%\Packages\<app>\LocalCache\Roaming (the same probe as check-installed-plugin.ps1).
# Returns that package name, or "" when writes reach the real folder or the probe cannot run.
function Get-AppDataRedirectPackage {
    if (-not $env:LOCALAPPDATA) { return "" }
    $packagesRoot = Join-Path $env:LOCALAPPDATA "Packages"
    if (-not (Test-Path -LiteralPath $packagesRoot -PathType Container)) { return "" }
    $probeName = "dait-redirect-probe-$([guid]::NewGuid().ToString('N')).tmp"
    $probe = Join-Path $env:APPDATA $probeName
    # .NET file calls, because Set-Content and Remove-Item do nothing under -WhatIf.
    try {
        [System.IO.File]::WriteAllText($probe, "probe")
    }
    catch {
        Write-Verbose "Could not write the AppData redirect probe: $($_.Exception.Message)"
        return ""
    }
    try {
        foreach ($package in @(Get-ChildItem -LiteralPath $packagesRoot -Directory -ErrorAction SilentlyContinue)) {
            if (Test-Path -LiteralPath (Join-Path $package.FullName "LocalCache\Roaming\$probeName") -PathType Leaf) {
                return $package.Name
            }
        }
        return ""
    }
    finally {
        try { [System.IO.File]::Delete($probe) } catch { }
    }
}

if (-not $PluginPath) {
    $PluginPath = Join-Path $PSScriptRoot "..\DiscordAITranslator.plugin.js"
}
if (-not $PluginsDir) {
    if (-not $env:APPDATA) {
        throw "APPDATA is not set. Supply -PluginsDir to locate the BetterDiscord plugins folder."
    }
    $PluginsDir = Join-Path $env:APPDATA "BetterDiscord\plugins"
}

if (-not (Test-Path -LiteralPath $PluginPath -PathType Leaf)) {
    throw "Generated plugin was not found: $PluginPath. Run 'npm run build' first."
}
$resolvedPlugin = Resolve-Path -LiteralPath $PluginPath
$pluginFile = $resolvedPlugin.ProviderPath
if (-not (Test-Path -LiteralPath $PluginsDir -PathType Container)) {
    throw "BetterDiscord plugins folder was not found: $PluginsDir. Install BetterDiscord first, then run this script again."
}

$resolvedPluginsDir = (Resolve-Path -LiteralPath $PluginsDir).ProviderPath
$destination = Join-Path $resolvedPluginsDir "DiscordAITranslator.plugin.js"
$pluginsRoot = [System.IO.Path]::GetFullPath($resolvedPluginsDir).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$destinationFull = [System.IO.Path]::GetFullPath($destination)
if (-not $destinationFull.StartsWith($pluginsRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to write outside the BetterDiscord plugins folder: $destinationFull"
}

$pluginName = Get-PluginName -Path $pluginFile
$profileFiles = @()
if (-not $NoEnable) {
    if ($ProfileDir) {
        $resolvedProfileDir = (Resolve-Path -LiteralPath $ProfileDir -ErrorAction Stop).ProviderPath
        $pluginsJson = Join-Path $resolvedProfileDir "plugins.json"
        if (-not (Test-Path -LiteralPath $pluginsJson -PathType Leaf)) {
            throw "The specified BetterDiscord profile does not contain plugins.json: $resolvedProfileDir"
        }
        $profileFiles = @($pluginsJson)
    }
    else {
        $pluginsParent = Split-Path -Parent $resolvedPluginsDir
        if ($pluginsParent) {
            $profileDataDir = Join-Path $pluginsParent "data"
            if (Test-Path -LiteralPath $profileDataDir -PathType Container) {
                $profileFiles = @(Get-ChildItem -LiteralPath $profileDataDir -Directory -ErrorAction Stop |
                    ForEach-Object { Join-Path $_.FullName "plugins.json" } |
                    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
            }
        }
    }
}

# The hash check below reads through the same redirected view, so it cannot catch this case.
$redirectPackage = ""
if ($env:APPDATA) {
    $appDataRoot = [System.IO.Path]::GetFullPath($env:APPDATA).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $appDataTargets = @((@($destinationFull) + $profileFiles) | Where-Object {
        $_.StartsWith($appDataRoot, [System.StringComparison]::OrdinalIgnoreCase)
    })
    if ($appDataTargets.Count) { $redirectPackage = Get-AppDataRedirectPackage }
}
if ($redirectPackage) {
    $privateRoaming = Join-Path $env:LOCALAPPDATA "Packages\$redirectPackage\LocalCache\Roaming"
    Write-Warning "This window runs inside app package $redirectPackage, which redirects its AppData writes to $privateRoaming."
    Write-Warning "A normally started Discord will not see an install made from here; only a Discord started from inside that app would load it."
    if (-not $AllowRedirectedAppData) {
        Write-Warning "Nothing was installed. Run 'npm run plugin:install' from a normal PowerShell window (open it from the Start menu), then confirm with 'npm run plugin:check'. To install into the app's private copy anyway, add -AllowRedirectedAppData."
        exit 2
    }
    Write-Warning "-AllowRedirectedAppData is set: installing into the private copy of app package $redirectPackage."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$runId = [guid]::NewGuid().ToString("N")
$backup = "$destination.bak-$timestamp"
$temp = "$destination.tmp-$runId"

if (-not $SkipSyntaxCheck) {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        throw "Node.js was not found in PATH. Install Node.js or rerun with -SkipSyntaxCheck."
    }
    & $node.Source --check $pluginFile
    if ($LASTEXITCODE -ne 0) {
        throw "Syntax check failed: $pluginFile"
    }
}

$target = "BetterDiscord plugin file '$destination'"
if ($PSCmdlet.ShouldProcess($target, "Install DiscordAITranslator plugin")) {
    $sourceHash = Get-Sha256 -Path $pluginFile
    $previousVersion = ""
    $previousHash = ""
    $backupCreated = $false
    $replaceAttempted = $false
    $destinationReplaced = $false

    try {
        if (Test-Path -LiteralPath $destination -PathType Leaf) {
            $previousVersion = Get-PluginVersion -Path $destination
            $previousHash = Get-Sha256 -Path $destination
        }

        Copy-Item -LiteralPath $pluginFile -Destination $temp
        $tempHash = Get-Sha256 -Path $temp
        if ($sourceHash -ne $tempHash) {
            throw "Hash mismatch before replace. Source=$sourceHash Temp=$tempHash"
        }
        $pluginName = Get-PluginName -Path $temp
        $sourceVersion = Get-PluginVersion -Path $temp
        if ($previousHash) {
            if ((Get-Sha256 -Path $destination) -ne $previousHash) {
                throw "Plugin destination changed during installation: $destination"
            }
            if (Test-Path -LiteralPath $backup) {
                throw "Backup path already exists: $backup"
            }
            $replaceAttempted = $true
            [System.IO.File]::Replace($temp, $destination, $backup, $true)
            $backupCreated = $true
        }
        else {
            [System.IO.File]::Move($temp, $destination)
        }
        $destinationReplaced = $true
        if ($backupCreated -and (Get-Sha256 -Path $backup) -ne $previousHash) {
            throw "Plugin destination changed during installation: $destination"
        }

        $destinationHash = Get-Sha256 -Path $destination
        if ($sourceHash -ne $destinationHash) {
            throw "Hash mismatch after install. Source=$sourceHash Destination=$destinationHash"
        }

        $enabledFiles = @()
        if (-not $NoEnable) {
            $enabledFiles = @(Enable-BetterDiscordPlugin -ProfileFiles $profileFiles -PluginName $pluginName)
        }
    }
    catch {
        $recovery = if (($destinationReplaced -or $replaceAttempted) -and [System.IO.File]::Exists($backup)) {
            " Backup retained: '$backup'."
        }
        else { "" }
        try {
            if ($destinationReplaced) {
                Invoke-InstallerRollback -Restore {
                    if (-not [System.IO.File]::Exists($destination) -or (Get-Sha256 -Path $destination) -ne $tempHash) {
                        Write-Warning "Plugin destination changed after replacement. Preserved its current state at '$destination'.$recovery" -WarningAction Continue
                        return
                    }
                    if ($backupCreated) {
                        Restore-InstallerBackup -Path $destination -Backup $backup -ExpectedHash $tempHash
                    }
                    else {
                        [System.IO.File]::Delete($destination)
                    }
                }
            }
            elseif ($replaceAttempted -and [System.IO.File]::Exists($backup) -and -not [System.IO.File]::Exists($destination)) {
                Invoke-InstallerRollback -Restore { Restore-InstallerBackup -Path $destination -Backup $backup }
            }
        }
        catch {
            Write-Warning "Plugin rollback failed for '$destination'.$recovery $($_.Exception.Message)" -WarningAction Continue
        }
        throw
    }
    finally {
        if ([System.IO.File]::Exists($temp)) {
            Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host "Installed DiscordAITranslator.plugin.js to:"
    Write-Host $destination
    if ($previousVersion) {
        Write-Host "Version: $sourceVersion (replaced $previousVersion)"
    }
    else {
        Write-Host "Version: $sourceVersion"
    }
    if ($backupCreated) {
        Write-Host "Backup:"
        Write-Host $backup
    }
    if (-not $NoEnable) {
        if ($enabledFiles.Count) {
            Write-Host "Enabled in BetterDiscord profiles:"
            $enabledFiles | ForEach-Object { Write-Host $_ }
        }
        else {
            Write-Host "No BetterDiscord profile state required an update."
        }
    }
    Write-Host "SHA256:"
    Write-Host $destinationHash
    if ($redirectPackage) {
        Write-Warning "This install is in the private copy of app package $redirectPackage. A normally started Discord will not load it."
    }
}
