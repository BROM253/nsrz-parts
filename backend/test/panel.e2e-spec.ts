import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { as, Client, createApp, LOGINS, login, partId, placeOrder, stockOf } from './helpers';

describe('Панель НСРЗ: обработка заказов, остатки, интеграции', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner1: Client;
  let sales: Client;
  let warehouse: Client;
  let vessel1: string;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    const o = await login(app, LOGINS.owner1);
    owner1 = as(app, o.accessToken);
    vessel1 = o.user.vessels[0].id;
    sales = as(app, (await login(app, LOGINS.sales)).accessToken);
    warehouse = as(app, (await login(app, LOGINS.warehouse)).accessToken);
  });
  afterAll(() => app.close());

  describe('Очередь и статусная модель (ТЗ п. 4.3)', () => {
    let orderId: number;

    it('в очереди — заказы «ожидает подтверждения», самые старые первыми', async () => {
      const res = await sales.get('/panel/orders').expect(200);
      expect(res.body.items.length).toBe(2);
      expect(res.body.items.every((o: any) => o.status === 'PENDING')).toBe(true);
      expect(new Date(res.body.items[0].createdAt) <= new Date(res.body.items[1].createdAt)).toBe(true);
      expect(res.body.counts.PENDING).toBe(2);
    });

    it('новый заказ судовладельца сразу появляется в очереди', async () => {
      const id = await partId(prisma, 'НСРЗ-ГД-01427');
      const created = await placeOrder(owner1, [[id, 2]], vessel1);
      orderId = created.body.id;
      const res = await sales.get('/panel/orders').expect(200);
      expect(res.body.items.map((o: any) => o.id)).toContain(orderId);
      const detail = await sales.get(`/panel/orders/${orderId}`).expect(200);
      expect(detail.body.allowedTransitions).toEqual(['CONFIRMED', 'REJECTED']);
      expect(detail.body.items[0].stock).toMatchObject({ quantity: 12, reserved: 2 });
    });

    it('перескочить через шаг нельзя (ожидает подтверждения → готов) — 400', async () => {
      const res = await sales.patch(`/panel/orders/${orderId}/status`, { status: 'READY' }).expect(400);
      expect(res.body.message).toMatch(/Нельзя перевести/);
    });

    it('отклонить без причины нельзя — 400', async () => {
      await sales.patch(`/panel/orders/${orderId}/status`, { status: 'REJECTED' }).expect(400);
    });

    it('подтверждение: статус и время шага видны судовладельцу (синхронизация)', async () => {
      await sales.patch(`/panel/orders/${orderId}/status`, { status: 'CONFIRMED' }).expect(200);
      const res = await owner1.get(`/orders/${orderId}`).expect(200);
      expect(res.body.status).toBe('CONFIRMED');
      expect(res.body.timeline.map((s: any) => s.done)).toEqual([true, true, false, false, false]);
      expect(res.body.timeline[1].at).toBeTruthy();
      expect(res.body.timeline[1].current).toBe(true);
    });

    it('двое сотрудников нажали одновременно — проходит только одно изменение', async () => {
      const [a, b] = await Promise.all([
        sales.patch(`/panel/orders/${orderId}/status`, { status: 'ASSEMBLING' }),
        warehouse.patch(`/panel/orders/${orderId}/status`, { status: 'ASSEMBLING' }),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses[0]).toBe(200);
      // второй получает 409 «изменил другой сотрудник» — и при гонке, и если уже видит новый статус
      expect(statuses[1]).toBe(409);
      const history = await prisma.orderStatusHistory.count({ where: { orderId, status: 'ASSEMBLING' } });
      expect(history).toBe(1);
    });

    it('завершение списывает товар со склада и снимает резерв', async () => {
      await warehouse.patch(`/panel/orders/${orderId}/status`, { status: 'READY' }).expect(200);
      expect(await stockOf(prisma, 'НСРЗ-ГД-01427')).toMatchObject({ quantity: 12, reserved: 2 });
      const res = await warehouse.patch(`/panel/orders/${orderId}/status`, { status: 'COMPLETED' }).expect(200);
      expect(res.body.allowedTransitions).toEqual([]);
      expect(await stockOf(prisma, 'НСРЗ-ГД-01427')).toMatchObject({ quantity: 10, reserved: 0 });
    });

    it('из «завершён» никуда перейти нельзя', async () => {
      await sales.patch(`/panel/orders/${orderId}/status`, { status: 'REJECTED', reason: 'Другое' }).expect(400);
    });

    it('отклонение с причиной: судовладелец видит причину, резерв снят', async () => {
      const pending = await sales.get('/panel/orders').expect(200);
      const target = pending.body.items[0];
      const before = await prisma.order.findUniqueOrThrow({ where: { id: target.id }, include: { items: true } });
      const reservedBefore = await prisma.stock.findUniqueOrThrow({ where: { partId: before.items[0].partId } });

      await sales.patch(`/panel/orders/${target.id}/status`, { status: 'REJECTED', reason: 'Позиция снята с поставки' }).expect(200);
      const after = await prisma.stock.findUniqueOrThrow({ where: { partId: before.items[0].partId } });
      expect(after.reserved).toBe(reservedBefore.reserved - before.items[0].quantity);

      const owner2 = as(app, (await login(app, LOGINS.owner2)).accessToken);
      const view = await owner2.get(`/orders/${target.id}`).expect(200);
      expect(view.body.status).toBe('REJECTED');
      expect(view.body.rejectReason).toBe('Позиция снята с поставки');
    });

    it('о смене статуса судовладелец получает SMS (журнал уведомлений)', async () => {
      const sms = await prisma.notification.findFirst({ where: { orderId, channel: 'SMS', body: { contains: 'Подтверждён' } } });
      expect(sms).toBeTruthy();
      expect(sms!.recipient).toBe('+79000000001');
      const log = await sales.get('/admin/notifications').expect(200);
      expect(log.body.length).toBeGreaterThan(0);
      // коды входа в панели не раскрываются
      expect(log.body.some((n: any) => /Код входа[^:]*: \d{4}/.test(n.body))).toBe(false);
    });
  });

  describe('Остатки (сценарий 3 ТЗ)', () => {
    const RELAY = 'НСРЗ-ЭЛ-01102';
    let relayId: number;

    beforeAll(async () => {
      relayId = await partId(prisma, RELAY);
    });

    it('сотрудник склада меняет количество — судовладелец сразу видит новое значение и время обновления', async () => {
      const before = await owner1.get(`/parts/${relayId}`).expect(200);
      const res = await warehouse.patch(`/panel/stock/${relayId}`, { quantity: 9 }).expect(200);
      expect(res.body.updatedBy).toBe('Сидоренко Ольга Викторовна');
      const after = await owner1.get(`/parts/${relayId}`).expect(200);
      expect(after.body.stock.quantity).toBe(9);
      expect(new Date(after.body.stock.updatedAt) > new Date(before.body.stock.updatedAt)).toBe(true);
    });

    it('статус «под заказ» и обратно', async () => {
      await warehouse.patch(`/panel/stock/${relayId}`, { availability: 'ON_ORDER' }).expect(200);
      expect((await owner1.get(`/parts/${relayId}`).expect(200)).body.stock.availability).toBe('ON_ORDER');
      await warehouse.patch(`/panel/stock/${relayId}`, { availability: 'IN_STOCK' }).expect(200);
    });

    it('отрицательное или дробное количество — 400', async () => {
      await warehouse.patch(`/panel/stock/${relayId}`, { quantity: -1 }).expect(400);
      await warehouse.patch(`/panel/stock/${relayId}`, { quantity: 2.5 }).expect(400);
    });

    it('если поставить меньше, чем в резерве, — сохраняется с предупреждением', async () => {
      const id = await partId(prisma, 'НСРЗ-ГД-01102'); // 24 шт., 8 в резерве (подтверждённый заказ)
      const res = await warehouse.patch(`/panel/stock/${id}`, { quantity: 5 }).expect(200);
      expect(res.body.warning).toMatch(/зарезервировано 8/);
      expect(res.body.stock).toMatchObject({ available: 0, orderable: false });
      await warehouse.patch(`/panel/stock/${id}`, { quantity: 24 }).expect(200);
    });

    it('поиск по остаткам в панели', async () => {
      const res = await warehouse.get('/panel/stock?q=реле').expect(200);
      expect(res.body.items.map((i: any) => i.catalogNumber)).toContain(RELAY);
    });

    it('загрузка CSV: верные строки применяются, ошибки перечислены по номерам строк', async () => {
      const csv = [
        'каталожный номер;количество;статус',
        'НСРЗ-ЭЛ-01102;30;в наличии',
        'НСРЗ ПЛ 00512;11;',
        'НСРЗ-XX-99999;5;в наличии',
        'НСРЗ-ЭЛ-01215;много;',
        'НСРЗ-ЭЛ-01340;3;непонятно',
      ].join('\n');
      const res = await warehouse.upload('/panel/stock/import', 'ostatki.csv', csv).expect(201);
      expect(res.body).toMatchObject({ rowsTotal: 5, rowsUpdated: 2, rowsFailed: 3 });
      expect(res.body.errors.map((e: any) => e.row)).toEqual([4, 5, 6]);
      expect(await stockOf(prisma, RELAY)).toMatchObject({ quantity: 30 });
      expect(await stockOf(prisma, 'НСРЗ-ПЛ-00512')).toMatchObject({ quantity: 11 });
      const imports = await warehouse.get('/panel/stock/imports').expect(200);
      expect(imports.body[0]).toMatchObject({ fileName: 'ostatki.csv', rowsFailed: 3, by: 'Сидоренко Ольга Викторовна' });
    });

    it('файл без нужных столбцов — понятная ошибка', async () => {
      const res = await warehouse.upload('/panel/stock/import', 'bad.csv', 'a;b\n1;2').expect(400);
      expect(res.body.message).toMatch(/каталожный номер/);
    });

    it('шаблон для загрузки скачивается', async () => {
      const res = await warehouse.get('/panel/stock/template.csv').expect(200);
      expect(res.text).toContain('каталожный номер;наименование;количество;статус');
    });
  });

  describe('Статистика и справочники', () => {
    it('статистика по заказам', async () => {
      const res = await sales.get('/panel/stats').expect(200);
      expect(res.body.totals.all).toBeGreaterThan(10);
      expect(res.body.byDay).toHaveLength(14);
      expect(res.body.avgConfirmMinutes).toBeGreaterThan(0);
      expect(Array.isArray(res.body.topParts)).toBe(true);
    });

    it('компании с судами и пользователи', async () => {
      const companies = await sales.get('/admin/companies').expect(200);
      expect(companies.body).toHaveLength(3);
      const users = await sales.get('/admin/users').expect(200);
      expect(users.body.find((u: any) => u.email === 'polishuk@nsrz.ru').isActive).toBe(false);
    });
  });
});
