import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 600 }],
      errorMessage: 'Слишком много запросов подряд. Подождите минуту и попробуйте снова.',
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
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
