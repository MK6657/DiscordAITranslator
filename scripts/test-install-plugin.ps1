[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Reproduce hosts where Get-FileHash is unavailable, even on machines where it
# normally works. Every installer fixture below must pass without this command.
function Get-FileHash {
    throw "Get-FileHash is deliberately unavailable in this regression fixture."
}

function Get-TestSha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return [System.BitConverter]::ToString($sha.ComputeHash([System.IO.File]::ReadAllBytes($Path))).Replace("-", "")
    }
    finally {
        $sha.Dispose()
    }
}

function Set-Utf8NoBomContent {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $encoding = New-Object System.Text.UTF8Encoding($false, $true)
    [System.IO.File]::WriteAllText($Path, $Value, $encoding)
}

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$installer = Join-Path $PSScriptRoot "install-plugin.ps1"
$source = Join-Path $projectRoot "DiscordAITranslator.plugin.js"
$tempBase = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$tempBase = [System.IO.Path]::GetFullPath($tempBase)
$testRoot = Join-Path $tempBase ("discord-ai-translator-installer-" + [guid]::NewGuid().ToString("N"))
$testRoot = [System.IO.Path]::GetFullPath($testRoot)
$safePrefix = $tempBase.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $testRoot.StartsWith($safePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe installer test root: $testRoot"
}

$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($installer, [ref]$null, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count) {
    throw ($parseErrors | ForEach-Object Message | Out-String)
}
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Generated plugin is missing. Run npm run build first."
}

