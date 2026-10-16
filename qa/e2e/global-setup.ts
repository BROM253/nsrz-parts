import { execSync } from 'child_process';
import { join } from 'path';

/** Перед прогоном: стенд должен отвечать, демо-данные в nsrz_qa — свежие. */
export default async function globalSetup() {
  const base = process.env.QA_URL ?? 'http://localhost:3100';
  const health = await fetch(`${base}/api/health`).catch(() => null);
  if (!health?.ok) throw new Error(`QA-стенд не отвечает на ${base}. Запустите: npm run stand`);
  if (!process.env.QA_URL) {
    execSync('node ../backend/scripts/qa-stand.mjs --seed', { cwd: join(__dirname, '..'), stdio: 'inherit' });
  }
}
