<#
.SYNOPSIS
Reports which DiscordAITranslator build BetterDiscord will load.

.DESCRIPTION
Compares the installed plugin with the repository build (version and SHA256), lists
private copies that packaged apps keep under %LOCALAPPDATA%\Packages (a Discord started
from inside such an app loads that copy instead), checks whether this window's AppData
writes are redirected the same way, and whether Discord's startup file loads BetterDiscord.
Exits with 1 when the installed plugin is missing or differs from the repository build.

.PARAMETER ProfileDir
Directory containing the selected BetterDiscord profile's plugins.json. Defaults to data\stable
beside PluginsDir. A stable, ptb, or canary profile selects the corresponding Discord channel.

.PARAMETER Strict
Also exits with 1 when the selected Discord installation cannot be confirmed to load the plugin.

.EXAMPLE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-installed-plugin.ps1
#>
[CmdletBinding()]
param(
    [string]$PluginPath = "",
    [string]$PluginsDir = "",
    [string]$ProfileDir = "",
    [switch]$Strict
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
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

function Get-PluginVersion {
    param([Parameter(Mandatory = $true)][string]$Path)
    $header = Get-Content -LiteralPath $Path -TotalCount 12 -Encoding UTF8 -ErrorAction SilentlyContinue
    $match = [regex]::Match(($header -join "`n"), '@version\s+(\S+)')
    if ($match.Success) { return $match.Groups[1].Value }
    return "unknown"
}

function Get-PluginName {
    param([Parameter(Mandatory = $true)][string]$Path)
    $source = [string](Get-Content -LiteralPath $Path -Raw -Encoding UTF8)
    $metadata = [regex]::Match($source, '(?s)\A[ \t]*/\*\*(.*?)\*/')
    $name = [regex]::Match($metadata.Groups[1].Value, '(?m)^[ \t]*\*?[ \t]*@name[ \t]+([^\r\n]+)')
    return $name.Groups[1].Value.Trim()
}

function Get-PluginEnableState {
    param([string]$Path, [string]$PluginId)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return "profile missing" }
    try {
        $raw = [string](Get-Content -LiteralPath $Path -Raw -Encoding UTF8)
        if (-not $raw.TrimStart().StartsWith("{")) { return "profile invalid" }
        $state = ConvertFrom-Json -InputObject $raw
    }
    catch {
        return "profile unreadable or invalid"
    }
    $entry = $state.PSObject.Properties | Where-Object { $_.Name -ceq $PluginId } | Select-Object -First 1
    if (-not $entry) { return "missing enable key" }
    if ($entry.Value -isnot [bool]) { return "invalid enable value" }
    if ($entry.Value) { return "enabled" }
    return "disabled"
}

