import { Controller, Get, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Служебное')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  /** Проверка доступности (мониторинг, ТЗ п. 4.4) и настройки для клиентов. */
  @Public()
  @Get('health')
  async health() {
    let db = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      app: 'НСРЗ. Заказ запчастей',
      version: process.env.npm_package_version ?? '1.0.0',
      demoCodes: this.config.get('AUTH_DEV_CODES') === 'true',
      time: new Date().toISOString(),
    };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
