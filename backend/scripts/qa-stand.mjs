// QA-стенд: копия сервера для нагрузочных тестов, проверок безопасности и UI-автотестов.
// Своя сборка (dist-qa), своя база nsrz_qa и порт 3100 — рабочий сервер (порт 3000) и демо-данные не затрагиваются.
//
//   node scripts/qa-stand.mjs          — собрать, применить миграции, залить демо-данные и запустить
//   node scripts/qa-stand.mjs --seed   — только перезалить демо-данные в nsrz_qa (стенд может работать)
//
// PostgreSQL должен быть запущен (start-server.cmd или npm run db:start).
import { execSync, spawn } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const here = dirname(fileURLToPath(import.meta.url));
const backend = join(here, '..');
const env = Object.fromEntries(
  readFileSync(join(backend, '.env'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const mainUrl = new URL(env.DATABASE_URL);
const qaUrl = new URL(env.DATABASE_URL);
qaUrl.pathname = '/nsrz_qa';
const PORT = Number(process.env.QA_PORT ?? 3100);

const qaEnv = {
  ...process.env,
  ...env,
  DATABASE_URL: qaUrl.toString(),
  PORT: String(PORT),
  NODE_ENV: 'qa', // ограничение частоты запросов включено, как на рабочем сервере
  AUTH_DEV_CODES: 'true',
  SMS_PROVIDER: 'log',
  MAIL_TRANSPORT: 'log',
};
const run = (cmd) => execSync(cmd, { cwd: backend, env: qaEnv, stdio: 'inherit' });

// база nsrz_qa создаётся один раз
const admin = new PrismaClient({ datasourceUrl: mainUrl.toString() });
try {
  await admin.$executeRawUnsafe('CREATE DATABASE nsrz_qa');
  console.log('Создана база nsrz_qa');
} catch (e) {
  if (!String(e).includes('already exists')) throw e;
} finally {
  await admin.$disconnect();
}

const seedOnly = process.argv.includes('--seed');
if (!seedOnly) {
  console.log('Сборка сервера в dist-qa…');
  run('npx tsc -p tsconfig.build.json --outDir dist-qa');
  run('npx prisma migrate deploy');
}
run('npx ts-node --transpile-only prisma/seed.ts');
if (seedOnly) process.exit(0);

console.log(`QA-стенд: http://localhost:${PORT}  (база nsrz_qa)`);
const server = spawn(process.execPath, [join(backend, 'dist-qa', 'main.js')], { cwd: backend, env: qaEnv, stdio: 'inherit' });
const stop = () => server.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => process.exit(code ?? 0));
