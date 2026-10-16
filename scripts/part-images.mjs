// Генератор иллюстраций запчастей (SVG, 320×240) в тёплом стиле сайта.
// Рисунки векторные и лёгкие (2–5 КБ) — важно для канала до 128 кбит/с; одинаково показываются на сайте,
// в Flutter-приложении (flutter_svg) и на iPhone. Запуск: node scripts/part-images.mjs
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'web', 'public', 'img', 'parts');
mkdirSync(out, { recursive: true });

export const slug = (mpn) => mpn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- материалы: градиенты слева направо (для вертикальных форм) ----------
const MAT = {
  steel: ['#6F7881', '#C9D0D7', '#F4F6F8', '#AEB7C0', '#79828C'],
  dsteel: ['#4A525B', '#7E8893', '#B3BCC5', '#7A848E', '#454D55'],
  brass: ['#7E561F', '#C8913D', '#F2CC86', '#C38A35', '#80561E'],
  copper: ['#7A3B20', '#C46E43', '#F3B58F', '#C06A40', '#7A3B20'],
  rubber: ['#1E1C1B', '#46423F', '#6A6561', '#3A3633', '#1E1C1B'],
  paper: ['#B49C74', '#E2D0AE', '#F8EEDA', '#DCC7A2', '#B39A70'],
  orange: ['#8E3416', '#D25A2C', '#F09A6E', '#CF5A2D', '#8E3416'],
  green: ['#2F4A2C', '#4E7446', '#86A97C', '#4F7547', '#2F4A2C'],
  blue: ['#22394E', '#3D6283', '#7FA3C3', '#3E6385', '#22394E'],
  white: ['#AEB3B8', '#E2E5E8', '#FFFFFF', '#DDE1E5', '#A9AFB5'],
  black: ['#141414', '#34393E', '#5A6067', '#2F3438', '#141414'],
  yellow: ['#9A6A06', '#E3A515', '#FFD566', '#E1A312', '#99690A'],
  grey: ['#4C565F', '#76818B', '#A9B3BC', '#76818B', '#4C565F'],
  cream: ['#C2B086', '#E6D7B2', '#FBF3DE', '#E2D0A6', '#C0AD82'],
};

function defs(used) {
  const g = [];
  for (const [name, s] of Object.entries(MAT)) {
    if (![name, name + 'V', name + 'T'].some((id) => used.has(id))) continue;
    const stops = s.map((c, i) => `<stop offset="${i / (s.length - 1)}" stop-color="${c}"/>`).join('');
    g.push(`<linearGradient id="${name}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>`);
    g.push(`<linearGradient id="${name}V" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>`);
    g.push(`<linearGradient id="${name}T" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${s[2]}"/><stop offset="1" stop-color="${s[1]}"/></linearGradient>`);
  }
  return `<defs>
<linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="240"><stop offset="0" stop-color="#FFF9F2"/><stop offset="1" stop-color="#F1E2D0"/></linearGradient>
<radialGradient id="spot" cx="0.5" cy="0.36" r="0.62"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
<radialGradient id="sh" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#3A2A22" stop-opacity="0.34"/><stop offset="1" stop-color="#3A2A22" stop-opacity="0"/></radialGradient>
${g.join('\n')}
</defs>`;
}

// ---------- примитивы ----------
const ell = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const shadow = (cx, cy, rx, ry = rx * 0.18) => ell(cx, cy, rx, ry, 'url(#sh)');
const ellPath = (cx, cy, rx, ry) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;

/** Кольцо с отверстием (вид сверху под углом) и толщиной. */
function ring(cx, cy, rx, ry, t, depth, mat) {
  const hole = ellPath(cx, cy, rx - t, Math.max(2, ry - t * (ry / rx)));
  return [
    `<path d="${ellPath(cx, cy + depth, rx, ry)} ${ellPath(cx, cy + depth, rx - t, Math.max(2, ry - t * (ry / rx)))}" fill-rule="evenodd" fill="url(#${mat}V)"/>`,
    `<rect x="${cx - rx}" y="${cy}" width="${2 * rx}" height="${depth}" fill="url(#${mat})" opacity="0"/>`,
    `<path d="${ellPath(cx, cy, rx, ry)} ${hole}" fill-rule="evenodd" fill="url(#${mat}T)" stroke="${MAT[mat][0]}" stroke-opacity="0.35"/>`,
  ].join('');
}

