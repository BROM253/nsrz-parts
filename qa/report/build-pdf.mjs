// Отчёт о тестировании (этап 5) в PDF — из того же содержания, что и Word (content.mjs).
// Вёрстка — HTML + CSS для печати, печать — установленный Edge (Playwright).
// Номера страниц в оглавлении точные: первый проход печатает PDF, pdf.js находит страницы заголовков, второй — вписывает их.
//   node report/build-pdf.mjs [путь.pdf]
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { body, META } from './content.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? join(here, 'out', 'Отчёт о тестировании (этап 5).pdf');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Неразрывные пробелы как в Word-версии + **жирный**. */
const inline = (text) =>
  esc(
    String(text)
      .replace(/(\d) (%|мс|с\b|с,|с\.|шт\.|ГБ|КБ|МБ|мин|ч\b|мм|запрос)/g, '$1 $2')
      .replace(/(п\.|ТЗ) (\d)/g, '$1 $2'),
  ).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

const headings = body.filter((b) => b.type === 'h1' || b.type === 'h2');

function render(pages = {}) {
  let tableNo = 0;
  let figureNo = 0;
  const html = body
    .map((b) => {
      switch (b.type) {
        case 'h1':
          return `<h1>${inline(b.text)}</h1>`;
        case 'h2':
          return `<h2>${inline(b.text)}</h2>`;
        case 'p':
          return `<p class="t">${inline(b.text)}</p>`;
        case 'ul':
          return `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`;
        case 'ol':
          return `<ol>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ol>`;
        case 'table': {
          tableNo++;
          const total = b.widths.reduce((s, w) => s + w, 0);
          const cols = b.widths.map((w) => `<col style="width:${((w / total) * 100).toFixed(2)}%">`).join('');
          const cell = (tag, t) => `<${tag}>${String(t).split('\n').map(inline).join('<br>')}</${tag}>`;
          // короткие таблицы не разрываются: подпись и все строки — на одной странице
          const keep = b.rows.length <= 8 ? ' keep' : '';
          return (
            `<div class="tblock${keep}"><div class="tcap">Таблица ${tableNo} — ${inline(b.caption)}</div>` +
            `<table class="${b.size}"><colgroup>${cols}</colgroup>` +
            `<thead><tr>${b.header.map((h) => cell('th', h)).join('')}</tr></thead>` +
            `<tbody>${b.rows.map((r) => `<tr>${r.map((c) => cell('td', c)).join('')}</tr>`).join('')}</tbody></table></div>`
          );
        }
        case 'figure': {
          figureNo++;
          const data = readFileSync(b.file).toString('base64');
          return `<figure><img src="data:image/png;base64,${data}"><figcaption>Рисунок ${figureNo} — ${inline(b.caption)}</figcaption></figure>`;
        }
        case 'code':
          return `<pre class="code">${b.lines.map(esc).join('\n')}</pre>`;
        default:
          throw new Error(`неизвестный блок ${b.type}`);
      }
    })
    .join('\n');

  const toc = headings
    .map((h) => `<div class="toc-row l${h.type === 'h1' ? 1 : 2}"><span class="name">${inline(h.text)}</span><span class="dots"></span><span class="num">${pages[h.text] ?? ''}</span></div>`)
    .join('');

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Отчёт о тестировании — этап 5</title><style>
@page { size: A4; margin: 20mm 15mm 20mm 30mm;
  @bottom-center { content: counter(page); font-family: 'Times New Roman', serif; font-size: 12pt; } }
@page :first { @bottom-center { content: none; } }
html { font-family: 'Times New Roman', serif; font-size: 14pt; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; }
p.t { margin: 0; text-align: justify; text-indent: 12.5mm; line-height: 1.5; orphans: 2; widows: 2; }
h1, h2 { font-size: 14pt; font-weight: bold; line-height: 1.5; margin: 0; break-after: avoid; }
h1 { break-before: page; margin-bottom: 12pt; }
h2 { margin: 12pt 0 12pt; }
ul, ol { margin: 0; padding-left: 17.5mm; line-height: 1.5; text-align: justify; }
ul { list-style: none; }
ul li { position: relative; }
ul li::before { content: '–'; position: absolute; left: -5mm; }
ol li::marker { content: counter(list-item) ') '; }
.tcap { margin: 10pt 0 4pt; line-height: 1.2; break-after: avoid; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; line-height: 1.15; margin-bottom: 8pt; }
table.small { font-size: 12pt; } table.tiny { font-size: 11pt; }
th, td { border: 0.6pt solid #8C7B6B; padding: 2.5pt 4pt; vertical-align: middle; text-align: left; overflow-wrap: break-word; }
th { background: #F3E6DA; font-weight: bold; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
.tblock.keep { break-inside: avoid; }
figure { margin: 10pt 0; text-align: center; break-inside: avoid; }
figure img { width: 100%; }
figcaption { margin-top: 4pt; line-height: 1.2; }
pre.code { font: 10pt Consolas, monospace; margin: 6pt 0 0 5mm; line-height: 1.25; white-space: pre-wrap; }
.title { height: 256mm; display: flex; flex-direction: column; text-align: center; line-height: 1.5; break-after: page; }
.title .big { font-size: 16pt; font-weight: bold; }
.title .author { align-self: flex-end; text-align: left; width: 70mm; }
.toc-head { text-align: center; font-weight: bold; margin-bottom: 12pt; }
.toc-row { display: flex; align-items: baseline; line-height: 1.5; }
.toc-row.l2 { padding-left: 7mm; }
.toc-row .dots { flex: 1; border-bottom: 1.2pt dotted #000; margin: 0 4pt; transform: translateY(-4pt); }
.toc-row .num { min-width: 7mm; text-align: right; }
</style></head><body>
<section class="title">
  <div>${inline(META.course)}</div>
  <div style="flex: 1.2"></div>
  ${META.title.map((t) => `<div class="big">${inline(t)}</div>`).join('')}
  <div style="height: 12pt"></div>
  ${META.subtitle.map((t) => `<div>${inline(t)}</div>`).join('')}
  <div style="flex: 1"></div>
  <div class="author">Выполнил:<br>студент группы ${inline(META.group)}<br>${inline(META.author)}</div>
  <div style="flex: 1"></div>
  <div>${inline(META.city)}</div>
</section>
<section class="toc"><div class="toc-head">СОДЕРЖАНИЕ</div>${toc}</section>
${html}
</body></html>`;
}

/** Страница каждого заголовка в готовом PDF (поиск строки целиком, по порядку, начиная с 3-й страницы). */
async function headingPages(pdf) {
  const doc = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
  const lines = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    const byY = new Map();
    for (const it of content.items) {
      const y = Math.round(it.transform[5]);
      byY.set(y, (byY.get(y) ?? '') + it.str);
    }
    lines.push([...byY.values()].map((s) => s.replace(/\s+/g, ' ').trim()));
  }
  const result = {};
  let from = 3;
  for (const h of headings) {
    const want = h.text.replace(/\s+/g, ' ').trim();
    for (let pg = from; pg <= doc.numPages; pg++) {
      if (lines[pg - 1].includes(want)) {
        result[h.text] = pg;
        from = pg;
        break;
      }
    }
    if (!(h.text in result)) throw new Error(`Заголовок не найден в PDF: ${h.text}`);
  }
  return { pages: result, total: doc.numPages };
}

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
const print = async (html) => {
  await page.setContent(html, { waitUntil: 'load' });
  return page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
};

const draft = await print(render());
const { pages } = await headingPages(draft);
const final = await print(render(pages));
const check = await headingPages(final);
await browser.close();

const moved = Object.keys(pages).filter((k) => pages[k] !== check.pages[k]);
if (moved.length) throw new Error('После вписывания номеров заголовки сместились: ' + moved.join(', '));
writeFileSync(OUT, final);
console.log(`PDF: ${OUT} — ${check.total} стр.`);
console.log('Оглавление:', headings.map((h) => `${check.pages[h.text]} ${h.text}`).join(' | '));
