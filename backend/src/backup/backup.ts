import { PrismaClient } from '@prisma/client';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { gunzipSync, gzipSync } from 'zlib';

/**
 * Резервное копирование БД (ТЗ п. 4.4: ежедневно, точка восстановления ≤ 24 ч, время восстановления ≤ 4 ч).
 * В портативном PostgreSQL нет pg_dump, поэтому копия делается средствами самой СУБД:
 * каждая таблица выгружается в JSON (json_agg) и восстанавливается через json_populate_recordset —
 * типы (даты, суммы, перечисления, jsonb) сохраняются точно.
 */

export interface Dump {
  format: 'nsrz-backup-1';
  database: string;
  createdAt: string;
  tables: Record<string, unknown[]>;
}

type Db = Pick<PrismaClient, '$queryRawUnsafe' | '$executeRawUnsafe' | '$transaction'>;

export const BACKUP_KEEP = 14;

export function backupDir(): string {
  return process.env.BACKUP_DIR ?? join(__dirname, '..', '..', '..', 'data', 'backups');
}

async function tableNames(db: Db): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`,
  );
  return rows.map((r) => r.tablename);
}

/** Снимок всех таблиц в одной транзакции (согласованное состояние на один момент времени). */
export async function dumpDatabase(db: Db, database: string): Promise<Dump> {
  const names = await tableNames(db);
  const tables: Record<string, unknown[]> = {};
  await db.$transaction(
    async (tx) => {
      for (const t of names) {
        const [row] = await tx.$queryRawUnsafe<{ data: unknown[] | null }[]>(`SELECT json_agg(t) AS data FROM "${t}" t`);
        tables[t] = row.data ?? [];
      }
    },
    { isolationLevel: 'RepeatableRead', timeout: 120_000 },
  );
  return { format: 'nsrz-backup-1', database, createdAt: new Date().toISOString(), tables };
}

/** Полная замена данных содержимым копии. Схема (миграции) должна совпадать. */
export async function restoreDatabase(db: Db, dump: Dump): Promise<Record<string, number>> {
  if (dump.format !== 'nsrz-backup-1') throw new Error('Неизвестный формат резервной копии');
  const names = await tableNames(db);
  const counts: Record<string, number> = {};
  await db.$transaction(
    async (tx) => {
      // внешние ключи проверяются после загрузки всех таблиц, порядок вставки не важен
      await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
      await tx.$executeRawUnsafe(`TRUNCATE TABLE ${names.map((n) => `"${n}"`).join(', ')} RESTART IDENTITY CASCADE`);
      for (const t of names) {
        const rows = dump.tables[t] ?? [];
        counts[t] = rows.length;
        if (rows.length === 0) continue;
        await tx.$executeRawUnsafe(`INSERT INTO "${t}" SELECT * FROM json_populate_recordset(NULL::"${t}", $1::json)`, JSON.stringify(rows));
      }
      // счётчики автонумерации — после максимального id (номера заказов НСРЗ-000xxx продолжаются)
      const serials = await tx.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND column_default LIKE 'nextval(%'`,
      );
      for (const s of serials) {
        await tx.$queryRawUnsafe(
          `SELECT setval(pg_get_serial_sequence('"${s.table_name}"', '${s.column_name}'),
                         COALESCE(MAX("${s.column_name}"), 1), MAX("${s.column_name}") IS NOT NULL) FROM "${s.table_name}"`,
        );
      }
    },
    { timeout: 120_000 },
  );
  return counts;
}

export function writeBackup(dump: Dump, dir = backupDir()): string {
  mkdirSync(dir, { recursive: true });
  // время в имени файла — московское, как в интерфейсе: nsrz-2026-10-16_11-12.json.gz
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date(dump.createdAt))
      .map((x) => [x.type, x.value]),
  );
  const stamp = `${p.year}-${p.month}-${p.day}_${p.hour}-${p.minute}`;
  const file = join(dir, `${dump.database}-${stamp}.json.gz`);
  writeFileSync(file, gzipSync(JSON.stringify(dump)));
  // храним последние BACKUP_KEEP копий этой базы
  const own = listBackups(dump.database, dir);
  for (const old of own.slice(BACKUP_KEEP)) unlinkSync(join(dir, old.file));
  return file;
}

export function readBackup(file: string): Dump {
  return JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
}

/** Копии базы — самые новые первыми. */
export function listBackups(database: string, dir = backupDir()): { file: string; at: Date }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(`${database}-`) && f.endsWith('.json.gz'))
    .map((f) => ({ file: f, at: statSync(join(dir, f)).mtime }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

export function databaseName(url = process.env.DATABASE_URL ?? ''): string {
  try {
    return new URL(url).pathname.replace(/^\//, '') || 'nsrz';
  } catch {
    return 'nsrz';
  }
}
