// PDF-документы проекта (отчёты этапов, инструкции пользователей) из модулей содержания.
// Вёрстка — HTML + CSS для печати, печать — установленный Edge (Playwright).
// Номера страниц в оглавлении точные: первый проход печатает PDF, pdf.js находит страницы заголовков, второй — вписывает их.
//
//   node report/build-pdf.mjs [модуль-содержания.mjs] [путь.pdf]
//   (без модуля — отчёт о тестировании report/content.mjs)
//
// Модуль содержания экспортирует META и body (блоки: h1, h2, h3, p, ul, ol, table, figure, figrow, note, qr, code, pagebreak).
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, extname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import QRCode from 'qrcode';

const here = dirname(fileURLToPath(import.meta.url));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Неразрывные пробелы (число и единица, «п. 4.4») + **жирный** + `код`. */
export const inline = (text) =>
  esc(
    String(text)
      .replace(/(\d) (%|мс|с\b|с,|с\.|шт\.|ГБ|КБ|МБ|мин|ч\b|мм|запрос)/g, '$1 $2')
      .replace(/(п\.|ТЗ) (\d)/g, '$1 $2'),
  )
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

const dataUri = (file) => `data:image/${extname(file).toLowerCase() === '.png' ? 'png' : 'jpeg'};base64,${readFileSync(file).toString('base64')}`;

async function renderBody(body, meta = {}) {
  let tableNo = 0;
  let figureNo = 0;
  const out = [];
  for (const b of body) {
    switch (b.type) {
      case 'h1':
        out.push(`<h1${(b.newPage ?? meta.chapterBreak ?? true) === false ? ' class="same-page"' : ''}>${inline(b.text)}</h1>`);
        break;
      case 'h2':
        out.push(`<h2>${inline(b.text)}</h2>`);
        break;
      case 'h3':
        out.push(`<h3>${inline(b.text)}</h3>`);
        break;
      case 'p':
        out.push(`<p class="t${b.noIndent ? ' ni' : ''}">${inline(b.text)}</p>`);
        break;
      case 'ul':
        out.push(`<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`);
        break;
      case 'ol':
        out.push(`<ol>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ol>`);
        break;
      case 'table': {
        tableNo++;
        const total = b.widths.reduce((s, w) => s + w, 0);
        const cols = b.widths.map((w) => `<col style="width:${((w / total) * 100).toFixed(2)}%">`).join('');
        const cell = (tag, t) => `<${tag}>${String(t).split('\n').map(inline).join('<br>')}</${tag}>`;
        // короткие таблицы не разрываются: подпись и все строки — на одной странице
        const keep = b.rows.length <= 8 ? ' keep' : '';
        out.push(
          `<div class="tblock${keep}"><div class="tcap">${meta.tableNumbers === false ? `<b>${inline(b.caption)}</b>` : `Таблица ${tableNo} — ${inline(b.caption)}`}</div>` +
            `<table class="${b.size ?? 'small'}"><colgroup>${cols}</colgroup>` +
            `<thead><tr>${b.header.map((h) => cell('th', h)).join('')}</tr></thead>` +
            `<tbody>${b.rows.map((r) => `<tr>${r.map((c) => cell('td', c)).join('')}</tr>`).join('')}</tbody></table></div>`,
        );
        break;
      }
      case 'figure':
        figureNo++;
        out.push(
          `<figure><img style="width:${b.width ?? 100}%" src="${dataUri(b.file)}"><figcaption>Рисунок ${figureNo} — ${inline(b.caption)}</figcaption></figure>`,
        );
        break;
      case 'figrow':
        // несколько экранов телефона рядом, одна подпись
        figureNo++;
        out.push(
          `<figure><div class="row">${b.files
            .map((f, i) => `<div class="cell"><img style="height:${b.heightMm ?? 95}mm" src="${dataUri(f)}">${b.labels ? `<div class="lbl">${inline(b.labels[i])}</div>` : ''}</div>`)
            .join('')}</div><figcaption>Рисунок ${figureNo} — ${inline(b.caption)}</figcaption></figure>`,
        );
        break;
      case 'note': {
        const title = b.title ?? { warn: 'Важно', tip: 'Совет', info: 'Обратите внимание' }[b.kind ?? 'info'];
        const content = b.items ? `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>` : `<div>${inline(b.text)}</div>`;
        out.push(`<div class="note ${b.kind ?? 'info'}"><div class="nt">${inline(title)}</div>${content}</div>`);
        break;
      }
      case 'qr': {
        const png = await QRCode.toDataURL(b.text, { margin: 1, width: 600, color: { dark: '#2F2620', light: '#FFFFFF' } });
        out.push(`<div class="qr"><img style="width:${b.sizeMm ?? 40}mm" src="${png}"><div>${inline(b.caption ?? b.text)}</div></div>`);
        break;
      }
      case 'code':
        out.push(`<pre class="code">${b.lines.map(esc).join('\n')}</pre>`);
        break;
      case 'pagebreak':
        out.push('<div class="pb"></div>');
        break;
      default:
        throw new Error(`неизвестный блок ${b.type}`);
    }
  }
  return out.join('\n');
}

