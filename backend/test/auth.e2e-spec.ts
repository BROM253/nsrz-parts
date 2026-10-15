import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { as, createApp, LOGINS, login } from './helpers';

describe('Вход и права доступа', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app } = await createApp());
  });
  afterAll(() => app.close());

  it('без токена данные недоступны (401)', async () => {
    await http().get('/api/parts').expect(401);
    await http().get('/api/me').expect(401);
  });

  it('health доступен без входа', async () => {
    const res = await http().get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
  });

  it('неизвестный номер — 404 с понятным сообщением', async () => {
    const res = await http().post('/api/auth/request-code').send({ login: '+7 999 123-45-67' }).expect(404);
    expect(res.body.message).toMatch(/не найден/);
  });

  it('кривой номер — 400', async () => {
    await http().post('/api/auth/request-code').send({ login: '12345' }).expect(400);
  });

  it('номер принимается в любом формате: 8 (900) 000-00-01', async () => {
    const res = await http().post('/api/auth/request-code').send({ login: '8 (900) 000-00-01' }).expect(200);
    expect(res.body.channel).toBe('sms');
    expect(res.body.sentTo).toBe('+7 900 ***-**-01');
    expect(res.body.devCode).toMatch(/^\d{4}$/);
  });

  it('неверный код — 400, после 5 ошибок код блокируется (429)', async () => {
    const sent = await http().post('/api/auth/request-code').send({ login: LOGINS.owner2 }).expect(200);
    const wrong = sent.body.devCode === '0000' ? '1111' : '0000';
    for (let i = 0; i < 5; i++) {
      await http().post('/api/auth/verify').send({ login: LOGINS.owner2, code: wrong }).expect(400);
    }
    await http().post('/api/auth/verify').send({ login: LOGINS.owner2, code: sent.body.devCode }).expect(429);
  });

  it('код одноразовый', async () => {
    const sent = await http().post('/api/auth/request-code').send({ login: LOGINS.owner1 }).expect(200);
    await http().post('/api/auth/verify').send({ login: LOGINS.owner1, code: sent.body.devCode }).expect(200);
    await http().post('/api/auth/verify').send({ login: LOGINS.owner1, code: sent.body.devCode }).expect(400);
  });

  it('новый запрос кода отменяет старый', async () => {
    const first = await http().post('/api/auth/request-code').send({ login: LOGINS.owner1 }).expect(200);
    const second = await http().post('/api/auth/request-code').send({ login: LOGINS.owner1 }).expect(200);
    if (first.body.devCode !== second.body.devCode) {
      await http().post('/api/auth/verify').send({ login: LOGINS.owner1, code: first.body.devCode }).expect(400);
    }
    await http().post('/api/auth/verify').send({ login: LOGINS.owner1, code: second.body.devCode }).expect(200);
  });

  it('вход по телефону: профиль с компанией и судами', async () => {
    const { accessToken, user } = await login(app, LOGINS.owner1);
    expect(user.role).toBe('OWNER');
    expect(user.company.name).toBe('ООО «Черноморский флот»');
    expect(user.vessels.map((v: any) => v.name)).toEqual(['т/х «Мысхако»', 'т/х «Цемесская бухта»']);
    const me = await as(app, accessToken).get('/me').expect(200);
    expect(me.body.fullName).toBe('Кравец Иван Петрович');
  });

  it('вход по корпоративной почте', async () => {
    const { user } = await login(app, LOGINS.owner3);
    expect(user.company.name).toBe('ООО «Рыбак Кубани»');
    const staff = await login(app, 'SKLAD@nsrz.ru');
    expect(staff.user.role).toBe('WAREHOUSE');
  });

  it('отключённый пользователь войти не может', async () => {
    await http().post('/api/auth/request-code').send({ login: LOGINS.disabled }).expect(404);
  });

  it('refresh-токен обновляет сессию и одноразовый (ротация)', async () => {
    const { refreshToken } = await login(app, LOGINS.owner1);
    const res = await http().post('/api/auth/refresh').send({ refreshToken }).expect(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).not.toBe(refreshToken);
    await http().post('/api/auth/refresh').send({ refreshToken }).expect(401);
  });

  it('выход отзывает refresh-токен', async () => {
    const { refreshToken } = await login(app, LOGINS.owner1);
    await http().post('/api/auth/logout').send({ refreshToken }).expect(200);
    await http().post('/api/auth/refresh').send({ refreshToken }).expect(401);
  });

  it('поддельный токен — 401', async () => {
    await as(app, 'abc.def.ghi').get('/me').expect(401);
  });

  it('роли: судовладелец не попадает в панель, сотрудник — в корзину', async () => {
    const owner = as(app, (await login(app, LOGINS.owner1)).accessToken);
    const staff = as(app, (await login(app, LOGINS.warehouse)).accessToken);
    await owner.get('/panel/orders').expect(403);
    await owner.get('/panel/stock').expect(403);
    await owner.get('/admin/users').expect(403);
    await staff.get('/cart').expect(403);
    await staff.post('/orders', {}).expect(403);
  });

  it('отключение пользователя администратором действует сразу', async () => {
    const admin = as(app, (await login(app, LOGINS.admin)).accessToken);
    const sales = as(app, (await login(app, LOGINS.sales)).accessToken);
    await sales.post('/admin/users', { fullName: 'Тест Тестов', role: 'SALES', email: 'test@nsrz.ru' }).expect(403);

    const created = await admin.post('/admin/users', { fullName: 'Тест Тестов', role: 'SALES', email: 'test@nsrz.ru' }).expect(201);
    const { accessToken } = await login(app, 'test@nsrz.ru');
    await as(app, accessToken).get('/panel/orders').expect(200);
    await admin.patch(`/admin/users/${created.body.id}`, { isActive: false }).expect(200);
    await as(app, accessToken).get('/panel/orders').expect(401);
  });
});
