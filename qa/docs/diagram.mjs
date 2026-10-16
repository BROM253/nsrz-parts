// Схема рабочей среды (развёртывания) для отчёта этапа 6: SVG → PNG через Edge.
//   node docs/diagram.mjs → docs/out/deploy-diagram.png
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

const C = { primary: '#B4532A', soft: '#F3E6DA', text: '#2F2620', muted: '#6E5F53', line: '#8C7B6B', ok: '#3F6B2E', okSoft: '#EEF4EA', bg: '#FFFFFF', pc: '#FBF6F0' };
const box = (x, y, w, h, title, lines = [], fill = C.soft, stroke = C.line) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>` +
  `<text x="${x + w / 2}" y="${y + 26}" text-anchor="middle" font-size="17" font-weight="bold" fill="${C.text}">${title}</text>` +
  lines.map((l, i) => `<text x="${x + w / 2}" y="${y + 50 + i * 20}" text-anchor="middle" font-size="14.5" fill="${C.muted}">${l}</text>`).join('');
const arrow = (x1, y1, x2, y2, label = '', dy = -8) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.primary}" stroke-width="2.2" marker-end="url(#a)"/>` +
  (label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + dy}" text-anchor="middle" font-size="13.5" fill="${C.primary}">${label}</text>` : '');

const W = 1180, H = 560;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="font-family: 'Times New Roman', serif; background:${C.bg}">
<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${C.primary}"/></marker></defs>

<text x="120" y="34" text-anchor="middle" font-size="18" font-weight="bold" fill="${C.text}">Пользователи</text>
${box(20, 55, 200, 92, 'Android', ['приложение «НСРЗ Запчасти»', 'файл APK'])}
${box(20, 170, 200, 92, 'iPhone', ['веб-версия /m/', 'на экране «Домой»'])}
${box(20, 285, 200, 92, 'Компьютер', ['сайт и панель НСРЗ', 'в браузере'])}

<text x="390" y="34" text-anchor="middle" font-size="18" font-weight="bold" fill="${C.text}">Интернет</text>
${box(290, 150, 200, 130, 'Туннель tuna.am', ['постоянный адрес', 'your-subdomain', '.a.tuna.free', 'HTTPS, без VPN'], C.okSoft, C.ok)}
${arrow(222, 101, 288, 190)}
${arrow(222, 216, 288, 216, 'HTTPS')}
${arrow(222, 331, 288, 245)}

<rect x="540" y="20" width="620" height="520" rx="14" fill="${C.pc}" stroke="${C.primary}" stroke-width="2" stroke-dasharray="7 5"/>
<text x="850" y="48" text-anchor="middle" font-size="18" font-weight="bold" fill="${C.primary}">Рабочий сервер — домашний ПК (Windows 11)</text>
${box(565, 160, 165, 110, 'Клиент tuna', ['tuna.exe', 'принимает запросы', 'из интернета'])}
${arrow(492, 216, 563, 216)}
${box(770, 70, 370, 150, 'Сервер NestJS (порт 3000)', ['REST API: вход, каталог, заказы, панель', 'сайт и панель НСРЗ (React)', 'веб-версия для iPhone /m/ (Flutter)', 'APK для Android /download/', 'версия 1.1.0, /api/health'])}
${arrow(732, 200, 768, 170)}
${box(770, 255, 175, 110, 'PostgreSQL 16', ['порт 5432', 'база nsrz', 'data\\postgres'])}
${arrow(900, 222, 870, 253, '', 0)}
${box(965, 255, 175, 110, 'Резервные копии', ['data\\backups', 'при запуске и', 'раз в сутки, 14 шт.'], C.okSoft, C.ok)}
${arrow(947, 310, 963, 310)}
${box(565, 390, 280, 130, 'QA-стенд (порт 3100)', ['отдельная база nsrz_qa', 'автотесты, нагрузка, безопасность,', 'учебный стенд для обучения'])}
${box(865, 390, 275, 130, 'Скрипты эксплуатации', ['start-server.cmd — запуск', 'deploy.ps1 — выкатка версии', 'smoke.mjs — дымовой тест'])}
</svg>`;

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
await page.locator('svg').screenshot({ path: join(out, 'deploy-diagram.png') });
await browser.close();
writeFileSync(join(out, 'deploy-diagram.svg'), svg);
console.log('схема:', join(out, 'deploy-diagram.png'));
