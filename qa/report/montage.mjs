// Миниатюры всех страниц PDF на одном листе: node report/montage.mjs <файл.pdf> <out.png>
import { execFileSync } from 'child_process';
import { chromium } from '@playwright/test';
import { readdirSync, readFileSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const here = dirname(fileURLToPath(import.meta.url));
const [pdf, out] = process.argv.slice(2);
const dir = join(here, 'out', 'pdf');
for (const f of readdirSync(dir).filter((f) => f.startsWith('page-'))) rmSync(join(dir, f));
execFileSync(process.execPath, [join(here, 'pdf-pages.mjs'), pdf], { stdio: 'ignore' });
const files = readdirSync(dir).filter((f) => /^page-\d+\.png$/.test(f)).sort();
const imgs = files.map((f) => `<div style="display:inline-block;margin:5px;text-align:center;font:13px sans-serif"><img style="width:240px;border:1px solid #999;background:#fff" src="data:image/png;base64,${readFileSync(join(dir, f)).toString('base64')}"><br>${f.slice(5, 7)}</div>`).join('');
const b = await chromium.launch({ channel: 'msedge' });
const p = await b.newPage({ viewport: { width: 1560, height: 900 } });
await p.setContent(`<body style="margin:0;background:#ccc">${imgs}</body>`);
await p.screenshot({ path: out, fullPage: true });
await b.close();
console.log(files.length, 'стр. →', out);
