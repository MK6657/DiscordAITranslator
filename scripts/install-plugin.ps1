<#
.SYNOPSIS
Installs the generated DiscordAITranslator BetterDiscord plugin on Windows.

.DESCRIPTION
Validates JavaScript syntax, creates a timestamped backup, verifies SHA256, and
optionally enables the plugin in each BetterDiscord profile using atomic JSON replacement.

.PARAMETER PluginPath
Path to the generated .plugin.js file. Defaults to the repository root artifact.

.PARAMETER PluginsDir
BetterDiscord plugins directory. Defaults to the current user's APPDATA directory.

.PARAMETER SkipSyntaxCheck
Skips the Node.js syntax check.

.PARAMETER NoEnable
Installs the plugin without changing BetterDiscord profile enable state.

.EXAMPLE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-plugin.ps1 -WhatIf

.EXAMPLE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-plugin.ps1 -NoEnable
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
    [string]$PluginPath = "",
    [string]$PluginsDir = "",
    [switch]$SkipSyntaxCheck,
    [switch]$NoEnable
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

function Enable-BetterDiscordPlugin {
    param(
        [Parameter(Mandatory = $true)][string]$PluginName
    )

    $dataDir = Join-Path $env:APPDATA "BetterDiscord\data"
    if (-not (Test-Path -LiteralPath $dataDir -PathType Container)) {
        return @()
    }

    $updated = New-Object System.Collections.Generic.List[string]
    $backups = @{}
    try {
        foreach ($profile in @(Get-ChildItem -LiteralPath $dataDir -Directory -ErrorAction SilentlyContinue)) {
            $pluginsJson = Join-Path $profile.FullName "plugins.json"
            if (-not (Test-Path -LiteralPath $pluginsJson -PathType Leaf)) {
                continue
            }

            $originalHash = Get-Sha256 -Path $pluginsJson
            $raw = (Get-Content -LiteralPath $pluginsJson -Raw -Encoding UTF8 -ErrorAction Stop).Trim()
            $state = [ordered]@{}
            if ($raw) {
                $parsed = $raw | ConvertFrom-Json -ErrorAction Stop
                foreach ($property in $parsed.PSObject.Properties) {
                    $state[$property.Name] = $property.Value
                }
            }
            if ($state.Contains($PluginName) -and $state[$PluginName] -eq $true) {
                continue
            }

            $state[$PluginName] = $true
            $json = $state | ConvertTo-Json -Depth 8
            $runId = [guid]::NewGuid().ToString("N")
            $temp = "$pluginsJson.tmp-$runId"
            $backup = "$pluginsJson.bak-enable-$runId"
            try {
                Set-Utf8NoBomContent -Path $temp -Value $json
                $validated = Get-Content -LiteralPath $temp -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
                $enabledProperty = $validated.PSObject.Properties | Where-Object { $_.Name -eq $PluginName } | Select-Object -First 1
                if (-not $enabledProperty -or $enabledProperty.Value -ne $true) {
                    throw "Plugin enable verification failed for profile file: $pluginsJson"
                }
                if ((Get-Sha256 -Path $pluginsJson) -ne $originalHash) {
                    throw "Profile file changed during installation: $pluginsJson"
                }
                [System.IO.File]::Replace($temp, $pluginsJson, $backup, $true)
                $backups[$pluginsJson] = $backup
                $updated.Add($pluginsJson)
            }
            finally {
                if (Test-Path -LiteralPath $temp) {
                    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
    catch {
        for ($index = $updated.Count - 1; $index -ge 0; $index--) {
            $path = $updated[$index]
            $backup = $backups[$path]
            if ($backup -and (Test-Path -LiteralPath $backup -PathType Leaf)) {
                Copy-Item -LiteralPath $backup -Destination $path -Force -ErrorAction SilentlyContinue
            }
        }
        throw
    }

    return @($updated)
}

if (-not $env:APPDATA) {
    throw "APPDATA is not set. Cannot locate the BetterDiscord plugins folder."
}

if (-not $PluginPath) {
    $PluginPath = Join-Path $PSScriptRoot "..\DiscordAITranslator.plugin.js"
}
if (-not $PluginsDir) {
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
$destination = Join-Path $resolvedPluginsDir (Split-Path -Leaf $pluginFile)
$pluginsRoot = [System.IO.Path]::GetFullPath($resolvedPluginsDir).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$destinationFull = [System.IO.Path]::GetFullPath($destination)
if (-not $destinationFull.StartsWith($pluginsRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to write outside the BetterDiscord plugins folder: $destinationFull"
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
    $backupCreated = $false
    $destinationReplaced = $false

    try {
        if (Test-Path -LiteralPath $destination) {
            if (Test-Path -LiteralPath $backup) {
                throw "Backup path already exists: $backup"
            }
            Copy-Item -LiteralPath $destination -Destination $backup
            $backupCreated = $true
        }

        Copy-Item -LiteralPath $pluginFile -Destination $temp
        $tempHash = Get-Sha256 -Path $temp
        if ($sourceHash -ne $tempHash) {
            throw "Hash mismatch before replace. Source=$sourceHash Temp=$tempHash"
        }
        Move-Item -LiteralPath $temp -Destination $destination -Force
        $destinationReplaced = $true

        $destinationHash = Get-Sha256 -Path $destination
        if ($sourceHash -ne $destinationHash) {
            throw "Hash mismatch after install. Source=$sourceHash Destination=$destinationHash"
        }

        $enabledFiles = @()
        if (-not $NoEnable) {
            $pluginName = [System.IO.Path]::GetFileNameWithoutExtension([System.IO.Path]::GetFileNameWithoutExtension($destination))
            $enabledFiles = @(Enable-BetterDiscordPlugin -PluginName $pluginName)
        }
    }
    catch {
        # A backup collision/copy error occurs before replacement. In that case
        # the destination is not ours to roll back, and must be left untouched.
        if ($destinationReplaced -and $backupCreated -and (Test-Path -LiteralPath $backup -PathType Leaf)) {
            Copy-Item -LiteralPath $backup -Destination $destination -Force -ErrorAction SilentlyContinue
        }
        elseif ($destinationReplaced -and -not $backupCreated -and (Test-Path -LiteralPath $destination -PathType Leaf)) {
            Remove-Item -LiteralPath $destination -Force -ErrorAction SilentlyContinue
        }
        throw
    }
    finally {
        if (Test-Path -LiteralPath $temp) {
            Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host "Installed DiscordAITranslator.plugin.js to:"
    Write-Host $destination
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
}
