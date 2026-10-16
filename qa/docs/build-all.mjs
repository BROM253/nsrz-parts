// Сборка всех документов этапа 6 в PDF: 5 обучающих материалов + отчёт (число страниц материалов — в таблицу отчёта).
//   cd qa && node docs/build-all.mjs [папка]   (по умолчанию — «НСРЗ - Заказ запчастей\7_этап6_релиз»)
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { buildPdf } from '../report/build-pdf.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] ?? 'D:/Claude/НСРЗ - Заказ запчастей/7_этап6_релиз';
const TRAINING = join(ROOT, 'Обучение пользователей');
mkdirSync(TRAINING, { recursive: true });

const pages = {};
for (const mod of ['manual-owner', 'manual-staff', 'manual-admin', 'quickstart', 'training']) {
  const { META, body } = await import(pathToFileURL(join(here, `${mod}.mjs`)).href);
  const out = join(TRAINING, `${META.fileName}.pdf`);
  const info = await buildPdf(META, body, out);
  pages[mod] = info.total;
  console.log(`${META.fileName}: ${info.total} стр.`);
}
writeFileSync(join(here, 'out', 'pages.json'), JSON.stringify(pages, null, 1));

const { META, body } = await import(pathToFileURL(join(here, 'report6.mjs')).href + `?t=${Date.now()}`);
const info = await buildPdf(META, body, join(ROOT, `${META.fileName}.pdf`));
console.log(`${META.fileName}: ${info.total} стр.`);