/** Вертикальный цилиндр. */
function vcyl(cx, top, w, h, mat, topMat = mat) {
  const ry = w * 0.16;
  return ell(cx, top + h, w / 2, ry, `url(#${mat})`) + `<rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" fill="url(#${mat})"/>` + ell(cx, top, w / 2, ry, `url(#${topMat}T)`, `stroke="${MAT[topMat][0]}" stroke-opacity="0.3"`);
}

/** Горизонтальный цилиндр (лежит), видна правая торцевая сторона. */
function hcyl(x1, x2, cy, r, mat, capMat = mat) {
  const rx = r * 0.32;
  return ell(x1, cy, rx, r, `url(#${mat}V)`) + `<rect x="${x1}" y="${cy - r}" width="${x2 - x1}" height="${2 * r}" fill="url(#${mat}V)"/>` + ell(x2, cy, rx, r, `url(#${capMat}T)`, `stroke="${MAT[capMat][0]}" stroke-opacity="0.35"`);
}

/** Коробка в изометрии: передняя грань, бок, верх. */
function box(x, y, w, h, d, front, side, topC) {
  return [
    `<path d="M${x} ${y}l${d} ${-d * 0.55}h${w}l${-d} ${d * 0.55}z" fill="${topC}"/>`,
    `<path d="M${x + w} ${y}l${d} ${-d * 0.55}v${h}l${-d} ${d * 0.55}z" fill="${side}"/>`,
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${front}"/>`,
  ].join('');
}

const lines = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('');

