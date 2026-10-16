// Отчёт о тестировании (этап 5) в формате Word.
// node report/build-docx.mjs [путь.docx]
// Рисунки: report/out/*.png (node report/charts.mjs, скриншот отчёта Playwright — report/screenshot.mjs).
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  convertMillimetersToTwip as mm,
} from 'docx';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { imageSize } from './png-size.mjs';
import { body as blocks } from './content.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? join(here, 'out', 'Отчёт о тестировании (этап 5).docx');

const FONT = 'Times New Roman';
const BODY = 28; // 14 pt
const SMALL = 24; // 12 pt — таблицы
const TINY = 22; // 11 pt — широкие таблицы
const CONTENT_MM = 210 - 30 - 15; // ширина текста

/** «текст **жирный** текст» → набор TextRun. */
function runs(text, size = BODY, extra = {}) {
  // число и единица измерения не разрываются по строкам: «0,00 %», «279 мс», «7 шт.»
  return String(text)
    .replace(/(\d) (%|мс|с\b|с,|с\.|шт\.|ГБ|КБ|МБ|мин|ч\b|мм|запрос)/g, '$1 $2')
    .replace(/(п\.|ТЗ) (\d)/g, '$1 $2')
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('**')
        ? new TextRun({ text: part.slice(2, -2), bold: true, size, font: FONT, ...extra })
        : new TextRun({ text: part, size, font: FONT, ...extra }),
    );
}

const p = (text, opts = {}) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: mm(12.5) },
    spacing: { line: 360, after: 0 },
    children: runs(text),
    ...opts,
  });

const HEADINGS = [];
const h1 = (text) => (HEADINGS.push({ level: 1, text }), new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text, font: FONT })] }));
const h2 = (text) => (HEADINGS.push({ level: 2, text }), new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, font: FONT })] }));

const bullets = (items) =>
  items.map((t) => new Paragraph({ numbering: { reference: 'dash', level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { line: 360 }, children: runs(t) }));

let numberingInstance = 0;
const numbered = (items) => {
  numberingInstance++;
  return items.map(
    (t) =>
      new Paragraph({
        numbering: { reference: 'numbers', level: 0, instance: numberingInstance },
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: 360 },
        children: runs(t),
      }),
  );
};

let tableNo = 0;
let figureNo = 0;

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: '8C7B6B' };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

/** Таблица с подписью «Таблица N — …» над ней (ГОСТ 7.32). widths — в мм, в сумме ≈ ширина текста. */
function table(caption, header, rows, widths, size = SMALL) {
  tableNo++;
  const total = widths.reduce((s, w) => s + w, 0);
  const tw = widths.map((w) => mm((w / total) * CONTENT_MM));
  const cell = (text, isHeader) =>
    new TableCell({
      borders,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      shading: isHeader ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F3E6DA' } : undefined,
      children: String(text)
        .split('\n')
        .map((line) => new Paragraph({ spacing: { line: 240 }, children: runs(line, size, isHeader ? { bold: true } : {}) })),
    });
  return [
    new Paragraph({
      keepNext: true,
      spacing: { before: 200, after: 80, line: 276 },
      children: runs(`Таблица ${tableNo} — ${caption}`),
    }),
    new Table({
      width: { size: tw.reduce((s, w) => s + w, 0), type: WidthType.DXA },
      columnWidths: tw,
      rows: [
        new TableRow({ tableHeader: true, cantSplit: true, children: header.map((h) => cell(h, true)) }),
        ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c) => cell(c, false)) })),
      ],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}

/** Рисунок по ширине текста с подписью «Рисунок N — …» под ним. */
function figure(file, caption, widthMm = CONTENT_MM) {
  if (!existsSync(file)) {
    console.warn('нет рисунка:', file);
    return [];
  }
  figureNo++;
  const data = readFileSync(file);
  const { width, height } = imageSize(data);
  const wPx = Math.round((widthMm / 25.4) * 96);
  const hPx = Math.round((wPx * height) / width);
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 200 }, children: [new ImageRun({ type: 'png', data, transformation: { width: wPx, height: hPx } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 200, line: 276 }, children: runs(`Рисунок ${figureNo} — ${caption}`) }),
  ];
}

const code = (lines) =>
  lines.map((l) => new Paragraph({ spacing: { line: 240 }, indent: { left: mm(5) }, children: [new TextRun({ text: l, font: 'Consolas', size: 20 })] }));

/** Блок из content.mjs → элементы Word. */
function renderBlock(b) {
  switch (b.type) {
    case 'h1': return h1(b.text);
    case 'h2': return h2(b.text);
    case 'p': return p(b.text);
    case 'ul': return bullets(b.items);
    case 'ol': return numbered(b.items);
    case 'table': return table(b.caption, b.header, b.rows, b.widths, b.size === 'tiny' ? TINY : SMALL);
    case 'figure': return figure(b.file, b.caption);
    case 'code': return code(b.lines);
    default: throw new Error(`неизвестный блок ${b.type}`);
  }
}

const center = (text, size = BODY, extra = {}, spacing = {}) =>
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 360, ...spacing }, children: runs(text, size, extra) });

