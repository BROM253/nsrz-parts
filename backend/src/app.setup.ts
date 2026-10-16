import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { MonitoringService } from './monitoring/monitoring.service';
import { APP_VERSION } from './common/version';
import { serveClients } from './static';

/** Общая настройка приложения — для запуска и для автотестов. */
export function configureApp(app: NestExpressApplication) {
  // За туннелем реальный адрес клиента приходит в X-Forwarded-For — он нужен для ограничения частоты запросов.
  // Доверяем заголовку только от туннеля на этом же ПК (127.0.0.1 / ::1): телефон в домашней сети
  // или клиент через запасной туннель не может подменить свой IP и обойти ограничение.
  app.set('trust proxy', 'loopback');
  app.setGlobalPrefix('api');

  // мониторинг (этап 7): время и код каждого ответа API; путь — по шаблону маршрута, без номеров
  const monitoring = app.get(MonitoringService);
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/api/')) return next();
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const route = (req.route?.path as string | undefined) ?? req.path.replace(/\/\d+(?=\/|$)/g, '/:id');
      monitoring.record(`${req.method} ${route}`, res.statusCode, ms);
    });
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: false, // Flutter-веб и Swagger используют inline-скрипты и WebAssembly
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression()); // канал до 128 кбит/с (ТЗ п. 4.5): JSON сжимается в 5–10 раз
  app.enableCors({ origin: true, exposedHeaders: ['Content-Disposition'] });
  serveClients(app); // сайт, веб-версия приложения и APK — с того же адреса, что и API
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter(app.get(HttpAdapterHost).httpAdapter, monitoring));

  const config = new DocumentBuilder()
    .setTitle('НСРЗ. Заказ запчастей — API')
    .setDescription(
      'REST API мобильного приложения, сайта и панели НСРЗ. ' +
        'Вход: POST /api/auth/request-code → POST /api/auth/verify → кнопка Authorize (Bearer).',
    )
    .setVersion(APP_VERSION)
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, config), {
    customSiteTitle: 'НСРЗ API',
  });
}
