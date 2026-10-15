import { execSync } from 'child_process';
import { join } from 'path';
import './env';

/**
 * Перед прогоном: применить миграции к отдельной тестовой БД nsrz_test.
 * Каждый набор тестов сам перезаливает демо-данные (seed) — рабочая БД nsrz не затрагивается.
 */
export default async function globalSetup() {
  if (!process.env.DATABASE_URL_TEST?.includes('/nsrz_test')) {
    throw new Error('Тесты запускаются только на базе nsrz_test');
  }
  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST },
    stdio: 'pipe',
  });
}
