// Просмотр .docx без Word: рендер docx-preview в Edge → PNG по разделам + оценка числа страниц.
// node report/preview.mjs <файл.docx>
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2];
const out = join(here, 'out', 'preview');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
await page.setContent('<html><body style="background:#ddd;margin:0"><div id="c"></div></body></html>');
await page.addScriptTag({ path: join(here, '..', 'node_modules', 'jszip', 'dist', 'jszip.min.js') });
await page.addScriptTag({ path: join(here, '..', 'node_modules', 'docx-preview', 'dist', 'docx-preview.min.js') });
const b64 = readFileSync(file).toString('base64');
const info = await page.evaluate(async (data) => {
  const bin = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  await window.docx.renderAsync(new Blob([bin]), document.getElementById('c'), null, { breakPages: true, ignoreLastRenderedPageBreak: true, renderHeaders: true, renderFooters: true });
  return [...document.querySelectorAll('section.docx')].map((s) => ({
    height: s.getBoundingClientRect().height,
    width: s.getBoundingClientRect().width,
    title: (s.querySelector('h1, p')?.textContent ?? '').slice(0, 60),
  }));
}, b64);
// высота страницы A4 при ширине страницы в px
const a4 = (w) => (w * 297) / 210;
let pageNo = 1;
info.forEach((s, i) => {
  const pages = Math.max(1, Math.round((s.height / a4(s.width)) * 100) / 100);
  console.log(`раздел ${String(i + 1).padStart(2)} | стр. с ${String(pageNo).padStart(2)} | ~${pages.toFixed(2)} стр. | ${s.title}`);
  pageNo += Math.ceil(pages - 0.02);
});
console.log('Всего страниц (оценка):', pageNo - 1);
writeFileSync(join(out, 'sections.json'), JSON.stringify(info, null, 1));

// номера страниц заголовков для готового оглавления (out/toc-pages.json)
const headings = JSON.parse(readFileSync(join(here, 'out', 'headings.json'), 'utf8')).map((h) => h.text);
const found = await page.evaluate((list) => {
  const res = {};
  const secs = [...document.querySelectorAll('section.docx')];
  secs.forEach((s, si) => {
    const top = s.getBoundingClientRect().top;
    for (const el of s.querySelectorAll('p')) {
      const t = el.textContent.trim();
      if (list.includes(t) && !(t in res)) res[t] = { si, offset: el.getBoundingClientRect().top - top, width: s.getBoundingClientRect().width };
    }
  });
  return res;
}, headings);
const startPage = [];
let acc = 1;
info.forEach((s) => {
  startPage.push(acc);
  acc += Math.max(1, Math.ceil(s.height / a4(s.width) - 0.02));
});
const tocPages = Object.fromEntries(
  Object.entries(found).map(([t, f]) => [t, startPage[f.si] + Math.floor(f.offset / a4(f.width))]),
);
writeFileSync(join(here, 'out', 'toc-pages.json'), JSON.stringify(tocPages, null, 1));
console.log('Оглавление:', Object.entries(tocPages).map(([t, n]) => `${n} ${t}`).join(' | '));
const sections = page.locator('section.docx');
const n = await sections.count();
for (let i = 0; i < n; i++) await sections.nth(i).screenshot({ path: join(out, `section-${String(i + 1).padStart(2, '0')}.png`) });
await browser.close();
