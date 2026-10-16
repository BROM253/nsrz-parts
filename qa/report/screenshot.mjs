// Скриншот HTML-отчёта Playwright для рисунка в отчёте: node report/screenshot.mjs
import { chromium } from '@playwright/test';
import { dirname, join } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const report = join(here, '..', 'playwright-report', 'index.html');
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2, locale: 'ru-RU' });
await page.goto(pathToFileURL(report).href);
await page.getByText('ФТ-01', { exact: false }).first().waitFor();
await page.screenshot({ path: join(here, 'out', 'playwright.png'), clip: { x: 0, y: 0, width: 1100, height: 900 } });
await browser.close();
console.log('скриншот:', join(here, 'out', 'playwright.png'));