$originalAppData = $env:APPDATA
$originalLocalAppData = $env:LOCALAPPDATA
try {
    # The installer probes %LOCALAPPDATA%\Packages for redirected AppData writes. Point it at an empty
    # fixture so no result depends on the machine, for example a terminal running inside a packaged app.
    $fixtureLocalAppData = Join-Path $testRoot "fixture-localappdata"
    New-Item -ItemType Directory -Force -Path $fixtureLocalAppData | Out-Null
    $env:LOCALAPPDATA = $fixtureLocalAppData

    $unicodeDirectoryName = ([string][char]0x6D4B) + ([string][char]0x8BD5) + " path"
    $successAppData = Join-Path $testRoot ("success-appdata " + $unicodeDirectoryName)
    $successPlugins = Join-Path $successAppData "BetterDiscord\plugins"
    $successProfile = Join-Path $successAppData "BetterDiscord\data\stable"
    New-Item -ItemType Directory -Force -Path $successPlugins, $successProfile | Out-Null
    $successProfileJson = Join-Path $successProfile "plugins.json"
    $unicodePluginName = $unicodeDirectoryName + "-" + [char]::ConvertFromUtf32(0x1F680)
    $initialProfileState = [ordered]@{}
    $initialProfileState[$unicodePluginName] = $false
    Set-Utf8NoBomContent -Path $successProfileJson -Value ($initialProfileState | ConvertTo-Json -Compress)
    $env:APPDATA = $successAppData

    & $installer -PluginPath $source -PluginsDir $successPlugins -WhatIf | Out-Null
    $installed = Join-Path $successPlugins "DiscordAITranslator.plugin.js"
    if (Test-Path -LiteralPath $installed) {
        throw "-WhatIf unexpectedly wrote the plugin file."
    }

    & $installer -PluginPath $source -PluginsDir $successPlugins -NoEnable | Out-Null
    if ((Get-TestSha256 -Path $installed) -ne (Get-TestSha256 -Path $source)) {
        throw "Installed plugin hash mismatch."
    }
    $noEnableState = Get-Content -LiteralPath $successProfileJson -Raw -Encoding UTF8 | ConvertFrom-Json
    $noEnableProperties = @($noEnableState.PSObject.Properties | Select-Object -ExpandProperty Name)
    if ($noEnableProperties -contains "DiscordAITranslator") {
        throw "-NoEnable unexpectedly changed profile state."
    }
    $preservedBeforeEnable = $noEnableState.PSObject.Properties | Where-Object { $_.Name -eq $unicodePluginName } | Select-Object -First 1
    if (-not $preservedBeforeEnable -or $preservedBeforeEnable.Value -ne $false) {
        throw "-NoEnable did not preserve the UTF-8 no-BOM profile key."
    }

    & $installer -PluginPath $source -PluginsDir $successPlugins | Out-Null
    $enabledState = Get-Content -LiteralPath $successProfileJson -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($enabledState.DiscordAITranslator -ne $true) {
        throw "Default installation did not enable the plugin."
    }
    $preservedAfterEnable = $enabledState.PSObject.Properties | Where-Object { $_.Name -eq $unicodePluginName } | Select-Object -First 1
    if (-not $preservedAfterEnable -or $preservedAfterEnable.Value -ne $false) {
        throw "Installer did not preserve the UTF-8 no-BOM profile key."
    }
    $profileBytes = [System.IO.File]::ReadAllBytes($successProfileJson)
    if ($profileBytes.Length -ge 3 -and $profileBytes[0] -eq 0xEF -and $profileBytes[1] -eq 0xBB -and $profileBytes[2] -eq 0xBF) {
        throw "Installer unexpectedly wrote a UTF-8 BOM."
    }

    & $installer -PluginPath $source -PluginsDir $successPlugins | Out-Null
    $secondEnableState = Get-Content -LiteralPath $successProfileJson -Raw -Encoding UTF8 | ConvertFrom-Json
    $secondPreserved = $secondEnableState.PSObject.Properties | Where-Object { $_.Name -eq $unicodePluginName } | Select-Object -First 1
    if (-not $secondPreserved -or $secondPreserved.Value -ne $false -or $secondEnableState.DiscordAITranslator -ne $true) {
        throw "Repeated installation changed existing profile state."
    }

    # The checker confirms the installed build and flags private copies kept by packaged apps.
    $checker = Join-Path $PSScriptRoot "check-installed-plugin.ps1"
    $checkLocalAppData = Join-Path $testRoot "check-localappdata"
    New-Item -ItemType Directory -Force -Path $checkLocalAppData | Out-Null
    $env:LOCALAPPDATA = $checkLocalAppData
    $noDiscordOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -PluginPath $source -PluginsDir $successPlugins | Out-String
    if ($LASTEXITCODE -ne 0 -or $noDiscordOutput -notmatch "same as repository build" -or $noDiscordOutput -match "OK: BetterDiscord will load" -or $noDiscordOutput -notmatch "cannot confirm") {
        throw "Checker must not report OK without Discord: $noDiscordOutput"
    }
    $discordCore = Join-Path $checkLocalAppData "Discord\app-1.0.9999\modules\discord_desktop_core-1\discord_desktop_core"
    New-Item -ItemType Directory -Force -Path $discordCore, (Join-Path $successAppData "BetterDiscord\data") | Out-Null
    Set-Utf8NoBomContent -Path (Join-Path $successAppData "BetterDiscord\data\betterdiscord.asar") -Value "asar"
    Set-Utf8NoBomContent -Path (Join-Path $discordCore "index.js") -Value "module.exports = require('./core.asar');"
    $unhookedOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -PluginPath $source -PluginsDir $successPlugins | Out-String
    if ($unhookedOutput -notmatch "does NOT load BetterDiscord" -or $unhookedOutput -match "OK: BetterDiscord will load") {
        throw "Checker did not report the missing BetterDiscord hook: $unhookedOutput"
    }
    Set-Utf8NoBomContent -Path (Join-Path $discordCore "index.js") -Value "require('BetterDiscord/data/betterdiscord.asar');`nmodule.exports = require('./core.asar');"
    $checkOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -PluginPath $source -PluginsDir $successPlugins | Out-String
    if ($LASTEXITCODE -ne 0 -or $checkOutput -notmatch "same as repository build" -or $checkOutput -notmatch "loads BetterDiscord; BetterDiscord core present" -or $checkOutput -notmatch "OK: BetterDiscord will load") {
        throw "Checker did not confirm the installed build: $checkOutput"
    }
    $shadowPlugins = Join-Path $checkLocalAppData "Packages\Example.App_test\LocalCache\Roaming\BetterDiscord\plugins"
    New-Item -ItemType Directory -Force -Path $shadowPlugins | Out-Null
    Set-Utf8NoBomContent -Path (Join-Path $shadowPlugins "DiscordAITranslator.plugin.js") -Value "/**`n * @version 0.0.1`n */"
    $shadowOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -PluginPath $source -PluginsDir $successPlugins | Out-String
    if ($LASTEXITCODE -ne 0 -or $shadowOutput -notmatch "Private copy:\s+v0\.0\.1" -or $shadowOutput -notmatch "Example\.App_test") {
        throw "Checker did not report the private app copy: $shadowOutput"
    }
    $missingOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -PluginPath $source -PluginsDir $checkLocalAppData | Out-String
    if ($LASTEXITCODE -ne 1 -or $missingOutput -notmatch "Installed plugin:\s+not found") {
        throw "Checker did not fail for a missing plugin: $missingOutput"
    }
    $env:LOCALAPPDATA = $fixtureLocalAppData

    $failureAppData = Join-Path $testRoot "failure-appdata"
    $failurePlugins = Join-Path $failureAppData "BetterDiscord\plugins"
    $validProfile = Join-Path $failureAppData "BetterDiscord\data\a-valid"
    $invalidProfile = Join-Path $failureAppData "BetterDiscord\data\z-invalid"
    New-Item -ItemType Directory -Force -Path $failurePlugins, $validProfile, $invalidProfile | Out-Null
    $failureDestination = Join-Path $failurePlugins "DiscordAITranslator.plugin.js"
    $validProfileJson = Join-Path $validProfile "plugins.json"
    Set-Content -LiteralPath $failureDestination -Value "old plugin" -Encoding ascii
    Set-Content -LiteralPath $validProfileJson -Value "{}" -Encoding utf8
    Set-Content -LiteralPath (Join-Path $invalidProfile "plugins.json") -Value "{invalid json" -Encoding utf8
    $env:APPDATA = $failureAppData
    $failedAsExpected = $false
    try {
        & $installer -PluginPath $source -PluginsDir $failurePlugins | Out-Null
    }
    catch {
        $failedAsExpected = $true
    }
    if (-not $failedAsExpected) {
        throw "Rollback fixture did not fail as expected."
    }
    if (-not (Get-Content -LiteralPath $failureDestination -Raw).StartsWith("old plugin")) {
        throw "Plugin destination was not rolled back."
    }
    $rolledBackState = Get-Content -LiteralPath $validProfileJson -Raw | ConvertFrom-Json
    $rolledBackProperties = @($rolledBackState.PSObject.Properties | Select-Object -ExpandProperty Name)
    if ($rolledBackProperties -contains "DiscordAITranslator") {
        throw "Profile enable state was not rolled back."
    }

    # A failure before replacement must never remove or overwrite an existing
    # destination. Force a backup-name collision deterministically.
    $collisionPlugins = Join-Path $testRoot "backup-collision"
    New-Item -ItemType Directory -Path $collisionPlugins | Out-Null
    $collisionDestination = Join-Path $collisionPlugins "DiscordAITranslator.plugin.js"
    $collisionBackup = "$collisionDestination.bak-fixed-collision"
    Set-Utf8NoBomContent -Path $collisionDestination -Value "preserve existing plugin"
    Set-Utf8NoBomContent -Path $collisionBackup -Value "preserve existing backup"
    function Get-Date { param([string]$Format) return "fixed-collision" }
    try {
        $collisionError = $null
        try { & $installer -PluginPath $source -PluginsDir $collisionPlugins -NoEnable -SkipSyntaxCheck | Out-Null }
        catch { $collisionError = $_ }
        if ($null -eq $collisionError -or $collisionError.ToString() -notlike "*Backup path already exists*") {
            throw "Expected a backup collision before replacement."
        }
        if (-not (Test-Path -LiteralPath $collisionDestination -PathType Leaf)) {
            throw "Backup collision deleted the original plugin before replacement."
        }
        if ((Get-Content -LiteralPath $collisionDestination -Raw) -ne "preserve existing plugin") {
            throw "Backup collision modified the original plugin."
        }
        if ((Get-Content -LiteralPath $collisionBackup -Raw) -ne "preserve existing backup") {
            throw "Backup collision modified the existing backup."
        }
    }
    finally { Remove-Item -LiteralPath Function:\Get-Date }

    # A failed first install, unlike a pre-replacement failure, must remove the
    # file it actually installed when there is no previous plugin to restore.
    $firstInstallPlugins = Join-Path $failureAppData "first-install"
    New-Item -ItemType Directory -Path $firstInstallPlugins | Out-Null
    $firstInstallError = $null
    try { & $installer -PluginPath $source -PluginsDir $firstInstallPlugins -SkipSyntaxCheck | Out-Null }
    catch { $firstInstallError = $_ }
    if ($null -eq $firstInstallError) { throw "First install should fail on the invalid profile fixture." }
    if (Test-Path -LiteralPath (Join-Path $firstInstallPlugins "DiscordAITranslator.plugin.js")) {
        throw "Failed first install left its new plugin behind."
    }

    # A window inside a packaged app (for example an AI desktop app) has its new AppData files
    # redirected to %LOCALAPPDATA%\Packages\<app>\LocalCache\Roaming. The fixture reproduces what the
    # installer then observes: a file written under APPDATA shows up in that package's private copy.
    # Short names keep the installer's temp file under MAX_PATH, which Windows PowerShell 5.1 enforces.
    $redirectLocalAppData = Join-Path $testRoot "rl"
    $redirectPackage = "Ex.Pkg_test"
    $redirectAppData = Join-Path $redirectLocalAppData "Packages\$redirectPackage\LocalCache\Roaming"
    $redirectPlugins = Join-Path $redirectAppData "BetterDiscord\plugins"
    $redirectProfileJson = Join-Path $redirectAppData "BetterDiscord\data\stable\plugins.json"
    $redirectInstalled = Join-Path $redirectPlugins "DiscordAITranslator.plugin.js"
    New-Item -ItemType Directory -Force -Path $redirectPlugins, (Split-Path -Parent $redirectProfileJson), (Join-Path $redirectLocalAppData "Packages\Other.App_test\LocalCache\Roaming") | Out-Null
    Set-Utf8NoBomContent -Path $redirectProfileJson -Value "{}"
    $env:APPDATA = $redirectAppData
    $env:LOCALAPPDATA = $redirectLocalAppData

    foreach ($mode in @("install", "dry-run")) {
        # Assigned directly: an if-expression would unwrap a one-item array into a string, which cannot be splatted.
        $extraArguments = @()
        if ($mode -eq "dry-run") { $extraArguments = @("-WhatIf") }
        # Console hosts wrap long warning lines; compare with whitespace collapsed.
        $blockedOutput = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -PluginPath $source -SkipSyntaxCheck @extraArguments | Out-String) -replace '\s+', ' '
        $blockedExitCode = $LASTEXITCODE
        if ($blockedOutput -notmatch [regex]::Escape($redirectPackage) -or $blockedOutput -notmatch "normally started Discord will not see") {
            throw "Installer did not refuse a redirected AppData window ($mode), exit $($blockedExitCode): $blockedOutput"
        }
        # Exit code 2 (not 1, not a thrown error) tells callers "redirected window, nothing installed" apart from a real failure.
        if ($blockedExitCode -ne 2) {
            throw "Installer refused a redirected AppData window ($mode) with exit $($blockedExitCode); expected exit 2: $blockedOutput"
        }
        if ($blockedOutput -notmatch "-AllowRedirectedAppData" -or $blockedOutput -match "Installed DiscordAITranslator") {
            throw "Refusal must name -AllowRedirectedAppData and must not report an install: $blockedOutput"
        }
        if (Test-Path -LiteralPath $redirectInstalled) {
            throw "Installer wrote the plugin into a redirected AppData window without -AllowRedirectedAppData."
        }
        if ((Get-Content -LiteralPath $redirectProfileJson -Raw) -ne "{}") {
            throw "Installer changed BetterDiscord profile state in a redirected AppData window."
        }
        if (@(Get-ChildItem -LiteralPath $redirectAppData -Filter "dait-redirect-probe-*" -Force).Count) {
            throw "Installer left its AppData redirect probe behind ($mode)."
        }
    }

    $allowedOutput = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -PluginPath $source -SkipSyntaxCheck -AllowRedirectedAppData | Out-String) -replace '\s+', ' '
    if ($LASTEXITCODE -ne 0 -or $allowedOutput -notmatch [regex]::Escape($redirectPackage) -or $allowedOutput -notmatch "normally started Discord will not load it" -or $allowedOutput -notmatch "Installed DiscordAITranslator") {
        throw "-AllowRedirectedAppData did not install into the redirected copy with a warning: $allowedOutput"
    }
    if ((Get-TestSha256 -Path $redirectInstalled) -ne (Get-TestSha256 -Path $source)) {
        throw "-AllowRedirectedAppData installed a plugin with the wrong hash."
    }
    if ((Get-Content -LiteralPath $redirectProfileJson -Raw -Encoding UTF8 | ConvertFrom-Json).DiscordAITranslator -ne $true) {
        throw "-AllowRedirectedAppData did not enable the plugin in the redirected profile."
    }

    # A normal window next to packaged apps: nothing it writes under APPDATA appears in a package.
    $normalAppData = Join-Path $testRoot "normal-appdata"
    $normalPlugins = Join-Path $normalAppData "BetterDiscord\plugins"
    New-Item -ItemType Directory -Force -Path $normalPlugins | Out-Null
    $env:APPDATA = $normalAppData
    $normalOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -PluginPath $source -SkipSyntaxCheck -NoEnable | Out-String
    if ($LASTEXITCODE -ne 0 -or $normalOutput -match "redirected" -or $normalOutput -notmatch "Installed DiscordAITranslator") {
        throw "Installer flagged a normal AppData window as redirected: $normalOutput"
    }
    if ((Get-TestSha256 -Path (Join-Path $normalPlugins "DiscordAITranslator.plugin.js")) -ne (Get-TestSha256 -Path $source)) {
        throw "Installer did not install into a normal AppData window."
    }
    $env:APPDATA = $originalAppData
    $env:LOCALAPPDATA = $fixtureLocalAppData

    Write-Host "Installer verification passed."
}
finally {
    $env:APPDATA = $originalAppData
    $env:LOCALAPPDATA = $originalLocalAppData
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
