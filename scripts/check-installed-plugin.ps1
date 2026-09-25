<#
.SYNOPSIS
Reports which DiscordAITranslator build BetterDiscord will load.

.DESCRIPTION
Compares the installed plugin with the repository build (version and SHA256), lists
private copies that packaged apps keep under %LOCALAPPDATA%\Packages (a Discord started
from inside such an app loads that copy instead), checks whether this window's AppData
writes are redirected the same way, and whether Discord's startup file loads BetterDiscord.
Exits with 1 when the installed plugin is missing or differs from the repository build.

.EXAMPLE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-installed-plugin.ps1
#>
[CmdletBinding()]
param(
    [string]$PluginPath = "",
    [string]$PluginsDir = ""
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

# A normally started Discord loads BetterDiscord only if its startup file has the hook.
$discordRoot = Join-Path $env:LOCALAPPDATA "Discord"
$startupFiles = @()
if (Test-Path -LiteralPath $discordRoot) {
    $startupFiles = @(Get-ChildItem -Path (Join-Path $discordRoot "app-*\modules\discord_desktop_core-*\discord_desktop_core\index.js") -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1)
}
$asar = Test-Path -LiteralPath (Join-Path $env:APPDATA "BetterDiscord\data\betterdiscord.asar")
$coreState = if ($asar) { "present" } else { "MISSING" }
if ($startupFiles.Count) {
    $hooked = (Get-Content -LiteralPath $startupFiles[0].FullName -Raw) -match "betterdiscord"
    Write-Host "Discord startup:   $(if ($hooked) { 'loads BetterDiscord' } else { 'does NOT load BetterDiscord' }); BetterDiscord core $coreState"
    if (-not $hooked -or -not $asar) {
        $problems.Add("A normally started Discord will not load BetterDiscord. Run the BetterDiscord installer yourself and choose Install or Repair for Discord Stable.")
    }
}
else {
    Write-Host "Discord startup:   Discord Stable not found; BetterDiscord core $coreState"
    $problems.Add("Discord Stable was not found, so this check cannot confirm that Discord loads BetterDiscord.")
}

Write-Host ""
if ($problems.Count) {
    Write-Host "Problems:"
    $problems | ForEach-Object { Write-Host "- $_" }
}
else {
    Write-Host "OK: BetterDiscord will load v$($repo.Version) ($(Format-Short $repo.Sha256))."
}
if (-not $installed -or $installed.Sha256 -ne $repo.Sha256) { exit 1 }
exit 0