function svg(body) {
  // в файл попадают только градиенты, которые реально используются в рисунке
  const used = new Set([...body.matchAll(/url\(#([A-Za-z]+)\)/g)].map((m) => m[1]));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" width="320" height="240">${defs(used)}<rect width="320" height="240" fill="url(#bg)"/><ellipse cx="160" cy="100" rx="190" ry="140" fill="url(#spot)"/>${body}</svg>`;
}

// ---------- рисунки деталей ----------
const D = {
  // фильтр тонкой очистки: гофрированная бумага между стальными крышками
  'fuel-filter': () =>
    shadow(160, 206, 74) + vcyl(160, 54, 108, 148, 'paper') + lines(13, (i) => `<rect x="${110 + i * 8}" y="60" width="2.2" height="136" fill="#9C8560" opacity="0.45"/>`) + vcyl(160, 38, 112, 20, 'steel') + vcyl(160, 192, 112, 14, 'steel') + ring(160, 38, 22, 6, 9, 3, 'dsteel'),
  // медное уплотнительное кольцо
  'copper-ring': () => shadow(160, 168, 100) + ring(160, 130, 92, 40, 22, 12, 'copper'),
  // компрессионное поршневое кольцо с замком
  'piston-ring': () => shadow(160, 168, 104) + ring(160, 132, 96, 42, 9, 9, 'dsteel') + `<rect x="236" y="120" width="16" height="30" fill="url(#bg)"/>` + ring(160, 112, 72, 30, 7, 7, 'steel'),
  // форсунка в сборе
  injector: () =>
    shadow(160, 196, 120) + `<g transform="rotate(-18 160 120)">` + hcyl(56, 214, 120, 20, 'steel') + hcyl(214, 262, 120, 9, 'dsteel') + hcyl(262, 286, 120, 4, 'steel') + `<path d="M92 92h40l8 14v28l-8 14H92l-8-14v-28z" fill="url(#dsteelV)"/>` + hcyl(40, 58, 120, 14, 'brass') + `</g>`,
  // вкладыши коренного подшипника (две половинки)
  'bearing-shell': () => {
    const shell = (y, mat) => `<path d="M70 ${y}a90 44 0 0 0 180 0h-18a72 30 0 0 1-144 0z" fill="url(#${mat}V)"/><path d="M70 ${y}h18a72 30 0 0 0 144 0h18" fill="none" stroke="#5E4A2A" stroke-opacity="0.35"/>`;
    return shadow(160, 196, 110) + shell(108, 'steel') + `<path d="M88 108a72 30 0 0 0 144 0" fill="none" stroke="url(#brass)" stroke-width="7"/>` + shell(146, 'dsteel') + `<path d="M88 146a72 30 0 0 0 144 0" fill="none" stroke="url(#brass)" stroke-width="7"/>`;
  },
  // выпускной клапан
  valve: () => shadow(170, 198, 118) + `<g transform="rotate(-22 160 120)">` + hcyl(40, 230, 120, 7, 'steel') + `<path d="M230 113l20-26h10v66h-10l-20-26z" fill="url(#dsteelV)"/>` + ell(260, 120, 12, 33, 'url(#steelT)', 'stroke="#6F7881" stroke-opacity="0.4"') + hcyl(52, 70, 120, 9, 'dsteel') + `</g>`,
  // картридж турбокомпрессора: колесо + вал + корпус подшипников
  turbo: () =>
    shadow(160, 200, 120) + hcyl(110, 196, 132, 30, 'grey') + hcyl(70, 112, 132, 10, 'steel') + `<g>` + ell(222, 132, 34, 62, 'url(#steelT)') + lines(10, (i) => `<path d="M222 132l${(Math.cos((i / 10) * 6.283) * 32).toFixed(1)} ${(Math.sin((i / 10) * 6.283) * 60).toFixed(1)}" stroke="#7E8893" stroke-width="4" stroke-linecap="round"/>`) + ell(222, 132, 10, 18, 'url(#dsteelT)') + `</g>` + ell(70, 132, 20, 40, 'url(#dsteelT)') + lines(8, (i) => `<path d="M70 132l${(Math.cos((i / 8) * 6.283) * 18).toFixed(1)} ${(Math.sin((i / 8) * 6.283) * 37).toFixed(1)}" stroke="#4A525B" stroke-width="3"/>`),
  // прокладка головки блока
  gasket: () => {
    const holes = [[-70, 0, 30, 14], [10, 0, 30, 14], [-120, -26, 5, 2.4], [-120, 26, 5, 2.4], [60, -26, 5, 2.4], [60, 26, 5, 2.4], [-30, -30, 5, 2.4], [-30, 30, 5, 2.4]]
      .map(([dx, dy, rx, ry]) => ellPath(175 + dx, 128 + dy, rx, ry)).join(' ');
    return shadow(160, 190, 130) + `<path d="M40 150l40-58h220l-40 58z" fill="#7E8893"/><path d="M40 146l40-58h220l-40 58z ${holes}" fill-rule="evenodd" fill="url(#steelT)" stroke="#6F7881" stroke-opacity="0.4"/>` + lines(2, (i) => `<path d="${ellPath(105 + i * 80, 128, 34, 16)}" fill="none" stroke="#C8913D" stroke-width="3"/>`);
  },
  // масляный фильтр (накручиваемый)
  'oil-filter': () => shadow(160, 206, 70) + vcyl(160, 60, 104, 140, 'orange') + `<rect x="108" y="96" width="104" height="54" fill="#FFF3E8" opacity="0.92"/><rect x="118" y="108" width="60" height="7" fill="#B4532A"/><rect x="118" y="122" width="84" height="5" fill="#9A8B7E"/><rect x="118" y="133" width="70" height="5" fill="#9A8B7E"/>` + vcyl(160, 48, 100, 14, 'dsteel') + ring(160, 48, 20, 6, 8, 2, 'steel'),
  // термостат: фланец, пружина, термоэлемент
  thermostat: () =>
    shadow(160, 198, 92) + vcyl(160, 128, 60, 46, 'brass') + lines(6, (i) => `<path d="M126 ${84 + i * 8}q34 10 68 0" fill="none" stroke="url(#steel)" stroke-width="4"/>`) + vcyl(160, 72, 26, 20, 'copper') + ring(160, 126, 86, 26, 30, 6, 'steel'),
  // ремень (поликлиновой)
  belt: () => shadow(160, 196, 120) + `<path d="${ellPath(160, 128, 120, 58)} ${ellPath(160, 128, 104, 44)}" fill-rule="evenodd" fill="url(#rubberV)"/>` + lines(6, (i) => `<path d="${ellPath(160, 128, 108 + i * 2.4, 47 + i * 2)}" fill="none" stroke="#7A7470" stroke-width="0.8" opacity="0.6"/>`),
  // электростартер
  starter: () =>
    shadow(160, 202, 128) + hcyl(70, 220, 138, 42, 'black') + hcyl(220, 252, 138, 30, 'steel') + hcyl(252, 278, 138, 15, 'dsteel') + lines(9, (i) => `<rect x="${274 - 3}" y="${124 + i * 3.2}" width="10" height="2" fill="#4A525B"/>`) + hcyl(98, 200, 84, 20, 'black') + hcyl(200, 214, 84, 12, 'copper'),
  // рабочее колесо насоса: бронзовый диск с лопатками
  impeller: () =>
    shadow(160, 190, 112) + ell(160, 136, 104, 46, 'url(#brassV)') + ell(160, 128, 104, 46, 'url(#brassT)') + lines(7, (i) => {
      const a = (i / 7) * 6.283;
      return `<path d="M${160 + Math.cos(a) * 26} ${128 + Math.sin(a) * 11}Q${160 + Math.cos(a + 0.6) * 70} ${128 + Math.sin(a + 0.6) * 30} ${160 + Math.cos(a + 1.1) * 98} ${128 + Math.sin(a + 1.1) * 43}" fill="none" stroke="#8E6224" stroke-width="7" stroke-linecap="round"/>`;
    }) + ring(160, 124, 26, 12, 12, 6, 'brass'),
  // торцевое уплотнение: два кольца и пружина
  'mech-seal': () => shadow(160, 196, 96) + ring(160, 164, 70, 26, 22, 10, 'dsteel') + lines(6, (i) => `<path d="M112 ${150 - i * 9}q48 14 96 0" fill="none" stroke="url(#steel)" stroke-width="5"/>`) + ring(160, 96, 64, 24, 18, 10, 'black') + ring(160, 92, 46, 16, 10, 4, 'white'),
  // шестерённый насос
  'gear-pump': () =>
    shadow(160, 204, 126) + box(70, 92, 150, 94, 52, 'url(#greenV)', '#2F4A2C', '#86A97C') + lines(2, (i) => ring(118 + i * 58, 138, 26, 26, 8, 0, 'steel') + lines(10, (k) => `<rect x="${116 + i * 58}" y="${109}" width="4" height="7" fill="#C9D0D7" transform="rotate(${k * 36} ${118 + i * 58} 138)"/>`)) + hcyl(232, 268, 112, 10, 'steel'),
  // шариковый подшипник 6309-2RS
  'ball-bearing': () =>
    shadow(160, 204, 92) + `<path d="${ellPath(160, 124, 86, 86)} ${ellPath(160, 124, 64, 64)}" fill-rule="evenodd" fill="url(#steelT)"/>` + `<path d="${ellPath(160, 124, 66, 66)} ${ellPath(160, 124, 44, 44)}" fill-rule="evenodd" fill="#B83A2A" opacity="0.9"/>` + `<path d="${ellPath(160, 124, 44, 44)} ${ellPath(160, 124, 24, 24)}" fill-rule="evenodd" fill="url(#steel)"/>` + ell(160, 124, 24, 24, 'url(#bg)'),
  // тарелка сепаратора (коническая)
  'separator-disc': () =>
    shadow(160, 190, 112) + `<path d="M50 150Q160 70 270 150Q160 196 50 150z" fill="url(#steelV)"/><path d="M50 150Q160 70 270 150" fill="none" stroke="#6F7881" stroke-width="2"/>` + lines(12, (i) => `<path d="M160 104L${60 + i * 18.5} ${150 + Math.sin((i / 11) * 3.14) * 22}" stroke="#7E8893" stroke-width="1.6" opacity="0.7"/>`) + ell(160, 104, 26, 10, 'url(#bg)', 'stroke="#6F7881"'),
  // ремкомплект: коробка и кольца
  'seal-kit': () =>
    shadow(160, 204, 130) + box(84, 86, 120, 90, 46, '#E3C79A', '#B8935E', '#F2DDB8') + `<rect x="98" y="104" width="92" height="22" fill="#B4532A"/><rect x="98" y="136" width="70" height="6" fill="#9C8560"/>` + ring(238, 182, 40, 13, 9, 5, 'black') + ring(84, 192, 34, 11, 7, 4, 'rubber') + ring(262, 140, 22, 8, 6, 4, 'copper'),
  // фильтроэлемент льяльного сепаратора
  coalescer: () => shadow(160, 208, 66) + vcyl(160, 44, 96, 158, 'white') + lines(9, (i) => `<rect x="112" y="${58 + i * 16}" width="96" height="3" fill="#C9CED3"/>`) + vcyl(160, 34, 100, 12, 'blue') + vcyl(160, 196, 100, 10, 'blue') + ring(160, 34, 20, 6, 8, 2, 'white'),
  // опорный подшипник гребного вала (втулка с канавками)
  'shaft-bearing': () => shadow(160, 204, 128) + hcyl(70, 240, 132, 58, 'brass', 'brass') + ring(240, 132, 18, 56, 10, 0, 'rubber') + lines(6, (i) => `<rect x="${86 + i * 26}" y="76" width="6" height="112" fill="#8E6224" opacity="0.5"/>`),
  // дейдвудное уплотнение: большое кольцо с манжетами
  'stern-seal': () => shadow(160, 200, 126) + ring(160, 146, 116, 48, 26, 18, 'dsteel') + ring(160, 112, 96, 38, 20, 14, 'black') + ring(160, 88, 78, 30, 14, 10, 'steel'),
  // капролоновая втулка
  bushing: () => shadow(160, 204, 128) + hcyl(70, 230, 132, 58, 'cream') + `<path d="${ellPath(230, 132, 18.5, 58)} ${ellPath(230, 132, 12, 36)}" fill-rule="evenodd" fill="url(#creamT)"/>` + ell(230, 132, 12, 36, '#A99670'),
  // шпонка гребного винта
  key: () => shadow(160, 190, 128) + box(54, 118, 200, 40, 60, 'url(#steelV)', '#7E8893', '#E4E8EC') + `<rect x="54" y="118" width="200" height="40" fill="none" stroke="#6F7881" stroke-opacity="0.4"/>`,
  // реле контроля фаз (модуль на DIN-рейку)
  relay: () =>
    shadow(160, 206, 90) + `<rect x="60" y="150" width="200" height="16" fill="url(#steelV)"/>` + box(114, 58, 72, 140, 38, '#F4F2EE', '#C9C4BC', '#FFFFFF') + `<rect x="124" y="76" width="52" height="30" fill="#2F5D73"/><circle cx="136" cy="122" r="5" fill="#3F6B2E"/><circle cx="152" cy="122" r="5" fill="#E3A515"/><rect x="124" y="140" width="52" height="8" fill="#B8BCC0"/>` + lines(3, (i) => `<circle cx="${130 + i * 20}" cy="66" r="4" fill="#9AA3AD"/><circle cx="${130 + i * 20}" cy="188" r="4" fill="#9AA3AD"/>`),
  // автоматический выключатель в литом корпусе
  breaker: () =>
    shadow(160, 208, 106) + box(80, 54, 128, 150, 50, '#2F3438', '#141414', '#5A6067') + `<rect x="96" y="70" width="96" height="24" fill="#DDE1E5"/><rect x="128" y="112" width="32" height="48" rx="4" fill="#141414"/><rect x="134" y="98" width="20" height="30" rx="3" fill="#E06A3A"/>` + lines(3, (i) => `<rect x="${96 + i * 34}" y="178" width="20" height="16" fill="#C8913D"/>`),
  // палубный светодиодный прожектор
  floodlight: () =>
    shadow(160, 210, 110) + `<path d="M160 196v-40" stroke="url(#dsteel)" stroke-width="10"/><path d="M110 196h100" stroke="url(#dsteel)" stroke-width="8" stroke-linecap="round"/>` + box(80, 66, 150, 92, 34, 'url(#greyV)', '#4C565F', '#A9B3BC') + `<rect x="92" y="78" width="126" height="68" fill="#FFF6D8"/>` + lines(4, (i) => lines(6, (k) => `<circle cx="${106 + k * 20}" cy="${88 + i * 16}" r="5" fill="#FFE08A" stroke="#E3A515"/>`)),
  // датчик давления
  'pressure-sensor': () =>
    shadow(160, 204, 80) + vcyl(160, 60, 64, 96, 'steel') + `<path d="M128 156h64l10 14v14l-10 14h-64l-10-14v-14z" fill="url(#dsteel)"/>` + vcyl(160, 198, 30, 14, 'brass') + `<path d="M160 60c0-30 60-30 90-10" fill="none" stroke="#2E2C2A" stroke-width="10" stroke-linecap="round"/>` + vcyl(160, 48, 30, 14, 'black'),
  // AGM-аккумулятор
  battery: () =>
    shadow(160, 210, 134) + box(56, 82, 180, 116, 56, 'url(#greyV)', '#3E4A55', '#76818B') + `<rect x="56" y="112" width="180" height="34" fill="#B4532A"/><rect x="70" y="122" width="90" height="8" fill="#FFF3E8"/><rect x="70" y="160" width="60" height="8" fill="#A9B3BC"/>` + vcyl(110, 46, 22, 12, 'dsteel') + vcyl(206, 46, 22, 12, 'dsteel') + `<rect x="196" y="24" width="20" height="5" fill="#B83A2A"/><rect x="100" y="24" width="20" height="5" fill="#2F3438"/>`,
  // бухта стального каната
  // бухта стального каната: витки лежат плоско, свободный конец уходит вправо
  rope: () =>
    shadow(160, 190, 128, 26) +
    lines(5, (i) => {
      const rx = 116 - i * 18;
      const ry = 48 - i * 7.5;
      return `<path d="${ellPath(160, 140 - i * 4, rx, ry)}" fill="none" stroke="#5E6670" stroke-width="15"/><path d="${ellPath(160, 138 - i * 4, rx, ry)}" fill="none" stroke="url(#steelV)" stroke-width="12"/><path d="${ellPath(160, 138 - i * 4, rx, ry)}" fill="none" stroke="#6F7881" stroke-width="12" stroke-dasharray="2 4" opacity="0.45"/>`;
    }) +
    `<path d="M276 138c22 4 30 20 22 40" fill="none" stroke="url(#steelV)" stroke-width="12" stroke-linecap="round"/>` + ell(160, 122, 22, 8, 'url(#bg)'),
  // такелажная скоба
  shackle: () =>
    shadow(160, 206, 96) + `<path d="M98 76v54a62 62 0 0 0 124 0V76" fill="none" stroke="url(#steel)" stroke-width="26"/><path d="M98 76v54a62 62 0 0 0 124 0V76" fill="none" stroke="#6F7881" stroke-width="26" opacity="0.15"/>` + hcyl(70, 246, 72, 13, 'dsteel') + ell(70, 72, 18, 18, 'url(#dsteelT)') + ell(70, 72, 7, 7, 'url(#bg)'),
  // пневматический кранец в сетке из шин
  fender: () =>
    shadow(160, 212, 140) + hcyl(60, 250, 132, 62, 'rubber', 'rubber') + lines(5, (i) => `<rect x="${72 + i * 36}" y="70" width="26" height="124" rx="8" fill="#141414" opacity="0.7"/>`) + lines(4, (i) => `<path d="M60 ${88 + i * 30}h190" stroke="#8A8580" stroke-width="2" opacity="0.6"/>`),
  // однорольный блок
  'pulley-block': () =>
    shadow(160, 210, 86) + `<path d="M160 40c-20 0-24 26 0 30" fill="none" stroke="url(#steel)" stroke-width="9" stroke-linecap="round"/>` + vcyl(160, 66, 16, 14, 'dsteel') + `<rect x="104" y="80" width="112" height="118" rx="54" fill="url(#orangeV)"/>` + ell(160, 139, 40, 40, 'url(#steelT)') + ell(160, 139, 14, 14, 'url(#dsteelT)'),
  // УКВ-антенна
  antenna: () => shadow(160, 210, 70) + `<g transform="rotate(-24 160 160)">` + `<rect x="152" y="16" width="16" height="164" rx="8" fill="url(#white)"/>` + vcyl(160, 172, 34, 24, 'steel') + vcyl(160, 194, 52, 10, 'dsteel') + `</g>`,
  // датчик эхолота
  transducer: () => shadow(160, 196, 100) + vcyl(160, 110, 150, 46, 'steel') + ell(160, 110, 50, 12, 'url(#blackT)') + `<path d="M160 104c0-60 80-70 120-40" fill="none" stroke="#2E2C2A" stroke-width="9" stroke-linecap="round"/>` + vcyl(160, 92, 26, 12, 'dsteel'),
  // батарея аварийного радиобуя
  'epirb-battery': () =>
    shadow(160, 206, 110) + box(80, 76, 140, 120, 40, 'url(#yellowV)', '#9A6A06', '#FFD566') + `<rect x="94" y="96" width="112" height="46" fill="#FFF8E1"/><rect x="104" y="106" width="70" height="8" fill="#B4532A"/><rect x="104" y="122" width="88" height="6" fill="#9A8B7E"/>` + `<path d="M220 140c40 0 50 30 30 46" fill="none" stroke="#2E2C2A" stroke-width="7" stroke-linecap="round"/>`,
  // топовый ходовой огонь
  'nav-light': () =>
    shadow(160, 210, 80) + vcyl(160, 162, 92, 34, 'white') + `<rect x="122" y="72" width="76" height="92" fill="#FFF6D8" opacity="0.9"/>` + lines(4, (i) => `<rect x="122" y="${82 + i * 22}" width="76" height="3" fill="#E3A515" opacity="0.6"/>`) + `<rect x="122" y="72" width="76" height="92" fill="url(#white)" opacity="0.35"/>` + vcyl(160, 52, 92, 22, 'white') + ell(160, 116, 14, 30, '#FFE08A', 'opacity="0.9"'),
};

// производитель → рисунок
const MAP = {
  '6L20-FF-118': 'fuel-filter',
  'L23-302-11': 'copper-ring',
  '6L20-INJ-02': 'injector',
  '6L20-PR-031': 'piston-ring',
  '6L20-MB-205': 'bearing-shell',
  'L23-EXV-07': 'valve',
  'TCR18-CART': 'turbo',
  '6L20-HG-12': 'gasket',
  'DG-OF-2240': 'oil-filter',
  'DG-TH-82': 'thermostat',
  'DG-BLT-1450': 'belt',
  'DG-ST-24V': 'starter',
  'CNP-150-IMP': 'impeller',
  'MS-45-SW': 'mech-seal',
  'GP-25-FT': 'gear-pump',
  '6309-2RS': 'ball-bearing',
  'MOPX-205-D': 'separator-disc',
  'MOPX-205-KIT': 'seal-kit',
  'OWS-15-CE': 'coalescer',
  'SB-280-W': 'shaft-bearing',
  'ST-SEAL-300': 'stern-seal',
  'SB-BUSH-220': 'bushing',
  'PK-80-22': 'key',
  'EKF-RKF-3': 'relay',
  'NSX-63-3P': 'breaker',
  'LED-DK-50': 'floodlight',
  'PS-10B-420': 'pressure-sensor',
  'AGM-12-190': 'battery',
  'GOST-7668-24': 'rope',
  'SHK-12T': 'shackle',
  'PF-1015': 'fender',
  'BLK-5T-1': 'pulley-block',
  'VHF-ANT-1.5': 'antenna',
  'TR-200-SS': 'transducer',
  'EPIRB-BAT-3': 'epirb-battery',
  'NAV-MH-LED': 'nav-light',
};

let total = 0;
for (const [mpn, kind] of Object.entries(MAP)) {
  const content = svg(D[kind]());
  writeFileSync(join(out, `${slug(mpn)}.svg`), content);
  total += content.length;
}
console.log(`Нарисовано ${Object.keys(MAP).length} иллюстраций, в среднем ${Math.round(total / Object.keys(MAP).length / 1024 * 10) / 10} КБ`);