function Get-StartupRequireTargets {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
    $source = [string](Get-Content -LiteralPath $Path -Raw -Encoding UTF8 -ErrorAction SilentlyContinue)
    $tokenPattern = @'
(?x)
    //[^\r\n]*
  | /\*[\s\S]*?(?:\*/|\z)
  | "(?:\\[\s\S]|[^"\\])*"
  | '(?:\\[\s\S]|[^'\\])*'
  | `(?:\\[\s\S]|[^`\\])*`
  | (?<![\w$.]) require \s* \(\s*
        (?:
            (?<quote>['"]) (?<target>(?:\\[^\r\n]|(?!\k<quote>)[^\\\r\n])*) \k<quote>
          | path\.(?:join|resolve) \s*\(
                (?:\s*(?:[\w$.]+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*,)+
                \s* (?<fileQuote>['"]) (?<target>(?:\\[^\r\n]|(?!\k<fileQuote>)[^\\\r\n])*) \k<fileQuote> \s*\)
        ) \s*\)
'@
    foreach ($token in [regex]::Matches($source, $tokenPattern)) {
        if ($token.Groups["target"].Success) { $token.Groups["target"].Value }
    }
}

function Get-PluginInfo {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    return [pscustomobject]@{
        Path = $Path
        Version = Get-PluginVersion -Path $Path
        Sha256 = Get-Sha256 -Path $Path
    }
}

function Format-Short {
    param([string]$Sha256)
    if (-not $Sha256) { return "" }
    return $Sha256.Substring(0, 16) + "..."
}

if (-not $env:APPDATA -or -not $env:LOCALAPPDATA) {
    throw "APPDATA and LOCALAPPDATA must be set."
}
if (-not $PluginPath) {
    $PluginPath = Join-Path $PSScriptRoot "..\DiscordAITranslator.plugin.js"
}
if (-not $PluginsDir) {
    $PluginsDir = Join-Path $env:APPDATA "BetterDiscord\plugins"
}
$pluginsFolder = [System.IO.DirectoryInfo]($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($PluginsDir))
$PluginsDir = $pluginsFolder.FullName
$betterDiscordRoot = if ($pluginsFolder.Parent) { $pluginsFolder.Parent.FullName } else { $PluginsDir }
$dataDir = Join-Path $betterDiscordRoot "data"
if (-not $ProfileDir) {
    $ProfileDir = Join-Path $dataDir "stable"
}
$profileFolder = [System.IO.DirectoryInfo]($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ProfileDir))
$flavor = $profileFolder.Name.ToLowerInvariant()
$profilePath = Join-Path $profileFolder.FullName "plugins.json"
$pluginName = "DiscordAITranslator.plugin.js"
$problems = New-Object System.Collections.Generic.List[string]

$repo = Get-PluginInfo -Path $PluginPath
if (-not $repo) { throw "Repository build not found: $PluginPath. Run 'npm run build' first." }
Write-Host "Repository build:  v$($repo.Version)  $(Format-Short $repo.Sha256)"

$installed = Get-PluginInfo -Path (Join-Path $PluginsDir $pluginName)
if (-not $installed) {
    Write-Host "Installed plugin:  not found in $PluginsDir"
    $problems.Add("The plugin is not installed in the BetterDiscord plugins folder.")
}
else {
    $state = if ($installed.Sha256 -eq $repo.Sha256) { "same as repository build" } else { "DIFFERENT from repository build" }
    Write-Host "Installed plugin:  v$($installed.Version)  $(Format-Short $installed.Sha256)  ($state)"
    if ($installed.Sha256 -ne $repo.Sha256) {
        $problems.Add("The installed plugin is not the repository build. Run 'npm run plugin:install' from a normal PowerShell window.")
    }
    $pluginId = Get-PluginName -Path $installed.Path
    if ($pluginId) {
        $enableState = Get-PluginEnableState -Path $profilePath -PluginId $pluginId
        Write-Host "Profile ($flavor): $pluginId - $enableState ($profilePath)"
        if ($enableState -ne "enabled") {
            $problems.Add("The BetterDiscord profile does not enable '$pluginId': $enableState ($profilePath).")
        }
    }
    else {
        $problems.Add("The installed plugin has no @name in its metadata header.")
    }
}

# Packaged apps (for example AI desktop apps) keep private AppData copies. A Discord that such an
# app started reads BetterDiscord and this plugin from there, not from the folder above.
$packagesRoot = Join-Path $env:LOCALAPPDATA "Packages"
$shadows = @()
if (Test-Path -LiteralPath $packagesRoot) {
    $shadows = @(Get-ChildItem -LiteralPath $packagesRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $candidate = Join-Path $_.FullName "LocalCache\Roaming\BetterDiscord\plugins\$pluginName"
        $info = Get-PluginInfo -Path $candidate
        if ($info) { $info | Add-Member -NotePropertyName Package -NotePropertyValue $_.Name -PassThru }
    })
}
foreach ($shadow in $shadows) {
    $state = if ($shadow.Sha256 -eq $repo.Sha256) { "same as repository build" } else { "DIFFERENT from repository build" }
    Write-Host "Private copy:      v$($shadow.Version)  $(Format-Short $shadow.Sha256)  ($state) in app package $($shadow.Package)"
    $problems.Add("App package $($shadow.Package) has its own BetterDiscord copy. A Discord started from inside that app loads it instead of the installed plugin; restart Discord normally.")
}

# Detect whether this window's AppData writes are redirected into an app package.
$probeName = "dait-redirect-probe-$([guid]::NewGuid().ToString('N')).tmp"
$probe = Join-Path $env:APPDATA $probeName
try {
    Set-Content -LiteralPath $probe -Value "probe" -Encoding ASCII
    $redirected = @(Get-ChildItem -Path (Join-Path $packagesRoot "*\LocalCache\Roaming\$probeName") -ErrorAction SilentlyContinue)
    if ($redirected.Count) {
        $package = Split-Path -Leaf (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $redirected[0].FullName)))
        Write-Host "This window:       AppData writes are redirected into app package $package"
        $problems.Add("This window runs inside app package $package, so installs from here are invisible to a normally started Discord. Use a normal PowerShell window.")
    }
    else {
        Write-Host "This window:       AppData writes go to the real folder"
    }
}
finally {
    Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
}

$discordFolders = @{ stable = "Discord"; ptb = "DiscordPTB"; canary = "DiscordCanary" }
$discordLabels = @{ stable = "Discord Stable"; ptb = "Discord PTB"; canary = "Discord Canary" }
$discordLabel = $discordLabels[$flavor]
$latestApp = $null
if ($discordLabel) {
    $discordRoot = Join-Path $env:LOCALAPPDATA $discordFolders[$flavor]
    if (Test-Path -LiteralPath $discordRoot -PathType Container) {
        $latestApp = Get-ChildItem -LiteralPath $discordRoot -Directory -Filter "app-*" -ErrorAction SilentlyContinue |
            ForEach-Object {
                $appVersion = $null
                if ([version]::TryParse($_.Name.Substring(4), [ref]$appVersion)) {
                    [pscustomobject]@{ Directory = $_; Version = $appVersion }
                }
            } | Sort-Object Version -Descending | Select-Object -First 1
    }
}
$asar = Test-Path -LiteralPath (Join-Path $dataDir "betterdiscord.asar") -PathType Leaf
$coreState = if ($asar) { "present" } else { "MISSING" }
if ($latestApp) {
    Write-Host "Discord app:       $($latestApp.Directory.Name) ($discordLabel)"
    $appPath = $latestApp.Directory.FullName
    $resources = Join-Path $appPath "resources"
    $appEntry = Join-Path $resources "app\index.js"
    $legacyEntries = @(Get-ChildItem -Path (Join-Path $appPath "modules\discord_desktop_core-*\discord_desktop_core\index.js") -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1)
    $usesAppEntry = (Test-Path -LiteralPath $appEntry -PathType Leaf) -and
        -not (Test-Path -LiteralPath (Join-Path $resources "app.asar") -PathType Leaf)
    $coreModulePattern = '(?:^|[\\/])betterdiscord\.asar$'
    $resourcesLoadCore = $false
    $resourcesLoadDiscord = $false
    if ($usesAppEntry) {
        $appTargets = @(Get-StartupRequireTargets -Path $appEntry)
        $resourcesLoadCore = $appTargets -match $coreModulePattern
        $resourcesLoadDiscord = ($appTargets -match '^\.\.[\\/]+betterdiscord\.app\.asar$') -and
            (Test-Path -LiteralPath (Join-Path $resources "betterdiscord.app.asar") -PathType Leaf)
    }
    $hookedApp = $resourcesLoadCore -and $resourcesLoadDiscord
    $hookedLegacy = (-not $usesAppEntry -or $resourcesLoadDiscord) -and ($legacyEntries.Count -gt 0) -and
        (@(Get-StartupRequireTargets -Path $legacyEntries[0].FullName) -match $coreModulePattern)
    $hooked = $hookedApp -or $hookedLegacy
    $hookKind = if ($hookedApp) { "resources/app hook (BD 1.14+)" }
        elseif ($hookedLegacy) { "desktop_core hook" }
        elseif ($resourcesLoadCore) { "incomplete resources/app hook" }
        else { "no hook" }
    if ($hooked -and $asar) {
        Write-Host "Discord startup:   loads BetterDiscord; BetterDiscord core $coreState ($hookKind)"
    }
    else {
        Write-Host "Discord startup:   does NOT load BetterDiscord; BetterDiscord core $coreState ($hookKind)"
        $problems.Add("A normally started $discordLabel will not load BetterDiscord. Run the BetterDiscord installer yourself and choose Install or Repair for $discordLabel.")
    }
}
elseif ($discordLabel) {
    Write-Host "Discord startup:   $discordLabel not found; BetterDiscord core $coreState"
    $problems.Add("$discordLabel was not found, so this check cannot confirm that Discord loads BetterDiscord.")
}
else {
    $problems.Add("This check cannot confirm a Discord channel for profile '$($profileFolder.FullName)'.")
}

Write-Host ""
if ($problems.Count) {
    Write-Host "Problems:"
    $problems | ForEach-Object { Write-Host "- $_" }
}
else {
    Write-Host "OK: BetterDiscord will load v$($repo.Version) ($(Format-Short $repo.Sha256))."
}
if (-not $installed -or $installed.Sha256 -ne $repo.Sha256 -or ($Strict -and $problems.Count)) { exit 1 }
exit 0
