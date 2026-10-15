import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { as, Client, createApp, LOGINS, login, partId, placeOrder, stockOf } from './helpers';

/**
 * Главные бизнес-правила заказа:
 *  — один и тот же заказ нельзя отправить несколько раз;
 *  — то, что ушло на подтверждение, резервируется: следующий заказ не может взять больше, чем осталось.
 */
describe('Заказы: резерв остатков и защита от повторов', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner1: Client;
  let owner2: Client;
  let staff: Client;
  let vessel1: string; // т/х «Мысхако» (ООО «Черноморский флот»)
  let vessel1b: string; // т/х «Цемесская бухта»
  let vessel2: string; // буксир «Кабардинка» (ООО «Азов-Транс»)

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    const a = await login(app, LOGINS.owner1);
    const b = await login(app, LOGINS.owner2);
    owner1 = as(app, a.accessToken);
    owner2 = as(app, b.accessToken);
    staff = as(app, (await login(app, LOGINS.sales)).accessToken);
    vessel1 = a.user.vessels[0].id;
    vessel1b = a.user.vessels[1].id;
    vessel2 = b.user.vessels.find((v: any) => v.name.includes('Кабардинка')).id;
  });
  afterAll(() => app.close());

  describe('Резерв: нельзя заказать больше, чем осталось после заказов на подтверждении', () => {
    const FILTER = 'НСРЗ-ГД-01427'; // на складе 12 шт., резерва нет
    let filterId: number;
    let firstOrderId: number;

    beforeAll(async () => {
      filterId = await partId(prisma, FILTER);
    });

    it('исходно: 12 шт. на складе, 12 доступно', async () => {
      const res = await owner1.get(`/parts/${filterId}`).expect(200);
      expect(res.body.stock).toMatchObject({ quantity: 12, reserved: 0, available: 12, availability: 'IN_STOCK' });
    });

    it('заказ на 10 шт. резервирует 10 шт.', async () => {
      const res = await placeOrder(owner1, [[filterId, 10]], vessel1);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.number).toMatch(/^НСРЗ-\d{6}$/);
      firstOrderId = res.body.id;
      expect(await stockOf(prisma, FILTER)).toMatchObject({ quantity: 12, reserved: 10 });
    });

    it('другой судовладелец видит, что доступно только 2 шт.', async () => {
      const res = await owner2.get(`/parts/${filterId}`).expect(200);
      expect(res.body.stock).toMatchObject({ available: 2, reserved: 10, maxOrder: 2, orderable: true });
    });

    it('положить в корзину 3 шт. нельзя — 409 «доступно только 2»', async () => {
      await owner2.delete('/cart').expect(200);
      const res = await owner2.post('/cart/items', { partId: filterId, quantity: 3 }).expect(409);
      expect(res.body.message).toMatch(/доступно только 2/);
      expect(res.body.message).toMatch(/в резерве/);
    });

    it('2 шт. — можно, после заказа остаток полностью в резерве', async () => {
      const res = await placeOrder(owner2, [[filterId, 2]], vessel2);
      expect(res.status).toBe(201);
      expect(await stockOf(prisma, FILTER)).toMatchObject({ quantity: 12, reserved: 12 });
    });

    it('теперь деталь показывается как «всё в резерве» и в корзину не кладётся', async () => {
      const part = await owner1.get(`/parts/${filterId}`).expect(200);
      expect(part.body.stock).toMatchObject({ availability: 'OUT_OF_STOCK', allReserved: true, orderable: false, available: 0 });
      expect(part.body.stock.availabilityTitle).toBe('Всё в резерве');
      const res = await owner1.post('/cart/items', { partId: filterId, quantity: 1 }).expect(409);
      expect(res.body.message).toMatch(/уже в резерве/);
    });

    it('если товар лежал в корзине, а его зарезервировали — заказ не пройдёт (409)', async () => {
      // склад добавил 1 шт., оба судовладельца положили её в корзину, первый успел оформить
      await staff.patch(`/panel/stock/${filterId}`, { quantity: 13 }).expect(200);
      await owner1.delete('/cart').expect(200);
      await owner2.delete('/cart').expect(200);
      await owner1.post('/cart/items', { partId: filterId, quantity: 1 }).expect(201);
      await owner2.post('/cart/items', { partId: filterId, quantity: 1 }).expect(201);
      await owner1.post('/orders', { vesselId: vessel1, deliveryMethod: 'PICKUP', idempotencyKey: randomUUID() }).expect(201);

      const cart = await owner2.get('/cart').expect(200);
      expect(cart.body.hasProblems).toBe(true);
      const res = await owner2.post('/orders', { vesselId: vessel2, deliveryMethod: 'PICKUP', idempotencyKey: randomUUID() }).expect(409);
      expect(res.body.code).toBe('NOT_ENOUGH_STOCK');
      expect(await stockOf(prisma, FILTER)).toMatchObject({ quantity: 13, reserved: 13 });
      await owner2.delete('/cart').expect(200);
    });

    it('отклонение заказа снимает резерв', async () => {
      await staff.patch(`/panel/orders/${firstOrderId}/status`, { status: 'REJECTED', reason: 'Нет в наличии на складе' }).expect(200);
      expect(await stockOf(prisma, FILTER)).toMatchObject({ quantity: 13, reserved: 3 });
      const res = await owner2.get(`/parts/${filterId}`).expect(200);
      expect(res.body.stock.available).toBe(10);
    });
  });

  describe('Одновременные заказы последней единицы', () => {
    const PUMP = 'НСРЗ-НС-02987'; // на складе 1 шт.

    it('два судовладельца жмут «Оформить» одновременно — заказ получает только один', async () => {
      const id = await partId(prisma, PUMP);
      await owner1.delete('/cart').expect(200);
      await owner2.delete('/cart').expect(200);
      await owner1.post('/cart/items', { partId: id, quantity: 1 }).expect(201);
      await owner2.post('/cart/items', { partId: id, quantity: 1 }).expect(201);

      const [a, b] = await Promise.all([
        owner1.post('/orders', { vesselId: vessel1, deliveryMethod: 'PICKUP', idempotencyKey: randomUUID() }),
        owner2.post('/orders', { vesselId: vessel2, deliveryMethod: 'PICKUP', idempotencyKey: randomUUID() }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(await stockOf(prisma, PUMP)).toMatchObject({ quantity: 1, reserved: 1 });
      expect(await prisma.orderItem.count({ where: { partId: id, order: { status: 'PENDING' } } })).toBe(1);
      await owner1.delete('/cart').expect(200);
      await owner2.delete('/cart').expect(200);
    });
  });

  describe('Один и тот же заказ нельзя оформить несколько раз', () => {
    const RELAY = 'НСРЗ-ЭЛ-01102'; // 21 шт.
    let relayId: number;
    const key = randomUUID();
    let orderId: number;
    let orderNumber: string;

    beforeAll(async () => {
      relayId = await partId(prisma, RELAY);
    });

    it('повторное добавление той же запчасти не создаёт вторую строку в корзине', async () => {
      await owner1.delete('/cart').expect(200);
      await owner1.post('/cart/items', { partId: relayId, quantity: 1 }).expect(201);
      const res = await owner1.post('/cart/items', { partId: relayId, quantity: 2 }).expect(201);
      expect(res.body.positions).toBe(1);
      expect(res.body.items[0].quantity).toBe(3);
    });

    it('первая отправка создаёт заказ', async () => {
      const res = await owner1.post('/orders', { vesselId: vessel1, deliveryMethod: 'TO_BOARD', idempotencyKey: key }).expect(201);
      orderId = res.body.id;
      orderNumber = res.body.number;
      expect(res.body.duplicate).toBe(false);
      expect(res.body.items).toHaveLength(1);
      expect((await owner1.get('/cart').expect(200)).body.positions).toBe(0);
    });

    it('повтор с тем же ключом (двойное нажатие, обрыв связи) возвращает тот же заказ, нового не создаёт', async () => {
      const before = await prisma.order.count();
      const res = await owner1.post('/orders', { vesselId: vessel1, deliveryMethod: 'TO_BOARD', idempotencyKey: key }).expect(200);
      expect(res.body.id).toBe(orderId);
      expect(res.body.duplicate).toBe(true);
      expect(await prisma.order.count()).toBe(before);
    });

    it('повтор с новым ключом находит пустую корзину — 409', async () => {
      const res = await owner1.post('/orders', { vesselId: vessel1, deliveryMethod: 'TO_BOARD', idempotencyKey: randomUUID() }).expect(409);
      expect(res.body.code).toBe('CART_EMPTY');
    });

    it('точно такой же заказ на то же судно, пока первый ждёт подтверждения, — 409 с номером первого', async () => {
      await owner1.post('/cart/items', { partId: relayId, quantity: 3 }).expect(201);
      const res = await owner1.post('/orders', { vesselId: vessel1, deliveryMethod: 'TO_BOARD', idempotencyKey: randomUUID() }).expect(409);
      expect(res.body.code).toBe('DUPLICATE_ORDER');
      expect(res.body.orderNumber).toBe(orderNumber);
      expect(res.body.message).toContain(orderNumber);
    });

    it('тот же набор, но на другое судно — это уже другой заказ, разрешено', async () => {
      await owner1.post('/orders', { vesselId: vessel1b, deliveryMethod: 'TO_BOARD', idempotencyKey: randomUUID() }).expect(201);
    });

    it('после подтверждения первого заказа повторить его можно (это новая закупка)', async () => {
      await staff.patch(`/panel/orders/${orderId}/status`, { status: 'CONFIRMED' }).expect(200);
      await owner1.post('/cart/items', { partId: relayId, quantity: 3 }).expect(201);
      await owner1.post('/orders', { vesselId: vessel1, deliveryMethod: 'TO_BOARD', idempotencyKey: randomUUID() }).expect(201);
    });

    it('двойное нажатие: два одинаковых запроса одновременно — один заказ', async () => {
      await owner1.delete('/cart').expect(200);
      await owner1.post('/cart/items', { partId: relayId, quantity: 1 }).expect(201);
      const sameKey = randomUUID();
      const body = { vesselId: vessel1b, deliveryMethod: 'PICKUP', idempotencyKey: sameKey };
      const [a, b] = await Promise.all([owner1.post('/orders', body), owner1.post('/orders', body)]);
      expect([a.status, b.status].sort()).toEqual([200, 201]);
      expect(a.body.id).toBe(b.body.id);
      expect(await prisma.order.count({ where: { idempotencyKey: sameKey } })).toBe(1);
    });

    it('два запроса с разными ключами одновременно — второй получает «корзина пуста»', async () => {
      await owner1.post('/cart/items', { partId: relayId, quantity: 2 }).expect(201);
      const [a, b] = await Promise.all([
        owner1.post('/orders', { vesselId: vessel1b, deliveryMethod: 'CARRIER', idempotencyKey: randomUUID() }),
        owner1.post('/orders', { vesselId: vessel1b, deliveryMethod: 'CARRIER', idempotencyKey: randomUUID() }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
    });
  });

  describe('Проверки корзины и оформления', () => {
    it('«нет на складе» в корзину не кладётся', async () => {
      const id = await partId(prisma, 'НСРЗ-ДГ-00702');
      const res = await owner1.post('/cart/items', { partId: id, quantity: 1 }).expect(409);
      expect(res.body.message).toMatch(/нет на складе/);
    });

    it('«под заказ» — без ограничения склада и без резерва', async () => {
      const id = await partId(prisma, 'НСРЗ-НС-03310');
      const res = await placeOrder(owner2, [[id, 5]], vessel2);
      expect(res.status).toBe(201);
      expect(res.body.items[0].reserved).toBe(false);
      expect(await stockOf(prisma, 'НСРЗ-НС-03310')).toMatchObject({ quantity: 0, reserved: 0 });
    });

    it('количество 0 или дробное — ошибка проверки (400)', async () => {
      const id = await partId(prisma, 'НСРЗ-ЭЛ-01340');
      await owner1.post('/cart/items', { partId: id, quantity: 0 }).expect(400);
      await owner1.post('/cart/items', { partId: id, quantity: 1.5 }).expect(400);
    });

    it('судно чужой компании выбрать нельзя', async () => {
      const id = await partId(prisma, 'НСРЗ-ЭЛ-01340');
      await owner1.delete('/cart').expect(200);
      await owner1.post('/cart/items', { partId: id, quantity: 1 }).expect(201);
      await owner1.post('/orders', { vesselId: vessel2, deliveryMethod: 'PICKUP', idempotencyKey: randomUUID() }).expect(400);
      await owner1.delete('/cart').expect(200);
    });

    it('сумма заказа = цена × количество, цена фиксируется на момент заказа', async () => {
      const id = await partId(prisma, 'НСРЗ-ПЛ-00512'); // 6 900 ₽
      const res = await placeOrder(owner2, [[id, 2]], vessel2);
      expect(res.status).toBe(201);
      expect(res.body.total).toBe(13800);
      await prisma.part.update({ where: { id }, data: { price: 9999 } });
      const again = await owner2.get(`/orders/${res.body.id}`).expect(200);
      expect(again.body.total).toBe(13800);
    });
  });

  describe('История и изоляция данных', () => {
    it('судовладелец видит только заказы своей компании', async () => {
      const res = await owner2.get('/orders?status=ALL').expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.items.every((o: any) => o.company.name === 'ООО «Азов-Транс»')).toBe(true);
    });

    it('чужой заказ — 404 (как будто его нет), экспорт тоже', async () => {
      const foreign = await prisma.order.findFirstOrThrow({ where: { company: { name: 'ООО «Черноморский флот»' } } });
      await owner2.get(`/orders/${foreign.id}`).expect(404);
      await owner2.get(`/orders/${foreign.id}/export.csv`).expect(404);
    });

    it('экспорт детализации — CSV с номером, позициями и историей', async () => {
      const own = await prisma.order.findFirstOrThrow({ where: { company: { name: 'ООО «Азов-Транс»' } }, include: { items: { include: { part: true } } } });
      const res = await owner2.get(`/orders/${own.id}/export.csv`).expect(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.text).toContain(own.number);
      expect(res.text).toContain(own.items[0].part.catalogNumber);
      expect(res.text).toContain('История статусов');
    });
  });
});
