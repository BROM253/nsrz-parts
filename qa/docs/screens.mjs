// Скриншоты для инструкций пользователей (этап 6). Снимаются на QA-стенде (порт 3100), рабочие данные не трогаются.
//   cd qa && npm run stand:seed && node docs/screens.mjs  → docs/out/screens/*.jpg
import { chromium, devices } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'out', 'screens');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.QA_URL ?? 'http://localhost:3100';

const api = async (path, { token, method = 'GET', body } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status === 204 ? null : res.json();
};
const tokens = {};
async function login(who) {
  if (tokens[who]) return tokens[who];
  for (let i = 0; i < 4; i++) {
    const sent = await fetch(BASE + '/api/auth/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: who }) });
    if (sent.status === 429) { await new Promise((r) => setTimeout(r, 5_500)); continue; }
    const { devCode } = await sent.json();
    tokens[who] = await api('/api/auth/verify', { method: 'POST', body: { login: who, code: devCode } });
    return tokens[who];
  }
  throw new Error('вход не удался: ' + who);
}

const OWNER = '+7 900 000-00-01';
const SALES = 'prodazhi@nsrz.ru';
const WAREHOUSE = 'sklad@nsrz.ru';
const ADMIN = 'admin@nsrz.ru';

const browser = await chromium.launch({ channel: 'msedge' });
const shot = async (page, name, opts = {}) => {
  await page.waitForTimeout(opts.wait ?? 900); // анимации появления
  await page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 86, ...opts.shot });
  console.log('снимок:', name);
};

async function desktop(who) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 }, deviceScaleFactor: 1.4, locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
  if (who) {
    const t = await login(who);
    await ctx.addInitScript((v) => localStorage.setItem('nsrz.tokens', JSON.stringify(v)), { accessToken: t.accessToken, refreshToken: t.refreshToken });
  }
  return ctx.newPage();
}

// ── Судовладелец: сайт ──────────────────────────────────────────
{
  const owner = await login(OWNER);
  const id = async (name) => (await api('/api/parts?q=' + encodeURIComponent(name), { token: owner.accessToken })).items.find((p) => p.name === name).id;
  await api('/api/cart', { token: owner.accessToken, method: 'DELETE' });

  const page = await desktop(null);
  await page.goto(BASE + '/login');
  await shot(page, 'site-login', { wait: 1500 });
  await page.waitForTimeout(6_000); // повторный код на тот же номер — не чаще раза в 5 с (выше уже входили через API)
  await page.getByPlaceholder('+7 900 000-00-00 или почта').fill(OWNER);
  await page.getByRole('button', { name: 'Получить код' }).click();
  await page.getByRole('heading', { name: 'Введите код' }).waitFor();
  await shot(page, 'site-code');
  const code = (await page.locator('.demo-hint b').textContent()).trim();
  await page.getByLabel('Цифра 1').fill(code);
  await page.getByRole('heading', { name: 'Какая деталь нужна?' }).waitFor();
  await page.getByPlaceholder('Например: 6L20 FF 118 или «фильтр топливный»').fill('фильтр');
  await page.waitForTimeout(1200);
  await shot(page, 'site-catalog');
  await page.goto(BASE + `/parts/${await id('Фильтр топливный тонкой очистки')}`);
  await page.getByRole('button', { name: /В корзину ·/ }).waitFor();
  await shot(page, 'site-part');

  await api('/api/cart/items', { token: owner.accessToken, method: 'POST', body: { partId: await id('Фильтр топливный тонкой очистки'), quantity: 2 } });
  await api('/api/cart/items', { token: owner.accessToken, method: 'POST', body: { partId: await id('Кольцо уплотнительное крышки цилиндра'), quantity: 6 } });
  await page.goto(BASE + '/cart');
  await page.getByRole('button', { name: 'Оформить заказ' }).waitFor();
  await shot(page, 'site-cart');
  await page.getByRole('button', { name: 'Оформить заказ' }).click();
  await page.getByRole('heading', { name: 'Оформление заказа' }).waitFor();
  await page.getByPlaceholder('Например: нужно до отхода судна в пятницу').fill('Нужно до отхода судна в пятницу');
  await shot(page, 'site-checkout');
  await page.getByRole('button', { name: 'Отправить заказ' }).click();
  await page.getByRole('heading', { name: 'Заказ отправлен' }).waitFor();
  await shot(page, 'site-done', { wait: 1800 });
  await page.getByRole('button', { name: 'Следить за заказом' }).click();
  await page.getByRole('button', { name: 'Повторить заказ' }).waitFor();
  await shot(page, 'site-order');
  await page.goto(BASE + '/orders');
  await page.getByRole('heading', { name: 'Мои заказы' }).waitFor();
  await shot(page, 'site-orders');
  await page.context().close();
}

