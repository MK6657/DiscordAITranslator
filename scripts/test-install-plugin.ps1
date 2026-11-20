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

    $defaultFixtureAppData = Join-Path $testRoot "r05-default-appdata"
    $otherFixtureAppData = Join-Path $testRoot "r05-other-appdata"
    $defaultFixtureProfile = Join-Path $defaultFixtureAppData "BetterDiscord\data\stable"
    $otherFixturePlugins = Join-Path $otherFixtureAppData "BetterDiscord\plugins"
    $otherFixtureProfile = Join-Path $otherFixtureAppData "BetterDiscord\data\stable"
    $explicitFixtureProfile = Join-Path $testRoot "r05-explicit-profile"
    New-Item -ItemType Directory -Force -Path $defaultFixtureProfile, $otherFixturePlugins, $otherFixtureProfile, $explicitFixtureProfile | Out-Null
    $defaultFixtureJson = Join-Path $defaultFixtureProfile "plugins.json"
    $otherFixtureJson = Join-Path $otherFixtureProfile "plugins.json"
    $explicitFixtureJson = Join-Path $explicitFixtureProfile "plugins.json"
    Set-Utf8NoBomContent -Path $defaultFixtureJson -Value '{"DiscordAITranslator":false,"Unrelated":true}'
    Set-Utf8NoBomContent -Path $otherFixtureJson -Value '{"DiscordAITranslator":false,"Unrelated":false}'
    Set-Utf8NoBomContent -Path $explicitFixtureJson -Value '{"R05 Fixture Translator":false,"Unrelated":true}'
    $defaultFixtureHash = Get-TestSha256 -Path $defaultFixtureJson
    $renamedDownload = Join-Path $testRoot "renamed download.plugin.js"
    [System.IO.File]::Copy($source, $renamedDownload)
    $env:APPDATA = $defaultFixtureAppData

    & $installer -PluginPath $renamedDownload -PluginsDir $otherFixturePlugins -SkipSyntaxCheck | Out-Null
    $otherInstalled = Join-Path $otherFixturePlugins "DiscordAITranslator.plugin.js"
    $otherEnabled = Get-Content -LiteralPath $otherFixtureJson -Raw -Encoding UTF8 | ConvertFrom-Json
    if ((Get-TestSha256 -Path $otherInstalled) -ne (Get-TestSha256 -Path $renamedDownload) -or
        (Test-Path -LiteralPath (Join-Path $otherFixturePlugins "renamed download.plugin.js")) -or
        $otherEnabled.DiscordAITranslator -ne $true -or $otherEnabled.Unrelated -ne $false -or
        (Get-TestSha256 -Path $defaultFixtureJson) -ne $defaultFixtureHash) {
        throw "R05 renamed artifact installs under the fixed name and enables only its sibling profile failed."
    }

    $otherFixtureHash = Get-TestSha256 -Path $otherFixtureJson
    $metadataFixture = Join-Path $testRoot "metadata fixture.plugin.js"
    Set-Utf8NoBomContent -Path $metadataFixture -Value "/**`n * @name R05 Fixture Translator`n * @version 0.0.1`n */`nmodule.exports = class FixturePlugin {};"
    & $installer -PluginPath $metadataFixture -PluginsDir $otherFixturePlugins -ProfileDir $explicitFixtureProfile -SkipSyntaxCheck | Out-Null
    $explicitEnabled = Get-Content -LiteralPath $explicitFixtureJson -Raw -Encoding UTF8 | ConvertFrom-Json
    $metadataKey = $explicitEnabled.PSObject.Properties["R05 Fixture Translator"]
    if ((Get-TestSha256 -Path $otherInstalled) -ne (Get-TestSha256 -Path $metadataFixture) -or
        -not $metadataKey -or $metadataKey.Value -ne $true -or $explicitEnabled.Unrelated -ne $true -or
        $explicitEnabled.PSObject.Properties["DiscordAITranslator"] -or
        (Get-TestSha256 -Path $otherFixtureJson) -ne $otherFixtureHash -or
        (Get-TestSha256 -Path $defaultFixtureJson) -ne $defaultFixtureHash) {
        throw "R05 an explicit profile uses the plugin metadata name and preserves both AppData profiles failed."
    }
    Write-Host "R05 fixture checks passed (renamed artifact and explicit profile)."
    $env:APPDATA = $successAppData

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
    if ($LASTEXITCODE -ne 0) {
        throw "The default checker should still pass the hash check without a hook: $unhookedOutput"
    }
    $strictUnhookedOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -PluginPath $source -PluginsDir $successPlugins -Strict | Out-String
    if ($LASTEXITCODE -ne 1 -or $strictUnhookedOutput -notmatch "same as repository build" -or $strictUnhookedOutput -notmatch "does NOT load BetterDiscord" -or $strictUnhookedOutput -match "OK: BetterDiscord will load") {
        throw "The strict checker did not fail for a matching plugin in the only, unhooked Discord app: $strictUnhookedOutput"
    }
    Set-Utf8NoBomContent -Path (Join-Path $discordCore "index.js") -Value "require('BetterDiscord/data/betterdiscord.asar');`nmodule.exports = require('./core.asar');"
    $checkOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -PluginPath $source -PluginsDir $successPlugins | Out-String
    if ($LASTEXITCODE -ne 0 -or $checkOutput -notmatch "same as repository build" -or $checkOutput -notmatch "loads BetterDiscord; BetterDiscord core present" -or $checkOutput -notmatch "OK: BetterDiscord will load") {
        throw "Checker did not confirm the installed build: $checkOutput"
    }
    # BetterDiscord 1.14+ hooks resources\app\index.js rather than discord_desktop_core\index.js.
    Set-Utf8NoBomContent -Path (Join-Path $discordCore "index.js") -Value "module.exports = require('./core.asar');"
    $discordResourcesApp = Join-Path $checkLocalAppData "Discord\app-1.0.9999\resources\app"
    New-Item -ItemType Directory -Force -Path $discordResourcesApp | Out-Null
    Set-Utf8NoBomContent -Path (Join-Path $discordResourcesApp "index.js") -Value "require('BetterDiscord/data/betterdiscord.asar');`nrequire('../betterdiscord.app.asar');"
    $missingAppAsarOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -PluginPath $source -PluginsDir $successPlugins -Strict | Out-String
    if ($LASTEXITCODE -ne 1 -or $missingAppAsarOutput -notmatch "same as repository build" -or $missingAppAsarOutput -notmatch "incomplete resources/app hook" -or $missingAppAsarOutput -match "OK: BetterDiscord will load") {
        throw "The strict checker accepted a resources/app hook without the original Discord archive: $missingAppAsarOutput"
    }
    Set-Utf8NoBomContent -Path (Join-Path (Split-Path -Parent $discordResourcesApp) "betterdiscord.app.asar") -Value "preserved Discord app"
    $bd114Output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -PluginPath $source -PluginsDir $successPlugins | Out-String
    if ($LASTEXITCODE -ne 0 -or $bd114Output -notmatch "loads BetterDiscord; BetterDiscord core present \(resources/app hook \(BD 1\.14\+\)\)" -or $bd114Output -notmatch "OK: BetterDiscord will load") {
        throw "Checker did not confirm BetterDiscord 1.14+ resources/app hook: $bd114Output"
    }

    $profileBeforeCheck = Get-Content -LiteralPath $successProfileJson -Raw -Encoding UTF8
    Set-Utf8NoBomContent -Path $successProfileJson -Value '{"DiscordAITranslator":false,"DiscordAITranslator.plugin.js":true}'
    $disabledOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -PluginPath $source -PluginsDir $successPlugins -Strict | Out-String
    if ($LASTEXITCODE -ne 1 -or $disabledOutput -notmatch "same as repository build" -or $disabledOutput -notmatch "Profile \(stable\): DiscordAITranslator - disabled" -or $disabledOutput -match "OK: BetterDiscord will load") {
        throw "The strict checker did not fail for a disabled plugin: $disabledOutput"
    }
    Set-Utf8NoBomContent -Path $successProfileJson -Value $profileBeforeCheck

    $resourcesEntry = Join-Path $discordResourcesApp "index.js"
    $commentedHooks = @(
        "  // require('BetterDiscord/data/betterdiscord.asar');",
        "/*`n  require('BetterDiscord/data/betterdiscord.asar');`n*/",
        'const example = "require(''BetterDiscord/data/betterdiscord.asar'')";'
    )
    foreach ($commentedHook in $commentedHooks) {
        Set-Utf8NoBomContent -Path $resourcesEntry -Value "$commentedHook`nmodule.exports = require('../betterdiscord.app.asar');"
        $commentOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -PluginPath $source -PluginsDir $successPlugins -Strict | Out-String
        if ($LASTEXITCODE -ne 1 -or $commentOutput -notmatch "same as repository build" -or $commentOutput -notmatch "does NOT load BetterDiscord" -or $commentOutput -match "OK: BetterDiscord will load") {
            throw "The strict checker counted inactive text as a startup hook: $commentOutput"
        }
    }

    $installerHook = @'
