// Скриншоты новых функций этапа 7 (поддержка, мониторинг) для инструкций и презентации.
// Обращения — на QA-стенде (там демо-обращения), мониторинг — с рабочего сервера на этом ПК (только просмотр).
//   node docs/screens7.mjs → docs/out/screens/*.jpg
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'out', 'screens');
mkdirSync(OUT, { recursive: true });
const QA = process.env.QA_URL ?? 'http://localhost:3100';
const PROD_LOCAL = process.env.PROD_LOCAL ?? 'http://localhost:3000';

async function login(base, who) {
  for (let i = 0; i < 4; i++) {
    const sent = await fetch(base + '/api/auth/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: who }) });
    if (sent.status === 429) { await new Promise((r) => setTimeout(r, 5_500)); continue; }
    const { devCode } = await sent.json();
    return (await fetch(base + '/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: who, code: devCode }) })).json();
  }
  throw new Error('вход не удался: ' + who);
}

const browser = await chromium.launch({ channel: 'msedge' });
const shot = async (page, name, wait = 900) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 86 });
  console.log('снимок:', name);
};
async function desktop(base, who) {
  const t = await login(base, who);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 }, deviceScaleFactor: 1.4, locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
  await ctx.addInitScript((v) => localStorage.setItem('nsrz.tokens', JSON.stringify(v)), { accessToken: t.accessToken, refreshToken: t.refreshToken });
  return { page: await ctx.newPage(), token: t.accessToken };
}

// судовладелец: окно «Помощь» и «Мои обращения»
{
  const { page } = await desktop(QA, '+7 900 000-00-01');
  await page.goto(QA + '/');
  await page.getByRole('button', { name: 'Помощь' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Предложение/ }).click();
  await dialog.getByRole('textbox').fill('Хорошо бы видеть в карточке детали фото с разных сторон — механикам проще сверить.');
  await shot(page, 'site-help');
  await page.keyboard.press('Escape');
  await page.goto(QA + '/profile');
  await page.getByRole('heading', { name: 'Мои обращения' }).scrollIntoViewIfNeeded();
  await shot(page, 'site-tickets', 1200);
  await page.context().close();
}

// отдел продаж: очередь обращений и ответ
{
  const { page } = await desktop(QA, 'prodazhi@nsrz.ru');
  await page.goto(QA + '/panel/support');
  await page.locator('.ant-table-row').first().waitFor();
  await shot(page, 'panel-support', 1200);
  await page.locator('.ant-table-row').first().click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('textbox').fill('Добавить судно может администратор НСРЗ — мы уже передали ему ваш запрос, судно появится сегодня.');
  await shot(page, 'panel-support-reply');
  await page.context().close();
}

// администратор: мониторинг рабочего сервера (только просмотр)
{
  const { page } = await desktop(PROD_LOCAL, 'admin@nsrz.ru');
  await page.goto(PROD_LOCAL + '/panel/monitoring');
  await page.getByText(/Система работает нормально|Требует внимания/).waitFor();
  await shot(page, 'panel-monitoring', 1500);
  await page.mouse.wheel(0, 700);
  await shot(page, 'panel-monitoring-2', 900);
  await page.context().close();
}

// приложение (iPhone): экран «Помощь и обратная связь» с ответом НСРЗ
{
  const t = await login(QA, '+7 900 000-00-01');
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2, locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
  await ctx.addInitScript((v) => {
    localStorage.setItem('flutter.accessToken', JSON.stringify(v.accessToken));
    localStorage.setItem('flutter.refreshToken', JSON.stringify(v.refreshToken));
  }, t);
  const page = await ctx.newPage();
  await page.goto(QA + '/m/');
  await page.locator('flutter-view, flt-glass-pane').first().waitFor({ state: 'attached', timeout: 60_000 });
  await page.waitForTimeout(3_500);
  await page.evaluate(() => (location.hash = '#/profile'));
  await shot(page, 'app-profile', 3000);
  await page.evaluate(() => (location.hash = '#/support'));
  await shot(page, 'app-support', 3500);
  await ctx.close();
}

await browser.close();
