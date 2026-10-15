# Запуск сервера «НСРЗ. Заказ запчастей» на домашнем ПК с доступом из интернета.
# Что делает: PostgreSQL -> миграции -> сервер NestJS -> туннель в интернет -> проверяет адрес снаружи и показывает его.
# Запуск: двойной щелчок по «start-server.cmd» в папке nsrz-app. Свёрнутые окна не закрывать.
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
    for ($i = 0; $i -lt $seconds; $i++) { if (Test-Port $port) { return }; Start-Sleep 1 }
    throw "$what не запустился за $seconds с. Смотрите логи в $logs"
}
function Test-Public($url) {
    try { return (Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 15).status -eq 'ok' } catch { return $false }
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

# 4. Туннель в интернет. Все варианты бесплатные и без регистрации, адрес меняется при каждом запуске.
#    Пробуем по очереди и берём первый, который реально открывается снаружи (проверка дважды, с паузой):
#      tuna         — российский, открывается без VPN, постоянный адрес (нужна регистрация и tuna login);
#      Cloudflare   — самый быстрый, но провайдеры и VPN иногда режут соединения с ним;
#      tunnelmole   — без страниц-предупреждений, средняя скорость;
#      localhost.run — через SSH, медленнее;
#      serveo       — через SSH, при первом открытии в браузере показывает страницу «Warning» (нажать кнопку).
Write-Host '  [4/4] Открываю доступ из интернета…'
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) { $cf = 'C:\Program Files (x86)\cloudflared\cloudflared.exe' }
$ssh = 'C:\Windows\System32\OpenSSH\ssh.exe'
$sshArgs = @('-T', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ServerAliveInterval=30', '-o', 'ExitOnForwardFailure=yes', '-R', '80:localhost:3000')

# tuna.am — российский сервис: открывается без VPN, бесплатный постоянный поддомен (адрес не меняется).
# Поддомен задаётся один раз в файле data\tuna-subdomain.txt (например: your-subdomain) — адрес будет https://<поддомен>.a.tuna.free
$tunaExe = (Get-Command tuna -ErrorAction SilentlyContinue).Source
if (-not $tunaExe) { $tunaExe = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\tuna.exe' }
$tunaArgs = @('http', '3000')
$subFile = Join-Path $root 'data\tuna-subdomain.txt'
if (Test-Path $subFile) {
    # можно записать и просто имя, и полный адрес — берём только имя поддомена
    $sub = ((Get-Content $subFile -Raw).Trim() -replace '^https?://', '').Split('.')[0]
    if ($sub) { $tunaArgs += "--subdomain=$sub" }
}

$providers = @(
    @{ Name = 'tuna';          File = $tunaExe; Args = $tunaArgs; Pattern = 'https://[a-z0-9.-]+\.tuna\.(am|free)'; Stream = 'both' },
    @{ Name = 'Cloudflare';   File = $cf;  Args = @('tunnel', '--no-autoupdate', '--url', 'http://localhost:3000'); Pattern = 'https://[a-z0-9-]+\.trycloudflare\.com'; Stream = 'err' },
    @{ Name = 'tunnelmole';    File = (Join-Path $PSScriptRoot 'node_modules\.bin\tunnelmole.cmd'); Args = @('3000'); Pattern = 'https://[a-z0-9.-]+\.tunnelmole\.net'; Stream = 'out' },
    @{ Name = 'localhost.run'; File = $ssh; Args = $sshArgs + @('nokey@localhost.run'); Pattern = 'https://[a-z0-9]+\.lhr\.life'; Stream = 'out' },
    @{ Name = 'serveo';        File = $ssh; Args = $sshArgs + @('serveo.net'); Pattern = 'https://[a-z0-9.-]+\.serveousercontent\.com'; Stream = 'out' }
)

# старые туннели от прошлого запуска
Get-Process cloudflared, tuna -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='ssh.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'tunnelmole|localhost\.run|serveo\.net' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$url = $null
$provider = $null
foreach ($p in $providers) {
    if (-not (Test-Path $p.File)) { continue }
    Write-Host "        пробую $($p.Name)…"
    $out = Join-Path $logs "tunnel-$($p.Name).out.log"
    $err = Join-Path $logs "tunnel-$($p.Name).err.log"
    Remove-Item $out, $err -ErrorAction SilentlyContinue
    $proc = Start-Process -FilePath $p.File -ArgumentList $p.Args -WindowStyle Minimized -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
    $log = if ($p.Stream -eq 'err') { $err } else { $out }

    $candidate = $null
    for ($i = 0; $i -lt 45 -and -not $candidate; $i++) {
        Start-Sleep 1
        $text = if ($p.Stream -eq 'both') { (Get-Content $out -Raw -ErrorAction SilentlyContinue) + (Get-Content $err -Raw -ErrorAction SilentlyContinue) } else { Get-Content $log -Raw -ErrorAction SilentlyContinue }
        if ($text -and $text -match $p.Pattern) { $candidate = $Matches[0] }
    }
    if ($candidate) {
        # адрес должен открываться снаружи и не отваливаться через несколько секунд
        $ok = $false
        for ($j = 0; $j -lt 6 -and -not $ok; $j++) { if (Test-Public $candidate) { $ok = $true } else { Start-Sleep 5 } }
        if ($ok) { Start-Sleep 10; $ok = Test-Public $candidate }
        if ($ok) { $url = $candidate; $provider = $p.Name; break }
    }
    Write-Host "        $($p.Name) не подошёл" -ForegroundColor DarkYellow
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

Write-Host ''
if ($url) {
    Set-Content -Path (Join-Path $root 'data\public-url.txt') -Value $url -Encoding ASCII
    if (-not $Quiet) { try { Set-Clipboard -Value $url } catch {} }
    Write-Host "  ГОТОВО ($provider). Адрес для колледжа (скопирован в буфер обмена):" -ForegroundColor Green
    Write-Host ''
    Write-Host "      $url" -ForegroundColor Yellow
    Write-Host ''
    Write-Host "  Сайт судовладельца:  $url"
    Write-Host "  Панель НСРЗ:         $url/panel"
    Write-Host "  Телефон (QR):        $url/app"
    Write-Host "  Документация API:    $url/api/docs"
    if ($provider -eq 'serveo') { Write-Host '  serveo: при первом открытии в браузере нажмите кнопку на странице «Serveo - Warning».' -ForegroundColor DarkYellow }
    if (-not $Quiet) { Start-Sleep 3; Start-Process $url }
} else {
    Write-Host '  Ни один туннель не поднялся. Сайт работает на этом ПК: http://localhost:3000' -ForegroundColor Red
    Write-Host '  Что попробовать: включить или выключить VPN и запустить ещё раз; логи — data\logs\tunnel-*.log'
}
Write-Host ''
Write-Host '  Чтобы остановить сервер — закройте свёрнутые окна (node, cloudflared, ssh) или перезагрузите ПК.'
Write-Host ''
