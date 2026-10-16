import { INestApplication } from '@nestjs/common';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { dumpDatabase, listBackups, readBackup, restoreDatabase, writeBackup } from '../src/backup/backup';
import { PrismaService } from '../src/prisma/prisma.service';
import { as, createApp, LOGINS, login, partId, placeOrder } from './helpers';

/** ТЗ п. 4.4: резервное копирование и восстановление (точка восстановления ≤ 24 ч, время ≤ 4 ч). */
describe('Резервное копирование', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
  });
  afterAll(() => app.close());

  it('копия → потеря данных → восстановление: всё как было, нумерация заказов продолжается', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nsrz-backup-'));
    const before = {
      orders: await prisma.order.count(),
      stock: await prisma.stock.findMany({ orderBy: { partId: 'asc' } }),
      maxOrder: (await prisma.order.aggregate({ _max: { id: true } }))._max.id!,
    };
    const file = writeBackup(await dumpDatabase(prisma, 'nsrz_test'), dir);
    expect(listBackups('nsrz_test', dir)).toHaveLength(1);

    // «авария»: пропали заказы и остатки
    await prisma.$executeRawUnsafe('TRUNCATE TABLE order_status_history, order_items, orders CASCADE');
    await prisma.stock.updateMany({ data: { quantity: 0 } });

    const started = Date.now();
    await restoreDatabase(prisma, readBackup(file));
    expect(Date.now() - started).toBeLessThan(4 * 3600 * 1000);

    expect(await prisma.order.count()).toBe(before.orders);
    expect(await prisma.stock.findMany({ orderBy: { partId: 'asc' } })).toEqual(before.stock);

    // после восстановления новый заказ получает следующий номер, а не конфликтует со старыми
    const o = await login(app, LOGINS.owner1);
    const res = await placeOrder(as(app, o.accessToken), [[await partId(prisma, 'НСРЗ-НС-03045'), 1]], o.user.vessels[0].id);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(before.maxOrder + 1);
  });
});
