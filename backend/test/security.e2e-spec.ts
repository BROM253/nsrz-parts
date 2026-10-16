import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { as, Client, createApp, LOGINS, login, partId, placeOrder, stockOf } from './helpers';

/**
 * Этап 5. Безопасность: проверки по OWASP Top 10 (2021) на собственном сервере.
 * Каждый тест — защита, которая должна работать; найденные дефекты закреплены тестами, чтобы не вернулись.
 */
describe('Безопасность (OWASP Top 10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner1: Client;
  let owner2: Client;
  let sales: Client;
  let warehouse: Client;
  let admin: Client;
  let owner1Id: string;
  let adminId: string;
  let vessel1: string;
  let vessel2: string;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    const o1 = await login(app, LOGINS.owner1);
    owner1 = as(app, o1.accessToken);
    owner1Id = o1.user.id;
    vessel1 = o1.user.vessels[0].id;
    const o2 = await login(app, LOGINS.owner2);
    owner2 = as(app, o2.accessToken);
    vessel2 = o2.user.vessels[0].id;
    sales = as(app, (await login(app, LOGINS.sales)).accessToken);
    warehouse = as(app, (await login(app, LOGINS.warehouse)).accessToken);
    const a = await login(app, LOGINS.admin);
    admin = as(app, a.accessToken);
    adminId = a.user.id;
  });
  afterAll(() => app.close());

  const server = () => app.getHttpServer();

  describe('A01. Нарушение контроля доступа', () => {
    it('склад не может создавать пользователей и менять роли — 403', async () => {
      await warehouse.post('/admin/users', { fullName: 'Проверка Прав', role: 'ADMIN', email: 'x@nsrz.ru' }).expect(403);
      await warehouse.patch(`/admin/users/${owner1Id}`, { role: 'ADMIN' }).expect(403);
    });

    it('судовладелец не может менять статусы и остатки — 403', async () => {
      await owner1.patch('/panel/orders/141/status', { status: 'CONFIRMED' }).expect(403);
      await owner1.patch('/panel/stock/1', { quantity: 999 }).expect(403);
      await owner1.get('/admin/notifications').expect(403);
    });

    it('ключ повторной отправки чужого заказа не раскрывает чужой заказ', async () => {
      const id = await partId(prisma, 'НСРЗ-НС-03045');
      const first = await placeOrder(owner1, [[id, 1]], vessel1, '5ec0e1a1-0000-4000-8000-000000000001');
      expect(first.status).toBe(201);
      const second = await placeOrder(owner2, [[id, 1]], vessel2, '5ec0e1a1-0000-4000-8000-000000000001');
      expect(second.status).toBe(409);
      expect(JSON.stringify(second.body)).not.toContain(first.body.number);
    });

    it('администратор не может отключить или понизить сам себя (иначе система останется без администратора)', async () => {
      await admin.patch(`/admin/users/${adminId}`, { isActive: false }).expect(400);
      await admin.patch(`/admin/users/${adminId}`, { role: 'SALES' }).expect(400);
      const me = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
      expect(me.isActive).toBe(true);
      expect(me.role).toBe('ADMIN');
    });
  });

  describe('A02. Криптография и хранение секретов', () => {
    it('refresh-токены и коды входа хранятся в БД только в виде хэша', async () => {
      const sent = await request(server()).post('/api/auth/request-code').send({ login: LOGINS.owner3 }).expect(200);
      const code = await prisma.authCode.findFirstOrThrow({ where: { login: LOGINS.owner3 }, orderBy: { createdAt: 'desc' } });
      expect(code.codeHash).not.toContain(sent.body.devCode);
      expect(code.codeHash).toMatch(/^[0-9a-f]{64}$/);

      const tokens = await request(server()).post('/api/auth/verify').send({ login: LOGINS.owner3, code: sent.body.devCode }).expect(200);
      const stored = await prisma.refreshToken.findMany({ where: { tokenHash: tokens.body.refreshToken } });
      expect(stored).toHaveLength(0);
    });

    it('в журнале уведомлений панели коды входа скрыты', async () => {
      const res = await admin.get('/admin/notifications?take=200').expect(200);
      for (const n of res.body) expect(n.body).not.toMatch(/Код входа[^:]*: \d{4}/);
    });
  });

  describe('A03. Инъекции', () => {
    it.each(["' OR 1=1 --", '"; DROP TABLE parts; --', '<script>alert(1)</script>', String.fromCharCode(92)])(
      'поиск «%s» — обычный текст, а не команда (200, ничего не найдено)',
      async (q) => {
        const res = await owner1.get(`/parts?q=${encodeURIComponent(q)}`).expect(200);
        expect(res.body.total).toBe(0);
        expect(await prisma.part.count()).toBe(36);
      },
    );

    it('символы % и _ ищутся буквально, а не как шаблон LIKE', async () => {
      expect((await owner1.get(`/parts?q=${encodeURIComponent('%')}`).expect(200)).body.total).toBe(0);
      expect((await owner1.get(`/parts?q=${encodeURIComponent('ф_льтр')}`).expect(200)).body.total).toBe(0);
      expect((await sales.get(`/panel/orders?status=ALL&q=${encodeURIComponent('%')}`).expect(200)).body.total).toBe(0);
    });

    it('экспорт CSV: текст, похожий на формулу Excel, не исполняется (CSV-инъекция)', async () => {
      const id = await partId(prisma, 'НСРЗ-ЭЛ-01102');
      await owner1.delete('/cart').expect(200);
      await owner1.post('/cart/items', { partId: id, quantity: 1 }).expect(201);
      const order = await owner1.post('/orders', { vesselId: vessel1, deliveryMethod: 'PICKUP', comment: '=1+1' }).expect(201);
      const csv = await owner1.get(`/orders/${order.body.id}/export.csv`).expect(200);
      const line = csv.text.split(/\r?\n/).find((l) => l.startsWith('Комментарий'))!;
      expect(line).toBe("Комментарий;'=1+1");
      for (const cell of csv.text.split(/[;\r\n]/)) expect(cell).not.toMatch(/^[=+\-@]/);
    });
  });

  describe('A04/A07. Вход: перебор кода и подделка токенов', () => {
    it('20 одновременных попыток угадать код — проверяется не больше 5', async () => {
      const sent = await request(server()).post('/api/auth/request-code').send({ login: LOGINS.owner2 }).expect(200);
      const right = sent.body.devCode as string;
      const wrong = Array.from({ length: 20 }, (_, i) => String((Number(right) + 1 + i) % 9000 + 1000)).filter((c) => c !== right);
      const answers = await Promise.all(
        wrong.map((code) => request(server()).post('/api/auth/verify').send({ login: LOGINS.owner2, code })),
      );
      const checked = answers.filter((r) => r.status === 400 && /Неверный код/.test(r.body.message)).length;
      expect(checked).toBeLessThanOrEqual(5);
      // после исчерпания попыток не принимается даже верный код
      await request(server()).post('/api/auth/verify').send({ login: LOGINS.owner2, code: right }).expect(429);
    });

    it('токен, подписанный чужим ключом, — 401', async () => {
      const forged = new JwtService({ secret: 'не-наш-секрет' }).sign({ sub: owner1Id, role: 'ADMIN' });
      await request(server()).get('/api/me').set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('токен без подписи (alg: none) — 401', async () => {
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: adminId, role: 'ADMIN' })}.`;
      await request(server()).get('/api/admin/users').set('Authorization', `Bearer ${unsigned}`).expect(401);
    });

    it('просроченный токен — 401', async () => {
      const expired = new JwtService({ secret: process.env.JWT_SECRET }).sign({ sub: owner1Id, role: 'OWNER', exp: Math.floor(Date.now() / 1000) - 60 });
      await request(server()).get('/api/me').set('Authorization', `Bearer ${expired}`).expect(401);
    });

    it('роль в токене ничего не решает: права берутся из БД', async () => {
      const real = new JwtService({ secret: process.env.JWT_SECRET }).sign({ sub: owner1Id, role: 'ADMIN' }, { expiresIn: 60 });
      await request(server()).get('/api/admin/users').set('Authorization', `Bearer ${real}`).expect(403);
    });
  });

  describe('A04. Логика: лишние поля и границы', () => {
    it('нельзя подсунуть статус, сумму или цену в заказ и корзину — 400', async () => {
      const id = await partId(prisma, 'НСРЗ-НС-03045');
      await owner1.post('/cart/items', { partId: id, quantity: 1, price: 1 }).expect(400);
      await owner1.post('/orders', { vesselId: vessel1, deliveryMethod: 'PICKUP', status: 'COMPLETED', total: 1 }).expect(400);
    });

    it('количество вне разумных пределов — 400', async () => {
      const id = await partId(prisma, 'НСРЗ-НС-03045');
      await owner1.post('/cart/items', { partId: id, quantity: 1_000_000_000 }).expect(400);
      await owner1.post('/cart/items', { partId: id, quantity: -1 }).expect(400);
      await warehouse.patch(`/panel/stock/${id}`, { quantity: 1e12 }).expect(400);
    });

    it('загрузка остатков ниже резерва — с предупреждением, как при ручном изменении', async () => {
      const id = await partId(prisma, 'НСРЗ-ЭЛ-01215');
      const order = await placeOrder(owner2, [[id, 2]], vessel2);
      expect(order.status).toBe(201);
      const res = await warehouse.upload('/panel/stock/import', 'ostatki.csv', 'каталожный номер;количество\r\nНСРЗ-ЭЛ-01215;0\r\n').expect(201);
      expect(res.body.warnings?.join(' ')).toMatch(/резерв/);
      expect((await stockOf(prisma, 'НСРЗ-ЭЛ-01215')).quantity).toBe(0);
    });

    it('второй сотрудник подтверждает уже подтверждённый заказ — понятный 409', async () => {
      const id = await partId(prisma, 'НСРЗ-ЭЛ-01340');
      const order = await placeOrder(owner2, [[id, 1]], vessel2);
      await sales.patch(`/panel/orders/${order.body.id}/status`, { status: 'CONFIRMED' }).expect(200);
      const again = await warehouse.patch(`/panel/orders/${order.body.id}/status`, { status: 'CONFIRMED' }).expect(409);
      expect(again.body.message).toMatch(/другой сотрудник/);
    });
  });

  describe('A05. Настройки безопасности сервера', () => {
    it('заголовки безопасности на месте, версия сервера не раскрывается', async () => {
      const res = await request(server()).get('/api/health').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('сайт отдаётся со строгой политикой CSP: чужие и встроенные скрипты не исполняются', async () => {
      const res = await request(server()).get('/orders').set('Accept', 'text/html').expect(200);
      const csp = res.headers['content-security-policy'];
      expect(csp).toContain("script-src 'self'");
      expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
      expect(csp).toContain("object-src 'none'");
    });

    it('за прокси доверяем только локальному туннелю: подменить свой IP заголовком нельзя', () => {
      const trust = app.getHttpAdapter().getInstance().get('trust proxy fn') as (addr: string, i: number) => boolean;
      expect(trust('127.0.0.1', 0)).toBe(true); // туннель на этом же ПК
      expect(trust('192.168.3.15', 0)).toBe(false); // телефон в домашней сети
      expect(trust('203.0.113.7', 0)).toBe(false);
    });

    it.each(['/..%2f..%2fbackend%2f.env', '/download/..%2f..%2fbackend%2f.env', '/m/..%2f..%2f..%2fbackend%2f.env', '/img/..%2f..%2f..%2fbackend%2f.env'])(
      'выход за пределы папок сайта (%s) не отдаёт файлы сервера',
      async (path) => {
        const res = await request(server()).get(path);
        expect(res.text ?? '').not.toContain('JWT_SECRET');
        expect(res.text ?? '').not.toContain('DATABASE_URL');
      },
    );

    it('ошибки не раскрывают внутренности (стек, SQL)', async () => {
      const bad = await request(server()).post('/api/auth/verify').set('Content-Type', 'application/json').send('{"login":').expect(400);
      expect(JSON.stringify(bad.body)).not.toMatch(/at \w+ \(|node_modules|prisma/i);

      const fk = await admin.post('/admin/vessels', { companyId: '00000000-0000-4000-8000-000000000000', vesselTypeId: 1, name: 'Проверка' });
      expect(fk.status).toBe(400);
      expect(JSON.stringify(fk.body)).not.toMatch(/prisma|constraint|foreign/i);
      await admin.post('/admin/categories', { name: 'Проверка', parentId: 999999 }).expect(400);
    });

    it('загрузка файла: больше 5 МБ — 413, неподдерживаемый тип — 400', async () => {
      const big = 'каталожный номер;количество\r\n' + 'НСРЗ-НС-03045;1\r\n'.repeat(400_000);
      await warehouse.upload('/panel/stock/import', 'big.csv', big).expect(413);
      await warehouse.upload('/panel/stock/import', 'virus.exe', 'MZ').expect(400);
    });
  });
});