// ───────────────────────────── Титульный лист ─────────────────────────────
const title = [
  center('Учебный проект по МДК 01.03 «Разработка мобильных приложений»', BODY, {}, { before: 0 }),
  new Paragraph({ spacing: { before: mm(60) }, children: [] }),
  center('ОТЧЁТ', 32, { bold: true }),
  center('о тестировании и контроле качества', 32, { bold: true }),
  new Paragraph({ spacing: { before: 240 }, children: [] }),
  center('Этап 5 проекта «НСРЗ. Заказ запчастей»'),
  center('мобильное приложение и сайт для заказа судовых запчастей'),
  center('со склада АО «Новороссийский судоремонтный завод»'),
  new Paragraph({ spacing: { before: mm(45) }, children: [] }),
  new Paragraph({ indent: { left: mm(95) }, spacing: { line: 360 }, children: runs('Выполнил:') }),
  new Paragraph({ indent: { left: mm(95) }, spacing: { line: 360 }, children: runs('студент группы ИП41-23') }),
  new Paragraph({ indent: { left: mm(95) }, spacing: { line: 360 }, children: runs('Черный Павел Сергеевич') }),
  new Paragraph({ spacing: { before: mm(50) }, children: [] }),
  center('Новороссийск, 2026'),
  new Paragraph({ children: [new PageBreak()] }),
];

// ───────────────────────────── Содержание ─────────────────────────────
const toc = [
  center('СОДЕРЖАНИЕ', BODY, { bold: true }, { after: 200 }),
  new TableOfContents('Содержание', { hyperlink: true, headingStyleRange: '1-2' }),
];

// ───────────────────────────── Текст ─────────────────────────────
const body = blocks.flatMap(renderBlock);

// ───────────────────────────── Документ ─────────────────────────────
const heading = (id, name, size, before) => ({
  id,
  name,
  basedOn: 'Normal',
  next: 'Normal',
  quickFormat: true,
  run: { font: FONT, size, bold: true, color: '000000' },
  paragraph: { spacing: { before, after: 240, line: 360 }, keepNext: true, keepLines: true },
});

const doc = new Document({
  creator: 'Черный Павел Сергеевич',
  title: 'Отчёт о тестировании и контроле качества — этап 5 проекта «НСРЗ. Заказ запчастей»',
  description: 'МДК 01.03, группа ИП41-23',
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: BODY }, paragraph: { spacing: { line: 360 } } } },
    paragraphStyles: [heading('Heading1', 'Heading 1', 28, 0), heading('Heading2', 'Heading 2', 28, 240)],
  },
  numbering: {
    config: [
      {
        reference: 'dash',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: mm(17.5), hanging: mm(5) } } } }],
      },
      {
        reference: 'numbers',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1)', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: mm(18.5), hanging: mm(6) } } } }],
      },
    ],
  },
  sections: [
    {
      properties: {
        titlePage: true,
        page: { size: { width: mm(210), height: mm(297) }, margin: { top: mm(20), bottom: mm(20), left: mm(30), right: mm(15) } },
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 24 })] })] }),
        first: new Footer({ children: [new Paragraph({ children: [] })] }),
      },
      children: [...title, ...toc, ...body],
    },
  ],
});

/**
 * Оглавление-поле Word заполняет сам при открытии. Чтобы оно не было пустым там, где поля не обновляются
 * (Word Online, Google Docs, WPS), внутрь поля вписываются готовые строки с номерами страниц,
 * посчитанными по рендеру (report/preview.mjs → out/toc-pages.json). Word при открытии пересчитает их точно.
 */
async function withCachedToc(buffer) {
  const pagesFile = join(here, 'out', 'toc-pages.json');
  if (!existsSync(pagesFile)) return buffer;
  const pages = JSON.parse(readFileSync(pagesFile, 'utf8'));
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rPr = `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:sz w:val="${BODY}"/></w:rPr>`;
  const tabPos = Math.round((CONTENT_MM / 25.4) * 1440);
  const entries = HEADINGS.map(
    (h) =>
      `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${tabPos}"/></w:tabs><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:ind w:left="${h.level === 2 ? 397 : 0}"/></w:pPr>` +
      `<w:r>${rPr}<w:t xml:space="preserve">${esc(h.text)}</w:t></w:r><w:r>${rPr}<w:tab/></w:r><w:r>${rPr}<w:t>${pages[h.text] ?? ''}</w:t></w:r></w:p>`,
  ).join('');
  const marker = '<w:fldChar w:fldCharType="separate"/></w:r></w:p>';
  if (!xml.includes(marker)) return buffer;
  zip.file('word/document.xml', xml.replace(marker, marker + entries));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(join(here, 'out'), { recursive: true });
writeFileSync(join(here, 'out', 'headings.json'), JSON.stringify(HEADINGS, null, 1));
writeFileSync(OUT, await withCachedToc(await Packer.toBuffer(doc)));
console.log('Отчёт:', OUT, `(${tableNo} таблиц, ${figureNo} рисунков)`);
