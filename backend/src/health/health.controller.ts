import { Controller, Get, Module } from '@nestjs/common';
import { readFileSync } from 'fs';
import { networkInterfaces } from 'os';
import { join } from 'path';
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

/**
 * Адреса, по которым телефон может открыть сервер (для QR-кода на странице входа).
 * Если сайт открыт на самом ПК как localhost, телефону этот адрес не подходит:
 * отдаём публичный адрес туннеля (его пишет scripts/start-server.ps1) и адрес ПК в домашней сети.
 */
@ApiTags('Служебное')
@Controller()
export class AddressController {
  @Public()
  @Get('public-address')
  address() {
    let publicUrl: string | null = null;
    try {
      const file = join(__dirname, '..', '..', '..', 'data', 'public-url.txt');
      const text = readFileSync(file, 'utf8').replace(/^﻿/, '').trim();
      if (/^https:\/\/[a-z0-9.-]+$/i.test(text)) publicUrl = text;
    } catch {
      /* туннель не запускался */
    }
    const port = Number(process.env.PORT ?? 3000);
    const lanUrls = Object.entries(networkInterfaces())
      .filter(([name]) => !/tun|tap|vpn|happ|wireguard|vethernet|loopback/i.test(name))
      .flatMap(([, list]) => list ?? [])
      .filter((a) => a.family === 'IPv4' && !a.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address))
      .map((a) => `http://${a.address}:${port}`);
    return { publicUrl, lanUrls };
  }
}

@Module({ controllers: [HealthController, AddressController] })
export class HealthModule {}
