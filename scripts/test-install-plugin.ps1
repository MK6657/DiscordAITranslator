[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# The assertions also use Get-FileHash; do not rely on a caller's loaded modules.
Import-Module Microsoft.PowerShell.Utility -ErrorAction Stop

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
try {
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
    if ((Get-FileHash -LiteralPath $installed -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash) {
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

    Write-Host "Installer verification passed."
}
finally {
    $env:APPDATA = $originalAppData
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
