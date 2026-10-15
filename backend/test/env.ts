// Автотесты работают с отдельной БД nsrz_test — рабочие данные не трогаются.
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(__dirname, '..', '.env'), quiet: true } as any);
if (!process.env.DATABASE_URL_TEST) throw new Error('В .env не задан DATABASE_URL_TEST');
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.NODE_ENV = 'test';
process.env.AUTH_DEV_CODES = 'true';
process.env.SMS_PROVIDER = 'log';
process.env.MAIL_TRANSPORT = 'log';
