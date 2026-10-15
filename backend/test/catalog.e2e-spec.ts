import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { as, Client, createApp, LOGINS, login } from './helpers';

describe('Поиск и каталог (сценарий 1 ТЗ)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: Client;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    owner = as(app, (await login(app, LOGINS.owner1)).accessToken);
  });
  afterAll(() => app.close());

  it('поиск по номеру производителя с пробелами: «6L20 FF 118»', async () => {
    const res = await owner.get('/parts?q=' + encodeURIComponent('6L20 FF 118')).expect(200);
    expect(res.body.items[0].catalogNumber).toBe('НСРЗ-ГД-01427');
    // в списке — наименование, номер, остаток и цена (критерий приёмки)
    expect(res.body.items[0]).toMatchObject({
      name: 'Фильтр топливный тонкой очистки',
      manufacturerPartNumber: '6L20-FF-118',
      price: 18450,
      stock: { quantity: 12, availability: 'IN_STOCK' },
    });
    expect(res.body.stockUpdatedAt).toBeTruthy();
  });

  it('поиск по каталожному номеру в любом регистре и с другими разделителями', async () => {
    const res = await owner.get('/parts?q=' + encodeURIComponent('нсрз гд 01427')).expect(200);
    expect(res.body.items.map((i: any) => i.catalogNumber)).toEqual(['НСРЗ-ГД-01427']);
  });

  it('поиск по частичному номеру «6L20» находит все детали двигателя 6L20', async () => {
    const res = await owner.get('/parts?q=6l20').expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(5);
    expect(res.body.items.every((i: any) => i.manufacturerPartNumber.startsWith('6L20'))).toBe(true);
  });

  it('поиск по наименованию: регистр и порядок слов не важны', async () => {
    const res = await owner.get('/parts?q=' + encodeURIComponent('ТОПЛИВНЫЙ фильтр')).expect(200);
    expect(res.body.items.map((i: any) => i.catalogNumber)).toContain('НСРЗ-ГД-01427');
  });

  it('поиск без результатов', async () => {
    const res = await owner.get('/parts?q=' + encodeURIComponent('вертолёт')).expect(200);
    expect(res.body).toMatchObject({ total: 0, items: [] });
  });

  it('фильтр по типу судна', async () => {
    const tug = await prisma.vesselType.findUniqueOrThrow({ where: { name: 'Буксир' } });
    const res = await owner.get(`/parts?vesselTypeId=${tug.id}&pageSize=50`).expect(200);
    expect(res.body.total).toBeGreaterThan(5);
    expect(res.body.items.every((i: any) => i.vesselTypes.includes('Буксир'))).toBe(true);
  });

  it('фильтр по категории + поиск', async () => {
    const cat = await prisma.partCategory.findUniqueOrThrow({ where: { name: 'Насосы' } });
    const res = await owner.get(`/parts?categoryId=${cat.id}&q=` + encodeURIComponent('подшипник')).expect(200);
    expect(res.body.items.map((i: any) => i.catalogNumber)).toEqual(['НСРЗ-НС-03045']);
  });

  it('«только доступные» не показывает то, что заказать нельзя', async () => {
    const res = await owner.get('/parts?onlyAvailable=true&pageSize=50').expect(200);
    expect(res.body.items.every((i: any) => i.stock.orderable)).toBe(true);
    const all = await owner.get('/parts?pageSize=50').expect(200);
    expect(all.body.total).toBeGreaterThan(res.body.total);
  });

  it('статусы наличия: в наличии / под заказ / нет на складе', async () => {
    const res = await owner.get('/parts?pageSize=50').expect(200);
    const statuses = new Set(res.body.items.map((i: any) => i.stock.availability));
    expect(statuses).toEqual(new Set(['IN_STOCK', 'ON_ORDER', 'OUT_OF_STOCK']));
    const onOrder = res.body.items.find((i: any) => i.catalogNumber === 'НСРЗ-НС-03310');
    expect(onOrder).toMatchObject({ leadTimeDays: 14, stock: { availability: 'ON_ORDER', orderable: true } });
  });

  it('карточка запчасти — с описанием, сроком поставки и временем обновления остатков', async () => {
    const id = (await prisma.part.findUniqueOrThrow({ where: { catalogNumber: 'НСРЗ-ГД-01427' } })).id;
    const res = await owner.get(`/parts/${id}`).expect(200);
    expect(res.body.description).toMatch(/Тонкость фильтрации/);
    expect(res.body.stock.updatedAt).toBeTruthy();
    await owner.get('/parts/999999').expect(404);
  });

  it('постраничная выдача (для медленного канала)', async () => {
    const p1 = await owner.get('/parts?pageSize=10&page=1').expect(200);
    const p2 = await owner.get('/parts?pageSize=10&page=2').expect(200);
    expect(p1.body.items).toHaveLength(10);
    expect(p1.body.items[0].id).not.toBe(p2.body.items[0].id);
    await owner.get('/parts?pageSize=500').expect(400);
  });

  it('справочники для фильтров и оформления', async () => {
    const res = await owner.get('/dictionaries').expect(200);
    expect(res.body.vesselTypes).toHaveLength(5);
    expect(res.body.categories).toHaveLength(8);
    expect(res.body.deliveryMethods.map((d: any) => d.code)).toEqual(['PICKUP', 'TO_BOARD', 'CARRIER']);
  });

  it('ответы сжимаются (канал до 128 кбит/с)', async () => {
    const res = await owner.get('/parts?pageSize=50').set('Accept-Encoding', 'gzip').expect(200);
    expect(res.headers['content-encoding']).toBe('gzip');
  });
});