// ── Судовладелец: приложение в размере iPhone ─────────────────────
{
  const owner = await login(OWNER);
  const phone = async (route, name, wait = 4500, signed = true) => {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2, locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
    if (signed) {
      await ctx.addInitScript((t) => {
        localStorage.setItem('flutter.accessToken', JSON.stringify(t.accessToken));
        localStorage.setItem('flutter.refreshToken', JSON.stringify(t.refreshToken));
      }, owner);
    }
    const page = await ctx.newPage();
    // приложение при запуске восстанавливает сессию и открывает стартовый экран, поэтому
    // сначала ждём загрузки, а потом переходим на нужный экран внутри приложения
    await page.goto(`${BASE}/m/`);
    await page.locator('flutter-view, flt-glass-pane').first().waitFor({ state: 'attached', timeout: 60_000 });
    await page.waitForTimeout(3_500);
    if (signed && route !== '/catalog') await page.evaluate((r) => (location.hash = '#' + r), route);
    await shot(page, name, { wait });
    await ctx.close();
  };
  const orders = await api('/api/orders?status=ALL', { token: owner.accessToken });
  const part = (await api('/api/parts?q=' + encodeURIComponent('Фильтр топливный тонкой очистки'), { token: owner.accessToken })).items[0];
  await api('/api/cart/items', { token: owner.accessToken, method: 'POST', body: { partId: part.id, quantity: 1 } });
  await phone('/login', 'app-login', 4500, false);
  await phone('/catalog', 'app-catalog');
  await phone(`/part/${part.id}`, 'app-part');
  await phone('/cart', 'app-cart');
  await phone('/orders', 'app-orders');
  await phone(`/order/${orders.items[0].id}`, 'app-order');
  await api('/api/cart', { token: owner.accessToken, method: 'DELETE' });

  // страница /app для Android (по QR-коду со страницы входа)
  const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/app');
  await page.locator('a[href*=".apk"]').first().waitFor();
  await shot(page, 'app-download', { wait: 1200 });
  await ctx.close();
}

// ── Сотрудник отдела продаж и склада: панель ─────────────────────
{
  const page = await desktop(SALES);
  await page.goto(BASE + '/panel');
  await page.getByPlaceholder('Номер, компания или судно').waitFor();
  await shot(page, 'panel-queue', { wait: 1500 });
  await page.locator('.ant-table-row').first().click();
  await page.getByRole('button', { name: /Подтвердить наличие/ }).waitFor();
  await shot(page, 'panel-order');
  await page.getByRole('button', { name: /Отклонить$/ }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').locator('.ant-radio-wrapper').first().click();
  await shot(page, 'panel-reject');
  await page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click();
  await page.getByRole('button', { name: /Подтвердить наличие/ }).click();
  await page.getByRole('button', { name: /Начать комплектацию/ }).waitFor();
  await shot(page, 'panel-confirmed', { wait: 1500 });
  await page.goto(BASE + '/panel/stats');
  await page.waitForTimeout(1500);
  await shot(page, 'panel-stats');
  await page.context().close();
}
{
  const page = await desktop(WAREHOUSE);
  await page.goto(BASE + '/panel/stock');
  await page.getByPlaceholder('Номер или наименование').fill('фильтр');
  await page.waitForTimeout(1200);
  const row = page.locator('.ant-table-row').first();
  await row.getByRole('spinbutton').fill('15');
  await shot(page, 'panel-stock');
  const csv = join(OUT, '..', 'остатки-пример.csv');
  writeFileSync(csv, '﻿каталожный номер;количество;статус\r\nНСРЗ-НС-03045;38;в наличии\r\nНСРЗ-ГД-00981;-2;в наличии\r\nНСРЗ-XX-00000;5;в наличии\r\n');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Загрузить файл' }).click();
  await (await chooser).setFiles(csv);
  await page.getByRole('dialog').waitFor();
  await shot(page, 'panel-import');
  await page.context().close();
}

// ── Администратор ───────────────────────────────────────────────
{
  const page = await desktop(ADMIN);
  await page.goto(BASE + '/panel/admin');
  await page.getByRole('button', { name: 'Добавить пользователя' }).waitFor();
  await shot(page, 'admin-users', { wait: 1200 });
  await page.getByRole('button', { name: 'Добавить пользователя' }).click();
  await page.getByRole('dialog', { name: 'Новый пользователь' }).waitFor();
  await shot(page, 'admin-new-user');
  await page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click();
  for (const [tab, name] of [['Компании и суда', 'admin-companies'], ['Справочники', 'admin-dict'], ['Журнал уведомлений', 'admin-log']]) {
    await page.getByRole('tab', { name: tab }).click();
    await shot(page, name, { wait: 1200 });
  }
  await page.context().close();
}

await browser.close();
console.log('Готово:', OUT);
