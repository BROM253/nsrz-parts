# Выкатка новой версии «НСРЗ. Заказ запчастей» на рабочий сервер (домашний ПК) — этап 6, релиз.
# Порядок: автотесты -> резервная копия базы -> сборка сайта и сервера -> миграции -> перезапуск -> дымовой тест.
# Запуск (PostgreSQL и туннель уже работают, start-server.cmd был запущен):
#   powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1            — полный цикл
#   powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -SkipTests — без автотестов (срочное исправление)
param([switch]$SkipTests)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$logs = Join-Path $root 'data\logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$version = (Get-Content (Join-Path $backend 'package.json') -Raw | ConvertFrom-Json).version

function Step($n, $text) { Write-Host "`n[$n/6] $text" -ForegroundColor Cyan }
function Run($what, $cmd, $dir, $log) {
    Push-Location $dir
    cmd /c "$cmd > ""$logs\$log"" 2>&1"
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { throw "$what — ошибка, см. $logs\$log" }
}

Write-Host "Выкатка версии $version" -ForegroundColor Green

Step 1 'Автотесты сервера'
if ($SkipTests) { Write-Host '  пропущено (-SkipTests)' } else { Run 'Автотесты' 'npm test' $backend 'deploy-tests.log'; Write-Host '  все тесты пройдены' }

Step 2 'Резервная копия рабочей базы (точка отката)'
Run 'Резервная копия' 'npm run -s db:backup' $backend 'deploy-backup.log'
Get-Content "$logs\deploy-backup.log" -Tail 1 -Encoding UTF8

# плановые работы: окно выкатки не считается простоем в мониторинге доступности (как в SLA)
$monDir = Join-Path $root 'data\monitoring'
New-Item -ItemType Directory -Force $monDir | Out-Null
function Maintenance($what) {
    $line = '{"event":"' + $what + '","at":"' + (Get-Date).ToUniversalTime().ToString('o') + '","version":"' + $version + '"}'
    Add-Content -Path (Join-Path $monDir 'maintenance.jsonl') -Encoding ASCII -Value $line
}

Step 3 'Сборка сайта и сервера'
Run 'Сборка сайта' 'npm run build' (Join-Path $root 'web') 'deploy-web.log'
$server = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'dist[\\/]main\.js' -and $_.CommandLine -notmatch 'dist-qa' }
Maintenance 'start'
if ($server) { $server | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Start-Sleep -Milliseconds 800; Write-Host '  рабочий сервер остановлен' }
Run 'Клиент базы данных' 'npx prisma generate' $backend 'deploy-generate.log'
Run 'Сборка сервера' 'npx nest build' $backend 'deploy-build.log'

Step 4 'Миграции базы данных'
Run 'Миграции' 'npx prisma migrate deploy' $backend 'deploy-migrate.log'

Step 5 'Запуск сервера'
Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' -WorkingDirectory $backend -WindowStyle Minimized `
    -RedirectStandardOutput (Join-Path $logs 'server.log') -RedirectStandardError (Join-Path $logs 'server-errors.log')
$health = $null
for ($i = 0; $i -lt 60 -and -not $health; $i++) {
    Start-Sleep -Milliseconds 500
    try { $health = Invoke-RestMethod -Uri 'http://localhost:3000/api/health' -TimeoutSec 2 } catch {}
}
if (-not $health) { throw "Сервер не запустился, см. $logs\server-errors.log" }
Maintenance 'end'
Write-Host "  сервер работает: версия $($health.version), база $($health.db)"

Step 6 'Дымовой тест через интернет'
Push-Location (Join-Path $root 'qa')
cmd /c "node smoke\smoke.mjs"
$smoke = $LASTEXITCODE
Pop-Location
if ($smoke -ne 0) {
    Write-Host "`nДымовой тест НЕ пройден. Откат: git checkout <прошлая версия>, затем этот же скрипт;" -ForegroundColor Red
    Write-Host 'если пострадали данные: cd backend; npm run db:restore -- <копия из шага 2> --db nsrz --yes' -ForegroundColor Red
    exit 1
}
Write-Host "`nВерсия $version выкачена и проверена." -ForegroundColor Green
