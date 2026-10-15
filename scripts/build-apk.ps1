# Сборка APK для Android с «зашитым» адресом сервера — приложение сразу знает, куда подключаться.
# Запуск: powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 [-ServerUrl https://nsrz-parts.ru.tuna.am]
# Без параметра берётся адрес последнего запуска сервера (data\public-url.txt).
param([string]$ServerUrl)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $ServerUrl) { $ServerUrl = (Get-Content (Join-Path $root 'data\public-url.txt') -Raw).Trim() }
if ($ServerUrl -notmatch '^https?://') { throw "Адрес сервера должен начинаться с https://, получено: $ServerUrl" }

$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = 'D:\dev\android-sdk'
$env:Path = "D:\dev\flutter\bin;$env:JAVA_HOME\bin;" + $env:Path

Write-Host "Собираю APK с адресом сервера $ServerUrl…"
Push-Location (Join-Path $root 'mobile')
flutter build apk --release --split-per-abi "--dart-define=API_URL=$ServerUrl"
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'Сборка не удалась' }
Pop-Location

$out = Join-Path $root 'mobile\build\app\outputs\flutter-apk'
$release = Join-Path $root 'release'
New-Item -ItemType Directory -Force $release | Out-Null
Copy-Item (Join-Path $out 'app-arm64-v8a-release.apk') (Join-Path $release 'nsrz-parts.apk') -Force
Copy-Item (Join-Path $out 'app-armeabi-v7a-release.apk') (Join-Path $release 'nsrz-parts-armv7.apk') -Force
Write-Host "Готово: $release\nsrz-parts.apk (адрес сервера: $ServerUrl)" -ForegroundColor Green
