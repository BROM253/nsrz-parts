import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule, ServeStaticModuleOptions } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { existsSync } from 'fs';
import { join } from 'path';
import { AdminModule } from './admin/admin.controller';
import { AuthModule } from './auth/auth.controller';
import { CartModule } from './cart/cart.controller';
import { CatalogModule } from './catalog/catalog.controller';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { HealthModule } from './health/health.controller';
import { NotificationsModule } from './notifications/notifications.service';
import { OrdersModule } from './orders/orders.controller';
import { PrismaModule } from './prisma/prisma.service';
import { StatsModule } from './stats/stats.controller';
import { StockModule } from './stock/stock.controller';

/**
 * Сервер раздаёт не только API, но и клиентов:
 *   /     — сайт для ПК (React): кабинет судовладельца и панель НСРЗ (/panel);
 *   /m/   — веб-сборка мобильного приложения (Flutter) — её ставят на iPhone через «На экран Домой».
 * Так для доступа из интернета хватает одного адреса и одного туннеля.
 */
function staticRoots(): ServeStaticModuleOptions[] {
  const root = join(__dirname, '..', '..');
  const mobileWeb = process.env.MOBILE_WEB_DIST ?? join(root, 'mobile', 'build', 'web');
  const webDist = process.env.WEB_DIST ?? join(root, 'web', 'dist');
  const release = process.env.RELEASE_DIR ?? join(root, 'release');
  const roots: ServeStaticModuleOptions[] = [];
  // готовые сборки (APK) — скачиваются с телефона по ссылке со страницы /app
  if (existsSync(release)) {
    roots.push({ rootPath: release, serveRoot: '/download', exclude: ['/api/{*path}'], serveStaticOptions: { index: false } });
  }
  if (existsSync(mobileWeb)) {
    roots.push({ rootPath: mobileWeb, serveRoot: '/m', exclude: ['/api/{*path}'] });
  }
  if (existsSync(webDist)) {
    roots.push({ rootPath: webDist, exclude: ['/api/{*path}', '/m/{*path}', '/download/{*path}'] });
  }
  return roots;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    ServeStaticModule.forRoot(...staticRoots()),
    PrismaModule,
    NotificationsModule,
    AuthModule,
    CatalogModule,
    CartModule,
    OrdersModule,
    StockModule,
    StatsModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
