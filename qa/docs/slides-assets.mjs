// Картинки и видео для презентации защиты → docs/out/slides-assets (загружаются в презентацию как ассеты).
//   cd qa && node docs/slides-assets.mjs   (сначала docs/screens*.mjs и docs/videos.mjs)
import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
import { URL } from './common.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'out', 'slides-assets');
mkdirSync(OUT, { recursive: true });

const screens = ['site-catalog', 'app-catalog', 'app-part', 'app-order', 'app-support', 'panel-monitoring', 'panel-support-reply', 'site-login'];
for (const s of screens) copyFileSync(join(here, 'out', 'screens', `${s}.jpg`), join(OUT, `${s}.jpg`));
for (const v of ['site-order', 'panel-confirm', 'app-tour']) {
  copyFileSync(join(here, 'out', 'video', `${v}.webm`), join(OUT, `${v}.webm`));
  copyFileSync(join(here, 'out', 'video', `${v}.jpg`), join(OUT, `${v}-still.jpg`));
}

// QR на страницу установки — цвета приложения, тёмный на песочном
await QRCode.toFile(join(OUT, 'qr-app.png'), `${URL}/app`, { width: 900, margin: 2, color: { dark: '#2A1C14', light: '#FBF6EF' } });

// иллюстрация порта со страницы входа — PNG с прозрачным фоном
const svg = readFileSync(join(here, '..', '..', 'web', 'public', 'img', 'port.svg'), 'utf8');
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ deviceScaleFactor: 3 });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.locator('svg').screenshot({ path: join(OUT, 'port.png'), omitBackground: true });
await browser.close();
console.log('готово:', OUT);