function titlePage(m) {
  if (m.titlePage === false) return '';
  if (m.kind === 'manual') {
    return `<section class="title">
      <div>${inline(m.product)}</div>
      <div style="flex: 1"></div>
      ${(m.title ?? []).map((t) => `<div class="big">${inline(t)}</div>`).join('')}
      <div style="height: 14pt"></div>
      ${(m.subtitle ?? []).map((t) => `<div>${inline(t)}</div>`).join('')}
      <div style="flex: 1.2"></div>
      ${(m.info ?? []).map((t) => `<div class="info">${inline(t)}</div>`).join('')}
      <div style="flex: 0.6"></div>
      <div>${inline(m.city)}</div>
    </section>`;
  }
  return `<section class="title">
    <div>${inline(m.course)}</div>
    <div style="flex: 1.2"></div>
    ${m.title.map((t) => `<div class="big">${inline(t)}</div>`).join('')}
    <div style="height: 12pt"></div>
    ${m.subtitle.map((t) => `<div>${inline(t)}</div>`).join('')}
    <div style="flex: 1"></div>
    <div class="author">Выполнил:<br>студент группы ${inline(m.group)}<br>${inline(m.author)}</div>
    <div style="flex: 1"></div>
    <div>${inline(m.city)}</div>
  </section>`;
}

const CSS = (m) => `
@page { size: A4; margin: 20mm 15mm 20mm 30mm;
  @bottom-center { content: counter(page); font-family: 'Times New Roman', serif; font-size: 12pt; }
  ${m.header ? `@top-right { content: "${m.header.replace(/"/g, '\\"')}"; font-family: 'Times New Roman', serif; font-size: 10pt; color: #6E5F53; }` : ''} }
