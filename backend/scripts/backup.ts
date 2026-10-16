// Резервная копия и восстановление БД вручную (ТЗ п. 4.4). Автоматическую ежедневную копию делает сам сервер.
//
//   npm run db:backup                         — копия рабочей базы nsrz → data/backups
//   npm run db:restore -- <файл>              — восстановить копию в QA-базу nsrz_qa (проверка копии)
//   npm run db:restore -- <файл> --db nsrz --yes — восстановить в РАБОЧУЮ базу (данные будут заменены!)
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { basename, join } from 'path';
import { databaseName, dumpDatabase, readBackup, restoreDatabase, writeBackup } from '../src/backup/backup';

config({ path: join(__dirname, '..', '.env'), quiet: true } as any);

function urlFor(db: string) {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${db}`;
  return url.toString();
}

async function main() {
  const [command, file, ...rest] = process.argv.slice(2);
  if (command === 'backup') {
    const db = databaseName();
    const prisma = new PrismaClient();
    const started = Date.now();
    const out = writeBackup(await dumpDatabase(prisma, db));
    await prisma.$disconnect();
    console.log(`Копия базы ${db}: ${out} (${Date.now() - started} мс)`);
    return;
  }
  if (command === 'restore') {
    if (!file) throw new Error('Укажите файл копии: npm run db:restore -- data/backups/nsrz-….json.gz');
    const dbFlag = rest.indexOf('--db');
    const target = dbFlag >= 0 ? rest[dbFlag + 1] : 'nsrz_qa';
    if (target === databaseName() && !rest.includes('--yes')) {
      throw new Error(`Восстановление в рабочую базу ${target} заменит все данные. Если это нужно — добавьте --yes`);
    }
    const dump = readBackup(file);
    const prisma = new PrismaClient({ datasourceUrl: urlFor(target) });
    const started = Date.now();
    const counts = await restoreDatabase(prisma, dump);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    // проверка: в базе столько же строк, сколько в копии
    const mismatches: string[] = [];
    for (const [table, expected] of Object.entries(counts)) {
      const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM "${table}"`);
      if (Number(row.n) !== expected) mismatches.push(`${table}: ${row.n} вместо ${expected}`);
    }
    await prisma.$disconnect();
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    console.log(`Копия ${basename(file)} (снята ${dump.createdAt}) восстановлена в ${target}: ${total} строк в ${Object.keys(counts).length} таблицах за ${seconds} с`);
    if (mismatches.length) throw new Error('Расхождения после восстановления: ' + mismatches.join('; '));
    console.log('Проверка: число строк в каждой таблице совпадает с копией');
    return;
  }
  throw new Error('Команда: backup | restore <файл> [--db <база>] [--yes]');
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
