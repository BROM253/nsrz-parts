// Сборка документов этапа 7 в PDF: план-проект, отчёт, регламент поддержки и обучающие материалы версии 1.2.1.
//   cd qa && node docs/build-all7.mjs [папка]   (по умолчанию — «НСРЗ - Заказ запчастей\8_этап7_поддержка»)
// Материалы этапа 6 (версия 1.1.0) в папке 7_этап6_релиз не трогаются.
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { buildPdf } from '../report/build-pdf.mjs';
import { VERSION } from './common.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] ?? 'D:/Claude/НСРЗ - Заказ запчастей/8_этап7_поддержка';
const TRAINING = join(ROOT, `Обучение пользователей (версия ${VERSION})`);
mkdirSync(TRAINING, { recursive: true });

const docs = [
  ['plan-project', ROOT],
  ['report7', ROOT],
  ['regulations', ROOT],
  ...['manual-owner', 'manual-staff', 'manual-admin', 'quickstart', 'training'].map((m) => [m, TRAINING]),
];
for (const [mod, dir] of docs) {
  const { META, body } = await import(pathToFileURL(join(here, `${mod}.mjs`)).href);
  const info = await buildPdf(META, body, join(dir, `${META.fileName}.pdf`));
  console.log(`${META.fileName}: ${info.total} стр.`);
}
