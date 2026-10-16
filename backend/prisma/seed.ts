import { Availability, OrderStatus, Prisma, PrismaClient, Role } from '@prisma/client';
import { createHash } from 'crypto';
import { numberKey, searchText } from '../src/common/text';
import { orderNumber } from '../src/common/domain';
import { CATEGORIES, COMPANIES, ORDERS, PARTS, USERS, VESSEL_TYPES, VESSELS } from './seed-data';

const HOUR = 3600 * 1000;

/** Иллюстрация детали: web/public/img/parts/<номер производителя>.svg (рисует scripts/part-images.mjs). */
export const partImageUrl = (mpn: string) => `/img/parts/${mpn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.svg`;

/** Полностью пересоздаёт демо-данные. Используется командой `npm run db:seed` и автотестами. */
export async function seed(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE notifications, refresh_tokens, auth_codes, order_status_history, order_items, orders,
       cart_items, stock_imports, stock, part_vessel_types, parts, part_categories, vessels, vessel_types,
       users, companies RESTART IDENTITY CASCADE`,
  );
  // номера заказов начинаются не с 1 — так история выглядит естественно
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE orders_id_seq RESTART WITH 141`);

  const now = Date.now();
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(now).split('-').map(Number);
  const moscow = (daysAgo: number, hour: number, minute = 0) => new Date(Date.UTC(y, m - 1, d - daysAgo, hour - 3, minute));
  let stockTime = moscow(0, 8, 0);
  if (stockTime.getTime() > now) stockTime = moscow(1, 8, 0);

  const vesselTypes = new Map<string, number>();
  for (const name of VESSEL_TYPES) vesselTypes.set(name, (await prisma.vesselType.create({ data: { name } })).id);

  const categories = new Map<string, number>();
  for (const c of CATEGORIES) categories.set(c.name, (await prisma.partCategory.create({ data: c })).id);

  const companies = new Map<string, string>();
  for (const c of COMPANIES) {
    const { key, ...data } = c;
    companies.set(key, (await prisma.company.create({ data })).id);
  }

  const vessels = new Map<string, string>();
  for (const v of VESSELS) {
    const row = await prisma.vessel.create({
      data: { companyId: companies.get(v.company)!, vesselTypeId: vesselTypes.get(v.type)!, name: v.name, imoNumber: v.imo },
    });
    vessels.set(v.key, row.id);
  }

  const users = new Map<string, string>();
  for (const [key, u] of Object.entries(USERS)) {
    const row = await prisma.user.create({
      data: {
        fullName: u.fullName,
        role: u.role as Role,
        companyId: u.company ? companies.get(u.company)! : null,
        phone: u.phone,
        email: u.email,
        isActive: 'isActive' in u ? u.isActive : true,
        createdAt: new Date(now - 30 * 24 * HOUR),
      },
    });
    users.set(key, row.id);
  }

  // какие позиции сейчас в активных заказах — из них складывается резерв
  const reservedByNumber = new Map<string, number>();
  for (const o of ORDERS) {
    const final = o.path.length ? o.path[o.path.length - 1][0] : 'PENDING';
    if (final === 'COMPLETED' || final === 'REJECTED') continue;
    for (const [num, qty] of o.items) {
      const part = PARTS.find((p) => p.num === num)!;
      if (part.av === 'IN_STOCK') reservedByNumber.set(num, (reservedByNumber.get(num) ?? 0) + qty);
    }
  }

  const parts = new Map<string, { id: number; price: number; av: string }>();
  for (const p of PARTS) {
    const row = await prisma.part.create({
      data: {
        name: p.name,
        description: p.desc,
        catalogNumber: p.num,
        manufacturerPartNumber: p.mpn,
        searchKey: `${numberKey(p.num)}|${numberKey(p.mpn)}`,
        searchText: searchText(`${p.name} ${p.desc}`),
        categoryId: categories.get(p.cat)!,
        price: new Prisma.Decimal(p.price),
        unit: p.unit ?? 'шт.',
        leadTimeDays: p.lead ?? 0,
        imageUrl: partImageUrl(p.mpn),
        vesselTypes: { create: p.vt.map((t) => ({ vesselTypeId: vesselTypes.get(t)! })) },
        stock: {
          create: {
            quantity: p.qty,
            reserved: reservedByNumber.get(p.num) ?? 0,
            availability: p.av as Availability,
            updatedAt: stockTime,
            updatedById: users.get('warehouse'),
          },
        },
      },
    });
    parts.set(p.num, { id: row.id, price: p.price, av: p.av });
  }

  await prisma.stockImport.create({
    data: {
      fileName: 'ostatki_sklad_nsrz.xlsx',
      importedById: users.get('warehouse')!,
      rowsTotal: PARTS.length,
      rowsFailed: 0,
      createdAt: stockTime,
    },
  });

  for (const [i, o] of ORDERS.entries()) {
    const createdAt = o.daysAgo === 0 ? new Date(now + (o.hour ?? -1) * HOUR) : moscow(o.daysAgo, 10, (i % 4) * 17);
    const items = o.items.map(([num, quantity]) => {
      const p = parts.get(num)!;
      return { partId: p.id, quantity, price: new Prisma.Decimal(p.price), reserved: p.av === 'IN_STOCK' };
    });
    const total = items.reduce((s, it) => s.add(it.price.mul(it.quantity)), new Prisma.Decimal(0));
    const vesselId = vessels.get(o.vessel)!;
    const final = (o.path.length ? o.path[o.path.length - 1][0] : 'PENDING') as OrderStatus;
    const lastAt = o.path.length ? new Date(createdAt.getTime() + o.path[o.path.length - 1][1] * HOUR) : createdAt;

    const order = await prisma.order.create({
      data: {
        number: `TMP-${i}`,
        userId: users.get(o.user)!,
        companyId: companies.get(VESSELS.find((v) => v.key === o.vessel)!.company)!,
        vesselId,
        deliveryMethod: o.delivery,
        status: final,
        comment: o.comment ?? null,
        rejectReason: o.reason ?? null,
        total,
        contentHash: createHash('sha256')
          .update(`${vesselId}|${[...items].sort((a, b) => a.partId - b.partId).map((it) => `${it.partId}:${it.quantity}`).join(',')}`)
          .digest('hex'),
        createdAt,
        updatedAt: lastAt,
        items: { create: items },
        statusHistory: {
          create: [
            { status: OrderStatus.PENDING, changedById: users.get(o.user), comment: 'Заказ оформлен', changedAt: createdAt },
            ...o.path.map(([status, hours]) => ({
              status: status as OrderStatus,
              changedById: users.get(status === 'CONFIRMED' || status === 'REJECTED' ? 'sales' : 'warehouse'),
              comment: status === 'REJECTED' ? o.reason : null,
              changedAt: new Date(createdAt.getTime() + hours * HOUR),
            })),
          ],
        },
      },
    });
    await prisma.order.update({ where: { id: order.id }, data: { number: orderNumber(order.id), updatedAt: lastAt } });
  }

  return { users, parts, vessels, companies };
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seed(prisma)
    .then(async () => {
      const [parts, orders] = await Promise.all([prisma.part.count(), prisma.order.count()]);
      console.log(`Демо-данные загружены: ${parts} запчастей, ${orders} заказов.`);
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
