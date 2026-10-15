# Запуск сервера «НСРЗ. Заказ запчастей» на домашнем ПК с доступом из интернета.
# Что делает: PostgreSQL -> миграции -> сервер NestJS -> туннель Cloudflare -> показывает адрес для колледжа.
# Запуск: двойной щелчок по «start-server.cmd» в папке nsrz-app. Окна PostgreSQL, сервера и туннеля не закрывать.

param([switch]$Quiet)  # -Quiet: не открывать браузер и не трогать буфер обмена (для проверки)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$logs = Join-Path $root 'data\logs'
New-Item -ItemType Directory -Force $logs | Out-Null

function Test-Port($port) {
    try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $port); $c.Close(); return $true } catch { return $false }
}
function Wait-Port($port, $seconds, $what) {
    for ($i = 0; $i -lt $seconds; $i++) { if (Test-Port $port) { return } ; Start-Sleep 1 }
    throw "$what не запустился за $seconds с. Смотрите логи в $logs"
}

Write-Host ''
Write-Host '  НСРЗ · Заказ запчастей — запуск сервера' -ForegroundColor DarkYellow
Write-Host ''

# 1. PostgreSQL
if (Test-Port 5432) {
    Write-Host '  [1/4] PostgreSQL уже работает' -ForegroundColor Green
} else {
    Write-Host '  [1/4] Запускаю PostgreSQL 16…'
    Start-Process -FilePath 'node' -ArgumentList 'scripts/postgres.mjs' -WorkingDirectory $backend -WindowStyle Minimized
    Wait-Port 5432 60 'PostgreSQL'
    Start-Sleep 2
    Write-Host '        готово' -ForegroundColor Green
}

# 2. Миграции (безопасно: только применяет новые изменения схемы)
Write-Host '  [2/4] Проверяю схему базы данных…'
Push-Location $backend
cmd /c "npx prisma migrate deploy > ""$logs\migrate.log"" 2>&1"
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Миграции не применились, см. $logs\migrate.log" }
Pop-Location
Write-Host '        готово' -ForegroundColor Green

# 3. Сервер
if (Test-Port 3000) {
    Write-Host '  [3/4] Сервер уже работает на порту 3000' -ForegroundColor Green
} else {
    Write-Host '  [3/4] Запускаю сервер…'
    Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' -WorkingDirectory $backend -WindowStyle Minimized `
        -RedirectStandardOutput (Join-Path $logs 'server.log') -RedirectStandardError (Join-Path $logs 'server-errors.log')
    Wait-Port 3000 60 'Сервер'
    Write-Host '        готово: http://localhost:3000' -ForegroundColor Green
}

# 4. Туннель в интернет (бесплатный, без регистрации; адрес меняется при каждом запуске)
Write-Host '  [4/4] Открываю доступ из интернета (Cloudflare)…'
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) { $cf = 'C:\Program Files (x86)\cloudflared\cloudflared.exe' }
$cfLog = Join-Path $logs 'tunnel.log'
Remove-Item $cfLog -ErrorAction SilentlyContinue
Start-Process -FilePath $cf -ArgumentList 'tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://localhost:3000' `
    -WindowStyle Minimized -RedirectStandardError $cfLog -RedirectStandardOutput (Join-Path $logs 'tunnel-out.log')

$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
    Start-Sleep 1
    if (Test-Path $cfLog) {
        $m = Select-String -Path $cfLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
        if ($m) { $url = $m.Matches[0].Value }
    }
}

Write-Host ''
if ($url) {
    Set-Content -Path (Join-Path $root 'data\public-url.txt') -Value $url -Encoding UTF8
    if (-not $Quiet) { try { Set-Clipboard -Value $url } catch {} }
    Write-Host '  ГОТОВО. Адрес для колледжа (уже скопирован в буфер обмена):' -ForegroundColor Green
    Write-Host ''
    Write-Host "      $url" -ForegroundColor Yellow
    Write-Host ''
    Write-Host "  Сайт судовладельца:  $url"
    Write-Host "  Панель НСРЗ:         $url/panel"
    Write-Host "  Телефон (QR):        $url/app"
    Write-Host "  Документация API:    $url/api/docs"
    Start-Sleep 4
    if (-not $Quiet) { Start-Process $url }
} else {
    Write-Host '  Туннель не дал адрес за минуту. Сайт работает локально: http://localhost:3000' -ForegroundColor Red
    Write-Host "  Лог туннеля: $cfLog"
}
Write-Host ''
Write-Host '  Чтобы остановить сервер — закройте свёрнутые окна node и cloudflared (или перезагрузите ПК).'
Write-Host ''
