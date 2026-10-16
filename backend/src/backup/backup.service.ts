import { Injectable, Logger, Module, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { databaseName, dumpDatabase, listBackups, writeBackup } from './backup';

const DAY_MS = 24 * 3600 * 1000;
const CHECK_EVERY_MS = 3600 * 1000;

/**
 * Ежедневная автоматическая резервная копия, пока сервер работает (ТЗ п. 4.4).
 * Копия делается при запуске, если последней больше суток, и дальше — раз в сутки (проверка каждый час).
 * Файлы: nsrz-app/data/backups/<база>-<дата>.json.gz, хранятся 14 последних.
 */
@Injectable()
export class BackupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Резервное копирование');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  private get enabled() {
    return process.env.NODE_ENV !== 'test' && process.env.BACKUP_DISABLED !== 'true';
  }

  onApplicationBootstrap() {
    if (!this.enabled) return;
    void this.backupIfDue();
    this.timer = setInterval(() => void this.backupIfDue(), CHECK_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  lastBackupAt(): Date | null {
    return listBackups(databaseName())[0]?.at ?? null;
  }

  async backupIfDue() {
    const last = this.lastBackupAt();
    if (last && Date.now() - last.getTime() < DAY_MS - 5 * 60 * 1000) return;
    await this.backupNow();
  }

  async backupNow(): Promise<string | null> {
    if (this.running) return null;
    this.running = true;
    try {
      const started = Date.now();
      const file = writeBackup(await dumpDatabase(this.prisma, databaseName()));
      this.log.log(`Копия сохранена: ${file} (${Date.now() - started} мс)`);
      return file;
    } catch (e) {
      this.log.error(`Копию сделать не удалось: ${(e as Error).message}`);
      return null;
    } finally {
      this.running = false;
    }
  }
}

@Module({ providers: [BackupService], exports: [BackupService] })
export class BackupModule {}
