// Портативный PostgreSQL 16 для запуска сервера на домашнем ПК — без установки и прав администратора.
// Данные лежат в nsrz-app/data/postgres. Запуск: npm run db:start (окно держать открытым).
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(here, '..', '.env'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const url = new URL(env.DATABASE_URL);
const dataDir = join(here, '..', '..', 'data', 'postgres');
const fresh = !existsSync(join(dataDir, 'PG_VERSION'));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || 5432),
  persistent: true,
  // ICU-локаль ru-RU: правильная сортировка и регистр для кириллицы
  initdbFlags: ['--encoding=UTF8', '--locale-provider=icu', '--icu-locale=ru-RU', '--locale=C'],
  onLog: () => {},
  onError: (e) => console.error(String(e)),
});

if (fresh) {
  console.log('Первый запуск: создаю кластер PostgreSQL в', dataDir);
  await pg.initialise();
}
await pg.start();
for (const db of ['nsrz', 'nsrz_test']) {
  await pg.createDatabase(db).catch(() => {}); // уже существует — не страшно
}
console.log(`PostgreSQL 16 работает на порту ${url.port || 5432}. Не закрывайте это окно.`);

const stop = async () => {
  console.log('Останавливаю PostgreSQL…');
  await pg.stop().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