const path = require("path");
const userConfig = process.env.APPDATA;
require(path.join(userConfig, "BetterDiscord", "data", "betterdiscord.asar")); // loads the BetterDiscord core
module.exports = require("../betterdiscord.app.asar");
'@
    Set-Utf8NoBomContent -Path $resourcesEntry -Value $installerHook
    $strictHookedOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -PluginPath $source -PluginsDir $successPlugins -Strict | Out-String
    if ($LASTEXITCODE -ne 0 -or $strictHookedOutput -notmatch "Profile \(stable\): DiscordAITranslator - enabled" -or $strictHookedOutput -notmatch "OK: BetterDiscord will load") {
        throw "The strict checker did not confirm the installer-style resources/app hook: $strictHookedOutput"
    }

    $newerResources = Join-Path $checkLocalAppData "Discord\app-1.0.10000\resources"
    New-Item -ItemType Directory -Force -Path $newerResources | Out-Null
    Set-Utf8NoBomContent -Path (Join-Path $newerResources "app.asar") -Value "unmodified app"
    $higherVersionOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -PluginPath $source -PluginsDir $successPlugins -Strict | Out-String
    if ($LASTEXITCODE -ne 1 -or $higherVersionOutput -notmatch "same as repository build" -or $higherVersionOutput -notmatch "Discord app:\s+app-1\.0\.10000" -or $higherVersionOutput -notmatch "does NOT load BetterDiscord" -or $higherVersionOutput -match "OK: BetterDiscord will load") {
        throw "The strict checker did not select the newer unhooked Discord app: $higherVersionOutput"
    }

    $checkerCustomRoot = Join-Path $testRoot "checker-custom\BetterDiscord"
    $checkerCustomPlugins = Join-Path $checkerCustomRoot "plugins"
    $checkerCustomStable = Join-Path $checkerCustomRoot "data\stable"
    $checkerCustomCanary = Join-Path $checkerCustomRoot "data\canary"
    $checkerCanaryCore = Join-Path $checkLocalAppData "DiscordCanary\app-1.0.27\modules\discord_desktop_core-1\discord_desktop_core"
    New-Item -ItemType Directory -Force -Path $checkerCustomPlugins, $checkerCustomStable, $checkerCustomCanary, $checkerCanaryCore | Out-Null
    $checkerCustomSource = Join-Path $testRoot "checker-renamed.plugin.js"
    Set-Utf8NoBomContent -Path $checkerCustomSource -Value "/**`n * @name Checker Test Plugin`n * @version 1.0.0`n */`nmodule.exports = class {};"
    Copy-Item -LiteralPath $checkerCustomSource -Destination (Join-Path $checkerCustomPlugins "DiscordAITranslator.plugin.js")
    Set-Utf8NoBomContent -Path (Join-Path $checkerCustomRoot "data\betterdiscord.asar") -Value "asar"
    Set-Utf8NoBomContent -Path (Join-Path $checkerCustomStable "plugins.json") -Value '{"Checker Test Plugin":"false","DiscordAITranslator":true}'
    Set-Utf8NoBomContent -Path (Join-Path $checkerCustomCanary "plugins.json") -Value '{"Checker Test Plugin":true,"DiscordAITranslator":false}'
    $checkerCustomAsar = (Join-Path $checkerCustomRoot "data\betterdiscord.asar") | ConvertTo-Json -Compress
    Set-Utf8NoBomContent -Path (Join-Path $checkerCanaryCore "index.js") -Value "require($checkerCustomAsar);`nmodule.exports = require('./core.asar');"
    $customStableOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -PluginPath $checkerCustomSource -PluginsDir $checkerCustomPlugins -Strict | Out-String
    if ($LASTEXITCODE -ne 1 -or $customStableOutput -notmatch "Profile \(stable\): Checker Test Plugin - invalid enable value" -or $customStableOutput -match "OK: BetterDiscord will load") {
        throw "The checker did not verify the metadata key and boolean value in the custom Stable profile: $customStableOutput"
    }
    $customCanaryOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -PluginPath $checkerCustomSource -PluginsDir $checkerCustomPlugins -ProfileDir $checkerCustomCanary -Strict | Out-String
    if ($LASTEXITCODE -ne 0 -or $customCanaryOutput -notmatch "Profile \(canary\): Checker Test Plugin - enabled" -or $customCanaryOutput -notmatch "Discord app:\s+app-1\.0\.27 \(Discord Canary\)" -or $customCanaryOutput -notmatch "OK: BetterDiscord will load") {
        throw "The strict checker did not use the explicit Canary profile and its startup hook: $customCanaryOutput"
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
    try { & $installer -PluginPath $source -PluginsDir $firstInstallPlugins -ProfileDir $invalidProfile -SkipSyntaxCheck | Out-Null }
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
    $env:LOCALAPPDATA = $fixtureLocalAppData

    foreach ($commitCase in @("locked-stage", "locked-destination", "first-install-race")) {
        & {
            $env:APPDATA = Join-Path $testRoot $commitCase
            $commitPlugins = Join-Path $env:APPDATA "BetterDiscord\plugins"
            $commitDestination = Join-Path $commitPlugins "DiscordAITranslator.plugin.js"
            New-Item -ItemType Directory -Force -Path $commitPlugins | Out-Null
            $commitFixture = @{ Lock = $null; ExpectedHash = "" }
            if ($commitCase -ne "first-install-race") {
                Set-Utf8NoBomContent -Path $commitDestination -Value "original plugin before locked replacement"
                $commitFixture.ExpectedHash = Get-TestSha256 -Path $commitDestination
            }

            function Copy-Item {
                [CmdletBinding()]
                param([string]$LiteralPath, [string]$Destination)
                Microsoft.PowerShell.Management\Copy-Item @PSBoundParameters
                if ($Destination.StartsWith("$commitDestination.tmp-", [System.StringComparison]::OrdinalIgnoreCase)) {
                    if ($commitCase -eq "locked-stage") {
                        $commitFixture.Lock = [System.IO.File]::Open($Destination, "Open", "Read", "Read")
                    }
                    elseif ($commitCase -eq "locked-destination") {
                        $commitFixture.Lock = [System.IO.File]::Open($commitDestination, "Open", "Read", "Read")
                    }
                    else {
                        Set-Utf8NoBomContent -Path $commitDestination -Value "concurrent first installer"
                        $commitFixture.ExpectedHash = Get-TestSha256 -Path $commitDestination
                    }
                }
            }
            $commitError = $null
            try { & $installer -PluginPath $source -PluginsDir $commitPlugins -SkipSyntaxCheck -NoEnable | Out-Null }
            catch { $commitError = $_ }
            finally { if ($commitFixture.Lock) { $commitFixture.Lock.Dispose() } }

            if ($null -eq $commitError) { throw "Expected installation to fail ($commitCase)." }
            $errorCode = $commitError.Exception.GetBaseException().HResult -band 0xffff
            if (($commitCase -ne "first-install-race" -and $errorCode -ne 32) -or
                ($commitCase -eq "first-install-race" -and $errorCode -notin (80, 183))) {
                throw "Installation failed for an unexpected reason ($commitCase): $commitError"
            }
            if (-not (Test-Path -LiteralPath $commitDestination -PathType Leaf) -or
                (Get-TestSha256 -Path $commitDestination) -ne $commitFixture.ExpectedHash) {
                throw "Failed installation removed or modified the existing destination ($commitCase)."
            }
        }
    }
    Write-Host "R01 fixture checks passed (locked-stage, locked-destination and first-install-race)."

    foreach ($rollbackCase in @("concurrent", "changed-plugin-key", "short-lock", "persistent-lock")) {
        & {
            $env:APPDATA = Join-Path $testRoot $rollbackCase
            $rollbackPlugins = Join-Path $env:APPDATA "BetterDiscord\plugins"
            $rollbackDestination = Join-Path $rollbackPlugins "DiscordAITranslator.plugin.js"
            $rollbackProfile = Join-Path $env:APPDATA "BetterDiscord\data\a\plugins.json"
            $badProfile = Join-Path $env:APPDATA "BetterDiscord\data\z\plugins.json"
            New-Item -ItemType Directory -Force -Path $rollbackPlugins, (Split-Path -Parent $rollbackProfile), (Split-Path -Parent $badProfile) | Out-Null
            $badJson = '{"transaction rollback fixture":'
            $initialJson = if ($rollbackCase -eq "changed-plugin-key") { '{"OtherPlugin":false}' } else { '{"DiscordAITranslator":false,"OtherPlugin":false}' }
            Set-Utf8NoBomContent -Path $rollbackProfile -Value $initialJson
            Set-Utf8NoBomContent -Path $badProfile -Value $badJson
            Set-Utf8NoBomContent -Path $rollbackDestination -Value "plugin before the transaction"
            $oldDestinationHash = Get-TestSha256 -Path $rollbackDestination
            $oldProfileHash = Get-TestSha256 -Path $rollbackProfile
            $expectedFailure = $null
            try { Microsoft.PowerShell.Utility\ConvertFrom-Json -InputObject $badJson -ErrorAction Stop | Out-Null }
            catch { $expectedFailure = $_.Exception.Message }
            $rollbackFixture = @{
                Locks = [System.Collections.Generic.Queue[System.IDisposable]]::new()
                Releases = 0
                Warnings = [System.Collections.Generic.List[string]]::new()
                ConcurrentDestinationHash = ""
            }

            function ConvertFrom-Json {
                [CmdletBinding()]
                param([string]$InputObject)
                if ($InputObject -ceq $badJson) {
                    $committed = Microsoft.PowerShell.Utility\ConvertFrom-Json -InputObject ([System.IO.File]::ReadAllText($rollbackProfile))
                    if ($committed.DiscordAITranslator -ne $true -or (Get-TestSha256 -Path $rollbackDestination) -ne (Get-TestSha256 -Path $source)) {
                        throw "The transaction did not commit both files before the invalid profile."
                    }
                    $pluginFlag = if ($rollbackCase -eq "changed-plugin-key") { "false" } else { "true" }
                    Set-Utf8NoBomContent -Path $rollbackProfile -Value "{`"DiscordAITranslator`":$pluginFlag,`"OtherPlugin`":true,`"NewPlugin`":true}"
                    if ($rollbackCase -eq "concurrent") {
                        Set-Utf8NoBomContent -Path $rollbackDestination -Value "independent destination edit"
                        $rollbackFixture.ConcurrentDestinationHash = Get-TestSha256 -Path $rollbackDestination
                    }
                    if ($rollbackCase -in ("short-lock", "persistent-lock")) {
                        $rollbackFixture.Locks.Enqueue([System.IO.File]::Open($rollbackProfile, "Open", "Read", "Read"))
                        $rollbackFixture.Locks.Enqueue([System.IO.File]::Open($rollbackDestination, "Open", "Read", "Read"))
                    }
                }
                Microsoft.PowerShell.Utility\ConvertFrom-Json @PSBoundParameters
            }

            function Start-Sleep {
                [CmdletBinding()]
                param([int]$Milliseconds)
                if ($rollbackCase -eq "short-lock" -and $rollbackFixture.Locks.Count) {
                    $rollbackFixture.Locks.Dequeue().Dispose()
                    $rollbackFixture.Releases++
                    return
                }
                Microsoft.PowerShell.Utility\Start-Sleep @PSBoundParameters
            }

            $rollbackError = $null
            try {
                & $installer -PluginPath $source -PluginsDir $rollbackPlugins -SkipSyntaxCheck 3>&1 | ForEach-Object {
                    if ($_ -is [System.Management.Automation.WarningRecord]) { $rollbackFixture.Warnings.Add($_.Message) }
                }
            }
            catch { $rollbackError = $_ }
            finally {
                while ($rollbackFixture.Locks.Count) { $rollbackFixture.Locks.Dequeue().Dispose() }
            }

            if (-not $expectedFailure -or $null -eq $rollbackError -or $rollbackError.Exception.Message -cne $expectedFailure) {
                throw "Rollback did not preserve the original JSON error ($rollbackCase): $rollbackError"
            }
            $state = Microsoft.PowerShell.Utility\ConvertFrom-Json -InputObject ([System.IO.File]::ReadAllText($rollbackProfile))
            if ($state.OtherPlugin -ne $true -or $state.NewPlugin -ne $true) {
                throw "Rollback clobbered an unrelated profile change ($rollbackCase)."
            }
            $profileBackups = @(Get-ChildItem -LiteralPath (Split-Path -Parent $rollbackProfile) -Filter "plugins.json.bak-enable-*")
            $pluginBackups = @(Get-ChildItem -LiteralPath $rollbackPlugins -Filter "DiscordAITranslator.plugin.js.bak-*")
            if ($profileBackups.Count -ne 1 -or (Get-TestSha256 -Path $profileBackups[0].FullName) -ne $oldProfileHash -or
                $pluginBackups.Count -ne 1 -or (Get-TestSha256 -Path $pluginBackups[0].FullName) -ne $oldDestinationHash) {
                throw "Rollback did not retain the original backups ($rollbackCase)."
            }
            $warnings = $rollbackFixture.Warnings -join "`n"
            if ($rollbackCase -eq "persistent-lock") {
                if ($state.DiscordAITranslator -ne $true -or (Get-TestSha256 -Path $rollbackDestination) -ne (Get-TestSha256 -Path $source) -or
                    $warnings -notmatch "Profile rollback failed" -or $warnings -notmatch "Plugin rollback failed" -or
                    $warnings -notmatch [regex]::Escape($profileBackups[0].FullName) -or $warnings -notmatch [regex]::Escape($pluginBackups[0].FullName)) {
                    throw "Persistent locks must leave the committed files and report both recovery backups: $warnings"
                }
            }
            else {
                $expectedHash = if ($rollbackCase -eq "concurrent") { $rollbackFixture.ConcurrentDestinationHash } else { $oldDestinationHash }
                if ($state.DiscordAITranslator -ne $false -or (Get-TestSha256 -Path $rollbackDestination) -ne $expectedHash -or
                    $warnings -notmatch "Profile changed after enable" -or $warnings -match "rollback failed") {
                    throw "Rollback did not preserve its own and external changes correctly ($rollbackCase): $warnings"
                }
                if ($rollbackCase -eq "short-lock" -and $rollbackFixture.Releases -ne 2) {
                    throw "Transient locks did not exercise retries on both files."
                }
            }
        }
    }

    $env:APPDATA = $originalAppData
    Write-Host "Installer verification passed."
}
finally {
    $env:APPDATA = $originalAppData
    $env:LOCALAPPDATA = $originalLocalAppData
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