${m.titlePage === false ? '' : '@page :first { @bottom-center { content: none; } @top-right { content: none; } }'}${m.pageNumbers === false ? '@page { @bottom-center { content: none; } }' : ''}
html { font-family: 'Times New Roman', serif; font-size: 14pt; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; }
p.t { margin: 0; text-align: justify; text-indent: 12.5mm; line-height: 1.5; orphans: 2; widows: 2; }
p.t.ni { text-indent: 0; break-after: avoid; }
h1, h2, h3 { font-size: 14pt; font-weight: bold; line-height: 1.5; margin: 0; break-after: avoid; }
h1 { break-before: page; margin-bottom: 12pt; }
h1.same-page { break-before: auto; margin-top: 18pt; }
h2 { margin: 12pt 0 10pt; }
h3 { font-style: italic; margin: 8pt 0 4pt; }
ul, ol { margin: 0; padding-left: 17.5mm; line-height: 1.5; text-align: justify; }
ul { list-style: none; }
ul li { position: relative; }
ul li::before { content: '–'; position: absolute; left: -5mm; }
ol li::marker { content: counter(list-item) ') '; }
code { font-family: Consolas, monospace; font-size: 11.5pt; background: #F5EEE6; padding: 0 2pt; border-radius: 2pt; }
.tcap { margin: 10pt 0 4pt; line-height: 1.2; break-after: avoid; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; line-height: 1.15; margin-bottom: 8pt; }
table.small { font-size: 12pt; } table.tiny { font-size: 11pt; }
th, td { border: 0.6pt solid #8C7B6B; padding: 2.5pt 4pt; vertical-align: middle; text-align: left; overflow-wrap: break-word; }
th { background: #F3E6DA; font-weight: bold; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
.tblock.keep { break-inside: avoid; }
figure { margin: 10pt 0; text-align: center; break-inside: avoid; }
figure img { border: 0.6pt solid #CBBBAA; }
figure .row { display: flex; justify-content: center; gap: 6mm; }
figure .cell { text-align: center; }
figure .lbl { font-size: 11pt; margin-top: 2pt; }
figcaption { margin-top: 4pt; line-height: 1.2; }
.note { border-left: 3pt solid #B4532A; background: #FBF4EC; padding: 5pt 8pt; margin: 8pt 0; line-height: 1.35; font-size: 13pt; break-inside: avoid; }
.note.warn { border-left-color: #A8392C; background: #FBEDEA; }
.note.tip { border-left-color: #3F6B2E; background: #EEF4EA; }
.note .nt { font-weight: bold; margin-bottom: 2pt; }
.note ul { padding-left: 6mm; line-height: 1.35; }
.note ul li::before { left: -4mm; }
.qr { display: flex; align-items: center; gap: 6mm; margin: 8pt 0; break-inside: avoid; line-height: 1.35; }
pre.code { font: 10pt Consolas, monospace; margin: 6pt 0 0 5mm; line-height: 1.25; white-space: pre-wrap; }
.pb { break-after: page; }
${m.compact ? 'html { font-size: 13pt; } p.t, ul, ol { line-height: 1.32; } h1 { margin-bottom: 6pt; } h1.same-page { margin-top: 10pt; } h2 { margin: 8pt 0 4pt; } .tcap { margin: 6pt 0 3pt; } .note { margin: 5pt 0; }' : ''}
.title { height: 256mm; display: flex; flex-direction: column; text-align: center; line-height: 1.5; break-after: page; }
.title .big { font-size: 18pt; font-weight: bold; }
.title .info { font-size: 13pt; }
.title .author { align-self: flex-end; text-align: left; width: 70mm; }
.toc { break-after: page; }
.toc-head { text-align: center; font-weight: bold; margin-bottom: 12pt; }
.toc-row { display: flex; align-items: baseline; line-height: 1.5; }
.toc-row.l2 { padding-left: 7mm; }
.toc-row .dots { flex: 1; border-bottom: 1.2pt dotted #000; margin: 0 4pt; transform: translateY(-4pt); }
.toc-row .num { min-width: 7mm; text-align: right; }
`;

/** Страница каждого заголовка в готовом PDF (поиск строки целиком, по порядку, после оглавления). */
async function headingPages(pdf, headings, firstPage) {
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
  let from = firstPage;
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

/** Собрать PDF: META (титул, оглавление, колонтитул) + блоки содержания. */
export async function buildPdf(meta, body, outPath) {
  const toc = meta.toc !== false;
  const headings = body.filter((b) => b.type === 'h1' || b.type === 'h2');
  const bodyHtml = await renderBody(body, meta);
  const html = (pages = {}) => {
    const tocHtml = toc
      ? `<section class="toc"><div class="toc-head">СОДЕРЖАНИЕ</div>${headings
          .map((h) => `<div class="toc-row l${h.type === 'h1' ? 1 : 2}"><span class="name">${inline(h.text)}</span><span class="dots"></span><span class="num">${pages[h.text] ?? ''}</span></div>`)
          .join('')}</section>`
      : '';
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(meta.docTitle ?? 'Документ')}</title><style>${CSS(meta)}</style></head><body>${titlePage(meta)}${tocHtml}${bodyHtml}</body></html>`;
  };
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage();
    const print = async (h) => {
      await page.setContent(h, { waitUntil: 'load' });
      return page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
    };
    let pdf = await print(html());
    let info = { total: null, pages: {} };
    if (toc) {
      const first = await headingPages(pdf, headings, 3);
      pdf = await print(html(first.pages));
      info = await headingPages(pdf, headings, 3);
      const moved = Object.keys(first.pages).filter((k) => first.pages[k] !== info.pages[k]);
      if (moved.length) throw new Error('После вписывания номеров заголовки сместились: ' + moved.join(', '));
    } else {
      info.total = (await getDocument({ data: new Uint8Array(pdf) }).promise).numPages;
    }
    writeFileSync(outPath, pdf);
    return info;
  } finally {
    await browser.close();
  }
}

// ── запуск из командной строки ──
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const mod = args[0]?.endsWith('.mjs') ? args.shift() : join(here, 'content.mjs');
  const { META, body } = await import(pathToFileURL(isAbsolute(mod) ? mod : resolve(mod)).href);
  const out = args[0] ?? join(here, 'out', `${META.fileName ?? 'Документ'}.pdf`);
  const info = await buildPdf(META, body, out);
  console.log(`PDF: ${out} — ${info.total} стр.`);
}
