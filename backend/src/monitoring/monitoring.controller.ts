import { Controller, Get, Global, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, SupportStatus } from '@prisma/client';
import { BackupModule, BackupService } from '../backup/backup.service';
import { Roles } from '../common/auth.decorators';
import { APP_VERSION } from '../common/version';
import { PrismaService } from '../prisma/prisma.service';
import { MonitoringService } from './monitoring.service';

@ApiTags('Администрирование: мониторинг')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/monitoring')
export class MonitoringController {
  constructor(
    private readonly monitoring: MonitoringService,
    private readonly prisma: PrismaService,
    private readonly backup: BackupService,
  ) {}

  /** Сводка для страницы «Мониторинг» панели НСРЗ. */
  @Get()
  async overview() {
    const started = Date.now();
    let db = { ok: true, ms: 0 };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = { ok: true, ms: Date.now() - started };
    } catch {
      db = { ok: false, ms: Date.now() - started };
    }
    const lastBackup = this.backup.lastBackupAt();
    const [newTickets, inProgress] = await Promise.all([
      this.prisma.supportTicket.count({ where: { status: SupportStatus.NEW } }),
      this.prisma.supportTicket.count({ where: { status: SupportStatus.IN_PROGRESS } }),
    ]);
    const snap = this.monitoring.snapshot();
    const backupAgeHours = lastBackup ? Math.round(((Date.now() - lastBackup.getTime()) / 3600_000) * 10) / 10 : null;
    const problems = [
      ...(!db.ok ? ['база данных не отвечает'] : []),
      ...(backupAgeHours === null || backupAgeHours > 25 ? ['резервной копии нет или она старше суток'] : []),
      ...(snap.hour.errors5xx > 0 ? [`ошибок сервера за час: ${snap.hour.errors5xx}`] : []),
      ...(snap.availability.lastCheck?.public && !snap.availability.lastCheck.public.ok ? ['адрес в интернете не отвечает'] : []),
    ];
    return {
      version: APP_VERSION,
      status: problems.length ? 'degraded' : 'ok',
      problems,
      db,
      backup: { last: lastBackup?.toISOString() ?? null, ageHours: backupAgeHours },
      support: { new: newTickets, inProgress },
      ...snap,
    };
  }
}

@Global()
@Module({
  imports: [BackupModule],
  controllers: [MonitoringController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
