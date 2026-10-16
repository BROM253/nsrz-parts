// Страницы PDF → PNG для проверки вёрстки (pdf.js в Edge). node report/pdf-pages.mjs <файл.pdf> [страницы через запятую]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const [file, list] = process.argv.slice(2);
const out = join(here, 'out', 'pdf');
mkdirSync(out, { recursive: true });
const lib = pathToFileURL(join(here, '..', 'node_modules', 'pdfjs-dist', 'build')).href;
const viewer = join(out, 'viewer.html');
writeFileSync(
  viewer,
  `<!doctype html><body style="margin:0;background:#888"><script type="module">
import * as pdfjs from '${lib}/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = '${lib}/pdf.worker.min.mjs';
window.renderPdf = async (b64, wanted) => {
  const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = wanted.length ? wanted : Array.from({ length: doc.numPages }, (_, i) => i + 1);
  for (const n of pages) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1.3 });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height; c.id = 'p' + n;
    c.style.display = 'block'; c.style.margin = '8px';
    document.body.appendChild(c);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  }
  return pages;
};
window.ready = true;
</script></body>`,
);
const browser = await chromium.launch({ channel: 'msedge', args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
await page.goto(pathToFileURL(viewer).href);
await page.waitForFunction(() => window.ready === true);
const wanted = list ? list.split(',').map(Number) : [];
const pages = await page.evaluate(([b64, w]) => window.renderPdf(b64, w), [readFileSync(file).toString('base64'), wanted]);
for (const n of pages) await page.locator(`#p${n}`).screenshot({ path: join(out, `page-${String(n).padStart(2, '0')}.png`) });
await browser.close();
console.log('страницы:', pages.join(', '), '→', out);
