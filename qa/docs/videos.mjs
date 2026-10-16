// Видео для презентации: живая работа системы на QA-стенде (демо-данные, рабочая база не затрагивается).
//   cd qa && npm run stand:seed && node docs/videos.mjs [site|panel|app ...] → docs/out/video/<имя>.webm + <имя>.jpg (кадр-обложка)
// Видео пишет Playwright (webm), затем ffmpeg из Playwright обрезает белое начало до загрузки страницы.
import { chromium, devices } from '@playwright/test';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'out', 'video');
const RAW = join(OUT, 'raw');
mkdirSync(RAW, { recursive: true });
const QA = process.env.QA_URL ?? 'http://localhost:3100';
const only = process.argv.slice(2);
const want = (name) => only.length === 0 || only.includes(name);
const pause = (page, ms) => page.waitForTimeout(ms);

const ffmpegDir = join(process.env.LOCALAPPDATA, 'ms-playwright', readdirSync(join(process.env.LOCALAPPDATA, 'ms-playwright')).find((d) => d.startsWith('ffmpeg')));
const FFMPEG = join(ffmpegDir, readdirSync(ffmpegDir).find((f) => f.startsWith('ffmpeg')));

async function login(who) {
  for (let i = 0; i < 6; i++) {
    const sent = await fetch(QA + '/api/auth/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: who }) });
    if (sent.status === 429) { await new Promise((r) => setTimeout(r, 5_500)); continue; }
    const { devCode } = await sent.json();
    return (await fetch(QA + '/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: who, code: devCode }) })).json();
  }
  throw new Error('вход не удался: ' + who);
}

/** Записывает сценарий; skipMs — сколько срезать с начала (белый экран до загрузки). */
async function record(name, contextOptions, size, scenario) {
  const ctx = await browser.newContext({ ...contextOptions, locale: 'ru-RU', timezoneId: 'Europe/Moscow', recordVideo: { dir: RAW, size } });
  const page = await ctx.newPage();
  const started = Date.now();
  let skipMs = 0;
  const mark = () => (skipMs = Date.now() - started);
  await scenario(page, mark);
  const video = page.video();
  await ctx.close();
  const raw = await video.path();
  const out = join(OUT, `${name}.webm`);
  if (existsSync(out)) rmSync(out);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', (skipMs / 1000).toFixed(2), '-i', raw, '-c:v', 'vp8', '-b:v', '2500k', '-an', out]);
  rmSync(raw);
  console.log('видео:', name, `(${((Date.now() - started) / 1000 - skipMs / 1000).toFixed(1)} с)`);
}

const browser = await chromium.launch({ channel: 'msedge' });
const desktop = { viewport: { width: 1440, height: 900 } };

// 1. Судовладелец на сайте: вход по коду → поиск → «В корзину» (полёт в корзину) → оформление → «Заказ отправлен»
if (want('site')) {
  await record('site-order', desktop, { width: 1440, height: 900 }, async (page, mark) => {
    await page.goto(QA + '/login');
    await page.getByPlaceholder('+7 900 000-00-00 или почта').waitFor();
    await pause(page, 600);
    mark();
    await pause(page, 900);
    await page.getByPlaceholder('+7 900 000-00-00 или почта').pressSequentially('+7 900 000-00-01', { delay: 70 });
    await pause(page, 500);
    await page.getByRole('button', { name: 'Получить код' }).click();
    const code = (await page.locator('.demo-hint .mono').textContent()).trim();
    await pause(page, 1300);
    await page.keyboard.type(code, { delay: 220 });
    const search = page.getByPlaceholder('Например: 6L20 FF 118 или «фильтр топливный»');
    await search.waitFor();
    await pause(page, 1800);
    await search.click();
    await search.pressSequentially('6L20 FF 118', { delay: 110 });
    const card = page.locator('.part-card', { hasText: 'Фильтр топливный тонкой очистки' });
    await card.waitFor();
    await pause(page, 1500);
    await card.getByRole('button', { name: 'В корзину' }).click();
    await pause(page, 2200);
    await page.getByLabel('Корзина').click();
    await page.getByRole('button', { name: 'Оформить заказ' }).waitFor();
    await pause(page, 1500);
    await page.getByRole('button', { name: 'Оформить заказ' }).click();
    await page.getByRole('heading', { name: 'Оформление заказа' }).waitFor();
    await pause(page, 1000);
    await page.locator('section', { hasText: '1. Судно' }).getByRole('button').first().click();
    await pause(page, 600);
    await page.locator('section', { hasText: '2. Доставка' }).getByRole('button').nth(1).click();
    await pause(page, 600);
    await page.getByPlaceholder('Например: нужно до отхода судна в пятницу').pressSequentially('Нужно до отхода судна в пятницу', { delay: 45 });
    await pause(page, 700);
    await page.getByRole('button', { name: 'Отправить заказ' }).click();
    await page.getByRole('heading', { name: 'Заказ отправлен' }).waitFor();
    await pause(page, 1600);
    await page.screenshot({ path: join(OUT, 'site-order.jpg'), type: 'jpeg', quality: 88 });
    await pause(page, 1600);
  });
}

// 2. Отдел продаж в панели: новый заказ в очереди → «Подтвердить наличие» → «Начать комплектацию»
if (want('panel')) {
  const t = await login('prodazhi@nsrz.ru');
  // тот самый заказ, который судовладелец только что оформил на сайте (видео 1)
  const owner = await login('+7 900 000-00-01');
  const mine = await (await fetch(QA + '/api/orders', { headers: { Authorization: 'Bearer ' + owner.accessToken } })).json();
  const number = mine.items[0].number;
  await record('panel-confirm', desktop, { width: 1440, height: 900 }, async (page, mark) => {
    await page.addInitScript((v) => localStorage.setItem('nsrz.tokens', JSON.stringify(v)), { accessToken: t.accessToken, refreshToken: t.refreshToken });
    await page.goto(QA + '/panel');
    const row = page.getByRole('row', { name: new RegExp(number) });
    await row.waitFor();
    await pause(page, 800);
    mark();
    await pause(page, 1800);
    await row.click();
    const confirm = page.getByRole('button', { name: 'Подтвердить наличие' });
    await confirm.waitFor();
    await pause(page, 1800);
    await confirm.click();
    const next = page.getByRole('button', { name: 'Начать комплектацию' });
    await next.waitFor();
    await pause(page, 1800);
    await page.screenshot({ path: join(OUT, 'panel-confirm.jpg'), type: 'jpeg', quality: 88 });
    await next.click();
    await pause(page, 2400);
  });
}

// 3. Приложение на iPhone (на весь экран, как с экрана «Домой»): каталог → карточка → «В корзину» → корзина → заказы
if (want('app')) {
  const t = await login('+7 900 000-00-02');
  await record('app-tour', { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, { width: 390, height: 844 }, async (page, mark) => {
    await page.addInitScript((v) => {
      localStorage.setItem('flutter.accessToken', JSON.stringify(v.accessToken));
      localStorage.setItem('flutter.refreshToken', JSON.stringify(v.refreshToken));
    }, t);
    await page.goto(QA + '/m/');
    await page.locator('flutter-view, flt-glass-pane').first().waitFor({ state: 'attached', timeout: 60_000 });
    await pause(page, 4000);
    // дерево доступности Flutter: по нему находим кнопки и поля по тексту
    await page.locator('flt-semantics-placeholder').evaluate((el) => el.click()).catch(() => {});
    await pause(page, 800);
    mark();
    await pause(page, 1500);
    const field = page.getByRole('textbox').first();
    await field.click();
    await pause(page, 400);
    await page.keyboard.type('6L20 FF 118', { delay: 120 });
    await pause(page, 2200);
    // карточка в дереве доступности — группа с подписью из названия детали
    await page.getByRole('group', { name: /Фильтр топливный тонкой/ }).first().click();
    await pause(page, 2400);
    await page.getByRole('button', { name: /В корзину/ }).first().click();
    await pause(page, 2200);
    await page.screenshot({ path: join(OUT, 'app-tour.jpg'), type: 'jpeg', quality: 88 });
    await page.getByRole('button', { name: /Перейти в корзину/ }).or(page.getByText(/Перейти в корзину/)).first().click();
    await pause(page, 2600);
    await page.getByRole('tab', { name: 'Заказы' }).click();
    await pause(page, 2600);
  });
}

await browser.close();
if (existsSync(RAW) && readdirSync(RAW).length === 0) rmSync(RAW, { recursive: true });
