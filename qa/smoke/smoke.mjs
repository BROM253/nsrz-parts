// Дымовой тест (smoke test) после выкатки: «система живая и главное работает».
// Проверки НЕ меняют данные (корзина возвращается как была, заказы не создаются).
//
//   node smoke/smoke.mjs                       — рабочий адрес из data/public-url.txt (туннель tuna)
//   node smoke/smoke.mjs http://localhost:3000 — любой адрес
//   node smoke/smoke.mjs <адрес> --api         — только API, без браузеров
import { chromium, devices, webkit } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const args = process.argv.slice(2);
const urlFile = join(root, 'data', 'public-url.txt');
const BASE = (args.find((a) => a.startsWith('http')) ?? (existsSync(urlFile) ? readFileSync(urlFile, 'utf8').replace(/^﻿/, '').trim() : 'http://localhost:3000')).replace(/\/$/, '');
const API_ONLY = args.includes('--api');
const EXPECTED_VERSION = JSON.parse(readFileSync(join(root, 'backend', 'package.json'), 'utf8')).version;

const results = [];
async function check(id, title, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ id, title, ok: true, ms: Date.now() - started, detail: detail ?? '' });
    console.log(`✓ ${id} ${title} (${Date.now() - started} мс)${detail ? ' — ' + detail : ''}`);
  } catch (e) {
    results.push({ id, title, ok: false, ms: Date.now() - started, detail: e.message });
    console.log(`✗ ${id} ${title} — ${e.message}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
/** Сетевой обрыв (не ответ сервера) повторяется до двух раз — канал через туннель бывает нестабилен. */
async function get(path, init = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(BASE + path, { ...init, signal: AbortSignal.timeout(60_000) });
    } catch (e) {
      if (attempt >= 3) throw new Error(`сеть: ${e.cause?.code ?? e.message}`);
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
}
const json = async (path, token, init = {}) => {
  const res = await get(path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  const body = await res.json().catch(() => null);
  return { status: res.status, body, headers: res.headers };
};
async function login(who) {
  for (let i = 0; i < 4; i++) {
    const sent = await json('/api/auth/request-code', null, { method: 'POST', body: JSON.stringify({ login: who }) });
    if (sent.status === 429) {
      await new Promise((r) => setTimeout(r, 6_000));
      continue;
    }
    assert(sent.status === 200, `запрос кода: ${sent.status} ${sent.body?.message ?? ''}`);
    assert(sent.body.devCode, 'нет демо-кода (сервер не в демо-режиме — войдите вручную по SMS)');
    const res = await json('/api/auth/verify', null, { method: 'POST', body: JSON.stringify({ login: who, code: sent.body.devCode }) });
    assert(res.status === 200, `проверка кода: ${res.status}`);
    return res.body;
  }
  throw new Error('лимит запросов кода — повторите через минуту');
}

console.log(`Дымовой тест: ${BASE} (ожидается версия ${EXPECTED_VERSION})\n`);

// ── Доступность ────────────────────────────────────────────────
await check('S-01', 'Сервер и база данных отвечают, версия релиза', async () => {
  const h = await json('/api/health');
  assert(h.status === 200 && h.body.status === 'ok' && h.body.db === 'ok', `health: ${JSON.stringify(h.body)}`);
  assert(h.body.version === EXPECTED_VERSION, `версия ${h.body.version}, ожидалась ${EXPECTED_VERSION}`);
  return `версия ${h.body.version}`;
});
await check('S-02', 'Резервная копия базы не старше суток (ТЗ п. 4.4)', async () => {
  const h = await json('/api/health');
  assert(h.body.lastBackup, 'резервных копий нет');
  const hours = (Date.now() - new Date(h.body.lastBackup).getTime()) / 3600_000;
  assert(hours < 25, `последняя копия ${hours.toFixed(1)} ч назад`);
  return `последняя копия ${hours.toFixed(1)} ч назад`;
});
await check('S-03', 'Сайт для ПК открывается, защита содержимого (CSP) включена', async () => {
  const res = await get('/', { headers: { Accept: 'text/html', 'Accept-Encoding': 'br, gzip' } });
  const html = await res.text();
  assert(res.status === 200 && html.includes('<div id="root">'), `ответ ${res.status}`);
  assert((res.headers.get('content-security-policy') ?? '').includes("script-src 'self'"), 'нет заголовка CSP');
  if (BASE.startsWith('https://')) assert(res.headers.get('strict-transport-security'), 'нет HSTS');
  return BASE.startsWith('https://') ? 'HTTPS, HSTS' : 'HTTP (локально)';
});
await check('S-04', 'Страница для телефона /app (QR со страницы входа)', async () => {
  const res = await get('/app', { headers: { Accept: 'text/html' } });
  assert(res.status === 200, `ответ ${res.status}`);
});
await check('S-05', 'Веб-версия приложения для iPhone /m/', async () => {
  const res = await get('/m/');
  const html = await res.text();
  assert(res.status === 200 && /flutter/i.test(html), `ответ ${res.status}`);
  const js = await get('/m/main.dart.js', { method: 'HEAD' });
  assert(js.status === 200, `main.dart.js: ${js.status}`);
});
await check('S-06', 'APK для Android скачивается', async () => {
  const res = await get('/download/nsrz-parts.apk', { method: 'HEAD' });
  const size = Number(res.headers.get('content-length') ?? 0);
  assert(res.status === 200 && size > 5_000_000, `ответ ${res.status}, размер ${size}`);
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
});
await check('S-07', 'Документация API (Swagger)', async () => {
  const res = await get('/api/docs');
  assert(res.status === 200, `ответ ${res.status}`);
});

// ── Главные сценарии (без изменения данных) ─────────────────────
let owner;
let staff;
await check('S-08', 'Вход судовладельца по коду', async () => {
  owner = await login('+7 900 000-00-02');
  return owner.user.company?.name ?? '';
});
await check('S-09', 'Поиск по номеру детали (сценарий 1 ТЗ)', async () => {
  const r = await json('/api/parts?q=' + encodeURIComponent('6L20 FF 118'), owner.accessToken);
  assert(r.status === 200 && r.body.total >= 1, `найдено ${r.body?.total}`);
  const p = r.body.items[0];
  assert(p.price > 0 && p.stock, 'в выдаче нет цены или остатка');
  return `${p.name}: доступно ${p.stock.available ?? '—'}`;
});
await check('S-10', 'Карточка запчасти', async () => {
  const list = await json('/api/parts?q=' + encodeURIComponent('Подшипник насоса'), owner.accessToken);
  const r = await json(`/api/parts/${list.body.items[0].id}`, owner.accessToken);
  assert(r.status === 200 && r.body.description && r.body.stockUpdatedAt, 'нет описания или времени обновления остатков');
});
await check('S-11', 'Корзина: добавить и вернуть как было', async () => {
  const before = (await json('/api/cart', owner.accessToken)).body;
  const part = (await json('/api/parts?q=' + encodeURIComponent('Подшипник насоса'), owner.accessToken)).body.items[0];
  const had = before.items.find((i) => i.part.id === part.id);
  try {
    const add = await json('/api/cart/items', owner.accessToken, { method: 'POST', body: JSON.stringify({ partId: part.id, quantity: 1 }) });
    assert(add.status === 201, `добавление: ${add.status}`);
  } finally {
    // корзина возвращается как была, даже если проверка оборвалась
    if (had) await json(`/api/cart/items/${part.id}`, owner.accessToken, { method: 'PUT', body: JSON.stringify({ quantity: had.quantity }) });
    else await json(`/api/cart/items/${part.id}`, owner.accessToken, { method: 'DELETE' });
  }
  const after = (await json('/api/cart', owner.accessToken)).body;
  assert(after.count === before.count, `корзина не вернулась: было ${before.count}, стало ${after.count}`);
});
await check('S-12', 'История заказов судовладельца', async () => {
  const r = await json('/api/orders?status=ALL', owner.accessToken);
  assert(r.status === 200, `ответ ${r.status}`);
  return `заказов: ${r.body.total}`;
});
await check('S-13', 'Вход сотрудника склада, очередь, остатки, статистика', async () => {
  staff = await login('sklad@nsrz.ru');
  for (const path of ['/api/panel/orders?status=PENDING', '/api/panel/stock', '/api/panel/stats']) {
    const r = await json(path, staff.accessToken);
    assert(r.status === 200, `${path}: ${r.status}`);
  }
});
await check('S-14', 'Защита: без входа — 401, судовладелец в панели — 403', async () => {
  assert((await json('/api/orders')).status === 401, 'без входа данные доступны');
  assert((await json('/api/panel/orders', owner.accessToken)).status === 403, 'судовладелец попал в панель');
});

// ── Браузеры ─────────────────────────────────────────────────────
/**
 * Бесплатный tuna при первом заходе из браузера показывает свою страницу «Вы собираетесь посетить… — Посетить».
 * Проверки проходят её так же, как пользователь: нажимают «Посетить» (дальше tuna помнит выбор).
 */
async function passTunaWarning(page) {
  if ((await page.title()) !== 'Требуется подтверждение') return '';
  await page.getByRole('button', { name: 'Посетить' }).click();
  await page.waitForLoadState('domcontentloaded');
  return 'страница tuna «Посетить» пройдена; ';
}

if (!API_ONLY) {
  await check('S-15', 'Сайт в браузере (Edge): вход по демо-кнопке → каталог → выход', async () => {
    const browser = await chromium.launch({ channel: 'msedge' });
    try {
      const page = await browser.newPage({ locale: 'ru-RU' });
      await page.goto(BASE + '/login', { timeout: 120_000 });
      const note = await passTunaWarning(page);
      await page.getByRole('button', { name: 'Черноморский флот' }).click({ timeout: 120_000 });
      const code = (await page.locator('.demo-hint b').textContent({ timeout: 120_000 })).trim();
      await page.getByLabel('Цифра 1').fill(code);
      await page.getByRole('heading', { name: 'Какая деталь нужна?' }).waitFor({ timeout: 120_000 });
      await page.getByRole('button', { name: 'Выйти из аккаунта' }).click();
      await page.waitForURL(/\/login/, { timeout: 120_000 });
      return note.replace(/; $/, '');
    } finally {
      await browser.close();
    }
  });
  await check('S-16', 'Приложение на iPhone (Safari, эмуляция iPhone 13): /m/ запускается', async () => {
    const browser = await webkit.launch();
    try {
      const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ru-RU' });
      const page = await ctx.newPage();
      const started = Date.now();
      await page.goto(BASE + '/m/', { timeout: 120_000 });
      const note = await passTunaWarning(page);
      await page.locator('flt-glass-pane, flutter-view').first().waitFor({ state: 'attached', timeout: 120_000 });
      return `${note}интерфейс за ${((Date.now() - started) / 1000).toFixed(1)} с`;
    } finally {
      await browser.close();
    }
  });
  await check('S-17', 'Телефон на Android (эмуляция Pixel 7): страница /app со ссылкой на APK', async () => {
    const browser = await chromium.launch({ channel: 'msedge' });
    try {
      const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'ru-RU' });
      const page = await ctx.newPage();
      await page.goto(BASE + '/app', { timeout: 120_000 });
      const note = await passTunaWarning(page);
      const href = await page.locator('a[href*=".apk"]').first().getAttribute('href', { timeout: 120_000 });
      assert(href?.includes('nsrz-parts'), 'нет ссылки на APK');
      return note.replace(/; $/, '');
    } finally {
      await browser.close();
    }
  });
}

const failed = results.filter((r) => !r.ok);
const stamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
const text =
  `Дымовой тест ${stamp} (МСК), адрес ${BASE}, версия ${EXPECTED_VERSION}\n` +
  results.map((r) => `${r.ok ? 'ПРОЙДЕН ' : 'ПРОВАЛЕН'} ${r.id} ${r.title} — ${r.ms} мс${r.detail ? '; ' + r.detail : ''}`).join('\n') +
  `\nИтог: ${results.length - failed.length} из ${results.length}` +
  (failed.length ? ' — ЕСТЬ ПРОБЛЕМЫ\n' : ' — система работает\n');
mkdirSync(join(here, 'results'), { recursive: true });
const name = BASE.includes('localhost') ? 'local' : 'production';
writeFileSync(join(here, 'results', `smoke-${name}.txt`), text);
writeFileSync(join(here, 'results', `smoke-${name}.json`), JSON.stringify({ base: BASE, at: new Date().toISOString(), version: EXPECTED_VERSION, results }, null, 1));
console.log(`\nИтог: ${results.length - failed.length} из ${results.length}${failed.length ? ' — ЕСТЬ ПРОБЛЕМЫ' : ' — система работает'}`);
process.exit(failed.length ? 1 : 0);
