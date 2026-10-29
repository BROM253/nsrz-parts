// Автотесты работают с отдельной БД nsrz_test — рабочие данные не трогаются.
import { config } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

config({ path: join(__dirname, '..', '.env'), quiet: true } as any);
if (!process.env.DATABASE_URL_TEST) throw new Error('В .env не задан DATABASE_URL_TEST');
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.NODE_ENV = 'test';
process.env.AUTH_DEV_CODES = 'true';
process.env.SMS_PROVIDER = 'log';
process.env.MAIL_TRANSPORT = 'log';

// Сайт не собран (например, в CI сервер тестируется отдельно) — подставляем страницу-заглушку,
// чтобы проверки раздачи сайта (CSP, выход за пределы папок) не зависели от сборки web/.
if (!process.env.WEB_DIST && !existsSync(join(__dirname, '..', '..', 'web', 'dist', 'index.html'))) {
  const stub = join(tmpdir(), 'nsrz-test-web');
  mkdirSync(stub, { recursive: true });
  writeFileSync(join(stub, 'index.html'), '<!doctype html><title>НСРЗ</title><div id="root"></div>');
  process.env.WEB_DIST = stub;
}
