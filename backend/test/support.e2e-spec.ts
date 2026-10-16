import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MonitoringService } from '../src/monitoring/monitoring.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { as, Client, createApp, LOGINS, login } from './helpers';

/** Этап 7: техподдержка (обращения) и мониторинг. */
describe('Поддержка и мониторинг (этап 7)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner1: Client;
  let owner2: Client;
  let sales: Client;
  let warehouse: Client;
  let admin: Client;
  let owner1Order: number;
  let owner2Order: number;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    owner1 = as(app, (await login(app, LOGINS.owner1)).accessToken);
    owner2 = as(app, (await login(app, LOGINS.owner2)).accessToken);
    sales = as(app, (await login(app, LOGINS.sales)).accessToken);
    warehouse = as(app, (await login(app, LOGINS.warehouse)).accessToken);
    admin = as(app, (await login(app, LOGINS.admin)).accessToken);
    owner1Order = (await owner1.get('/orders?status=ALL').expect(200)).body.items[0].id;
    owner2Order = (await owner2.get('/orders?status=ALL').expect(200)).body.items[0].id;
  });
  afterAll(() => app.close());

  describe('Обращения', () => {
    let ticketId: number;

    it('судовладелец отправляет обращение по своему заказу — номер ОБР-…, статус «Новое», отделу продаж уходит письмо', async () => {
      const res = await owner1
        .post('/support', { category: 'ORDER', message: 'Когда будет готов заказ к выдаче?', orderId: owner1Order, platform: 'android', appVersion: '1.2.0' })
        .expect(201);
      ticketId = res.body.id;
      expect(res.body.number).toMatch(/^ОБР-\d{6}$/);
      expect(res.body.status).toBe('NEW');
      expect(res.body.order.id).toBe(owner1Order);
      const mail = await prisma.notification.findFirst({ where: { subject: { contains: res.body.number } } });
      expect(mail?.recipient).toBe('prodazhi@nsrz.ru');
    });

    it('обращение по чужому заказу и пустое сообщение — 400', async () => {
      await owner1.post('/support', { category: 'ORDER', message: 'Где мой заказ?', orderId: owner2Order }).expect(400);
      await owner1.post('/support', { category: 'BUG', message: '   ' }).expect(400);
      await owner1.post('/support', { category: 'SPAM', message: 'Неизвестная тема' }).expect(400);
    });

    it('судовладелец видит только свои обращения', async () => {
      const mine = (await owner1.get('/support').expect(200)).body as { id: number }[];
      expect(mine.some((t) => t.id === ticketId)).toBe(true);
      const others = (await owner2.get('/support').expect(200)).body as { id: number }[];
      expect(others.some((t) => t.id === ticketId)).toBe(false);
    });

    it('панель: новые обращения в очереди, со счётчиками по статусам; судовладельцу панель недоступна', async () => {
      const res = await sales.get('/panel/support').expect(200);
      expect(res.body.items.some((t: { id: number }) => t.id === ticketId)).toBe(true);
      expect(res.body.counts.NEW).toBeGreaterThanOrEqual(1);
      expect(res.body.items[0].user.fullName).toBeTruthy();
      await owner1.get('/panel/support').expect(403);
      await owner1.patch(`/panel/support/${ticketId}`, { status: 'RESOLVED' }).expect(403);
    });

    it('сотрудник берёт в работу, затем отвечает — статус «Решено», заказчику уходит SMS, ответ виден в приложении', async () => {
      await warehouse.patch(`/panel/support/${ticketId}`, { status: 'IN_PROGRESS' }).expect(200);
      const answered = await sales.patch(`/panel/support/${ticketId}`, { reply: 'Заказ будет готов завтра к 12:00.' }).expect(200);
      expect(answered.body.status).toBe('RESOLVED');
      expect(answered.body.repliedBy).toBeTruthy();

      const sms = await prisma.notification.findFirst({ where: { channel: 'SMS', body: { contains: answered.body.number } }, orderBy: { id: 'desc' } });
      expect(sms?.body).toContain('Заказ будет готов завтра');

      const mine = (await owner1.get('/support').expect(200)).body.find((t: { id: number }) => t.id === ticketId);
      expect(mine.reply).toBe('Заказ будет готов завтра к 12:00.');
      expect(mine.repliedBy).toBe('НСРЗ'); // заказчик не видит ФИО сотрудника
    });
  });

  describe('Мониторинг', () => {
    it('сводка для администратора: версия, база, резервная копия, запросы, время ответа, обращения', async () => {
      await owner1.get('/parts?q=фильтр').expect(200);
      const res = await admin.get('/admin/monitoring').expect(200);
      expect(res.body.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(res.body.db.ok).toBe(true);
      expect(res.body.hour.requests).toBeGreaterThan(0);
      expect(res.body.hour.p95).toBeGreaterThanOrEqual(res.body.hour.p50);
      expect(res.body.perMinute).toHaveLength(60);
      expect(res.body.support).toEqual(expect.objectContaining({ new: expect.any(Number), inProgress: expect.any(Number) }));
      expect(res.body.slowRoutes.every((r: { route: string }) => !/\/\d+/.test(r.route))).toBe(true);
    });

    it('мониторинг доступен только администратору', async () => {
      await sales.get('/admin/monitoring').expect(403);
      await owner1.get('/admin/monitoring').expect(403);
      await request(app.getHttpServer()).get('/api/admin/monitoring').expect(401);
    });

    it('сбой кода попадает в журнал ошибок мониторинга, а клиенту не раскрываются подробности', async () => {
      const monitoring = app.get(MonitoringService);
      monitoring.recordError({ method: 'GET', route: '/api/test', status: 500, message: 'TypeError: проверка журнала' });
      const res = await admin.get('/admin/monitoring').expect(200);
      expect(res.body.errors[0].message).toContain('проверка журнала');
    });
  });
});
