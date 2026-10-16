// Рисунки для отчёта: SVG-графики → PNG через установленный Edge (Playwright, channel msedge).
// node report/charts.mjs  → report/out/*.png
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

const C = { primary: '#B4532A', text: '#2F2620', muted: '#7A6A5D', grid: '#E8DDD0', ok: '#3F6B2E', warn: '#8A5208', bad: '#A8392C', bg: '#FFFFFF' };
const FONT = "font-family: 'Times New Roman', serif";

/** Рисунок: задержка поиска (p95) в зависимости от потока запросов. */
function capacityChart() {
  const pts = [
    [72, 4.1], [123, 3.6], [173, 3.6], [246, 3.5], [346, 3.6], [446, 3.5], [577, 3.7], [744, 5.2], [873, 279.2],
  ];
  const W = 900, H = 470, L = 90, R = 40, T = 40, B = 80;
  const xMax = 1000, yMax = 300;
  const x = (v) => L + (v / xMax) * (W - L - R);
  const y = (v) => H - B - (v / yMax) * (H - T - B);
  const gridY = [0, 50, 100, 150, 200, 250, 300].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}"/><text x="${L - 12}" y="${y(v) + 5}" text-anchor="end" font-size="16" fill="${C.muted}">${v}</text>`).join('');
  const gridX = [0, 200, 400, 600, 800, 1000].map((v) => `<line x1="${x(v)}" x2="${x(v)}" y1="${T}" y2="${H - B}" stroke="${C.grid}"/><text x="${x(v)}" y="${H - B + 26}" text-anchor="middle" font-size="16" fill="${C.muted}">${v}</text>`).join('');
  const line = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${x(a).toFixed(1)},${y(b).toFixed(1)}`).join(' ');
  const dots = pts.map(([a, b]) => `<circle cx="${x(a)}" cy="${y(b)}" r="5" fill="${b > 100 ? C.bad : C.primary}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="${FONT}; background:${C.bg}">
    ${gridY}${gridX}
    <rect x="${x(0)}" y="${T}" width="${x(23) - x(0) + 6}" height="${H - B - T}" fill="${C.ok}" opacity="0.18"/>
    <text x="${x(23) + 12}" y="${T + 24}" font-size="16" fill="${C.ok}">пилот: ~23 запроса/с</text>
    <line x1="${x(750)}" x2="${x(750)}" y1="${T}" y2="${H - B}" stroke="${C.warn}" stroke-dasharray="6 5" stroke-width="2"/>
    <text x="${x(750) - 12}" y="${y(160)}" text-anchor="end" font-size="16" fill="${C.warn}">предел без замедления ~750 запросов/с</text>
    <path d="${line}" fill="none" stroke="${C.primary}" stroke-width="3"/>${dots}
    <text x="${x(873) + 12}" y="${y(279.2) + 26}" font-size="16" fill="${C.bad}">873 запроса/с:</text><text x="${x(873) + 12}" y="${y(279.2) + 46}" font-size="16" fill="${C.bad}">279 мс</text>
    <text x="${(L + W - R) / 2}" y="${H - 22}" text-anchor="middle" font-size="18" fill="${C.text}">Поток запросов поиска, запросов в секунду</text>
    <text transform="translate(26 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" font-size="18" fill="${C.text}">Время ответа p95, мс</text>
  </svg>`;
}

/** Рисунок: найденные дефекты по серьёзности и способу обнаружения. */
function defectsChart() {
  // Д-01…Д-13: способ обнаружения → серьёзность
  const rows = [
    { name: 'Ревью кода и проверка на стенде', high: 1, mid: 3, low: 4 }, // Д-02; Д-01, Д-03, Д-07; Д-05, Д-06, Д-08, Д-12
    { name: 'UI-автотесты', high: 0, mid: 0, low: 1 }, // Д-04
    { name: 'Нагрузочный тест', high: 0, mid: 1, low: 0 }, // Д-10
    { name: 'Исследовательская проверка', high: 0, mid: 0, low: 1 }, // Д-09
    { name: 'Сверка с ТЗ и документами', high: 1, mid: 0, low: 1 }, // Д-11; Д-13
  ];
  const W = 900, H = 400, L = 330, R = 60, T = 30, rowH = 56, unit = 52;
  const bars = rows
    .map((r, i) => {
      const yy = T + i * rowH;
      let xx = L;
      const seg = (n, color) => {
        if (!n) return '';
        const s = `<rect x="${xx}" y="${yy}" width="${n * unit}" height="34" fill="${color}" rx="3"/><text x="${xx + (n * unit) / 2}" y="${yy + 23}" text-anchor="middle" font-size="17" fill="#fff">${n}</text>`;
        xx += n * unit;
        return s;
      };
      return `<text x="${L - 14}" y="${yy + 23}" text-anchor="end" font-size="17" fill="${C.text}">${r.name}</text>${seg(r.high, C.bad)}${seg(r.mid, C.warn)}${seg(r.low, C.ok)}`;
    })
    .join('');
  const ly = T + rows.length * rowH + 30;
  const legend = [['высокая — 2', C.bad], ['средняя — 4', C.warn], ['низкая — 7', C.ok]]
    .map(([t, c], i) => `<rect x="${L + i * 190}" y="${ly}" width="20" height="20" fill="${c}" rx="3"/><text x="${L + i * 190 + 28}" y="${ly + 16}" font-size="17" fill="${C.text}">${t}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="${FONT}; background:${C.bg}">${bars}${legend}</svg>`;
}

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ deviceScaleFactor: 2 });
for (const [name, svg] of [['capacity', capacityChart()], ['defects', defectsChart()]]) {
  writeFileSync(join(out, `${name}.svg`), svg);
  await page.setContent(`<html><body style="margin:0;background:#fff">${svg}</body></html>`);
  await page.locator('svg').screenshot({ path: join(out, `${name}.png`) });
  console.log('рисунок:', join(out, `${name}.png`));
}
await browser.close();
