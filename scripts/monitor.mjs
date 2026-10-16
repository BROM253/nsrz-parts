// Сторож доступности (этап 7, мониторинг): раз в минуту проверяет сервер на этом ПК и адрес в интернете (туннель).
// Пишет журнал проверок data\monitoring\uptime-ГГГГ-ММ-ДД.jsonl и инциденты data\monitoring\incidents.jsonl —
// их показывает страница «Мониторинг» в панели НСРЗ (доступность в рабочее время, ТЗ п. 4.4: не ниже 99 %).
// Запускается из start-server.cmd; вручную: node scripts/monitor.mjs
import { execFile } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { networkInterfaces } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data', 'monitoring');
mkdirSync(dir, { recursive: true });
const LOCAL = process.env.LOCAL_URL ?? 'http://localhost:3000';
const EVERY_MS = Number(process.env.MONITOR_EVERY_MS ?? 60_000);
const DOWN_AFTER = 3; // подряд неудачных проверок — это инцидент, а не случайный сбой сети

function publicUrl() {
  const f = join(root, 'data', 'public-url.txt');
  return existsSync(f) ? readFileSync(f, 'utf8').replace(/^﻿/, '').trim() || null : null;
}

/** Адрес ПК в домашней сети: через него проверка адреса в интернете идёт мимо VPN, как у телефона без VPN. */
function lanAddress() {
  return Object.entries(networkInterfaces())
    .filter(([name]) => !/tun|tap|vpn|happ|wireguard|vethernet|loopback/i.test(name))
    .flatMap(([, list]) => list ?? [])
    .find((a) => a.family === 'IPv4' && !a.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address))?.address;
}

/** Проверка адреса в интернете — curl с привязкой к домашней сети (Node на этом ПК ходит только через VPN и не успевает). */
function probePublic(url, timeoutSec) {
  return new Promise((resolve) => {
    const lan = lanAddress();
    const args = ['-s', '-o', process.platform === 'win32' ? 'NUL' : '/dev/null', '-w', '%{http_code} %{time_total}', '--max-time', String(timeoutSec), '-A', 'nsrz-monitor/1.0', ...(lan ? ['--interface', lan] : []), `${url}/api/health`];
    execFile('curl', args, { windowsHide: true }, (err, stdout) => {
      const [code, total] = String(stdout).trim().split(' ');
      const status = Number(code);
      resolve({ ok: !err && status === 200, ms: Math.round(Number(total || 0) * 1000), status, ...(lan ? { via: 'lan' } : {}) });
    });
  });
}

async function probe(url, timeoutMs) {
  const started = Date.now();
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'nsrz-monitor/1.0' } });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok && body.status === 'ok', ms: Date.now() - started, status: res.status };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, error: String(e.cause?.code ?? e.name ?? e) };
  }
}

const state = { local: { fails: 0, since: null }, public: { fails: 0, since: null } };

function track(kind, result, at) {
  const s = state[kind];
  if (!result) return;
  if (!result.ok) {
    s.fails++;
    if (s.fails === 1) s.since = at;
    if (s.fails === DOWN_AFTER) {
      appendFileSync(join(dir, 'incidents.jsonl'), JSON.stringify({ kind, event: 'down', start: s.since, detected: at }) + '\n');
      console.log(`[${at}] ИНЦИДЕНТ: ${kind === 'local' ? 'сервер на ПК' : 'адрес в интернете'} не отвечает с ${s.since}`);
    }
  } else {
    if (s.fails >= DOWN_AFTER) {
      const minutes = Math.round((new Date(at) - new Date(s.since)) / 60_000);
      appendFileSync(join(dir, 'incidents.jsonl'), JSON.stringify({ kind, event: 'up', start: s.since, end: at, minutes }) + '\n');
      console.log(`[${at}] восстановлено: ${kind}, простой ${minutes} мин`);
    }
    s.fails = 0;
    s.since = null;
  }
}

async function tick() {
  const at = new Date().toISOString();
  const url = publicUrl();
  const [local, pub] = await Promise.all([probe(LOCAL, 10_000), url ? probePublic(url, 30) : Promise.resolve(undefined)]);
  const line = { t: at, local, ...(pub ? { public: pub } : {}) };
  appendFileSync(join(dir, `uptime-${at.slice(0, 10)}.jsonl`), JSON.stringify(line) + '\n');
  track('local', local, at);
  track('public', pub, at);
}

console.log(`Сторож доступности: ${LOCAL} и ${publicUrl() ?? '(адрес туннеля не задан)'}, раз в ${EVERY_MS / 1000} с. Журнал: ${dir}`);
await tick();
setInterval(tick, EVERY_MS);
