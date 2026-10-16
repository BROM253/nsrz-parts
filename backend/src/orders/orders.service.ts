import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Availability, DeliveryMethod, OrderStatus, Prisma, Role } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { AuthUser } from '../common/auth.decorators';
import {
  ACTIVE_STATUSES,
  DELIVERY_METHODS,
  orderNumber,
  STATUS_STEPS,
  STATUS_TITLES,
  STATUS_TRANSITIONS,
  stockView,
} from '../common/domain';
import { csvCell, escapeLike, formatPhone } from '../common/text';
import { partInclude } from '../catalog/catalog.service';
import { quantityProblem } from '../cart/cart.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateOrderInput {
  vesselId: string;
  deliveryMethod: DeliveryMethod;
  comment?: string;
  /** Уникальный ключ попытки оформления (генерирует клиент). Повтор с тем же ключом не создаёт второй заказ. */
  idempotencyKey?: string;
}

export interface ChangeStatusInput {
  status: OrderStatus;
  reason?: string;
  comment?: string;
}

const detailInclude = {
  vessel: { include: { vesselType: true } },
  company: true,
  user: true,
  items: { include: { part: { include: partInclude } }, orderBy: { id: 'asc' } },
  statusHistory: { include: { changedBy: true }, orderBy: [{ changedAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.OrderInclude;

type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof detailInclude }>;

const summaryInclude = {
  vessel: true,
  company: true,
  user: true,
  items: { include: { part: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.OrderInclude;

type OrderSummaryRow = Prisma.OrderGetPayload<{ include: typeof summaryInclude }>;

const money = (v: Prisma.Decimal | number) => Math.round(Number(v) * 100) / 100;

function conflict(message: string, extra: Record<string, unknown> = {}) {
  return new ConflictException({ statusCode: 409, error: 'Conflict', message, ...extra });
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Оформление заказа из корзины (сценарий 2 ТЗ).
   * Защиты:
   *  1) заказы одного пользователя оформляются строго по очереди (advisory-lock в PostgreSQL);
   *  2) повтор с тем же idempotencyKey (двойное нажатие, повтор после обрыва связи) возвращает уже созданный заказ;
   *  3) после оформления корзина очищается — повторная отправка находит пустую корзину;
   *  4) точно такой же заказ для того же судна, ещё ожидающий подтверждения, второй раз не создаётся;
   *  5) резерв на складе берётся атомарным условным UPDATE: нельзя заказать больше, чем свободно
   *     (остаток минус то, что уже ушло на подтверждение в других заказах), даже при одновременных заказах.
   */
  async create(user: AuthUser, input: CreateOrderInput) {
    if (!user.companyId) throw new ForbiddenException('Пользователь не привязан к компании');
    const companyId = user.companyId;

    let result: { orderId: number; duplicate: boolean };
    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${user.id}))`;

          if (input.idempotencyKey) {
            const existing = await tx.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
            if (existing) {
              if (existing.userId !== user.id) throw conflict('Ключ повторной отправки уже использован');
              return { orderId: existing.id, duplicate: true };
            }
          }

          const cart = await tx.cartItem.findMany({
            where: { userId: user.id },
            include: { part: { include: partInclude } },
            orderBy: { partId: 'asc' },
          });
          if (cart.length === 0) {
            throw conflict('Корзина пуста. Если вы только что отправили заказ — он уже в истории заказов.', {
              code: 'CART_EMPTY',
            });
          }

          const vessel = await tx.vessel.findFirst({ where: { id: input.vesselId, companyId } });
          if (!vessel) throw new BadRequestException('Выберите судно вашей компании');

          const contentHash = createHash('sha256')
            .update(`${vessel.id}|${cart.map((c) => `${c.partId}:${c.quantity}`).join(',')}`)
            .digest('hex');
          const same = await tx.order.findFirst({
            where: { companyId, contentHash, status: OrderStatus.PENDING },
          });
          if (same) {
            throw conflict(
              `Точно такой же заказ для этого судна уже ждёт подтверждения: ${same.number}. Повторно оформлять его не нужно.`,
              { code: 'DUPLICATE_ORDER', orderId: same.id, orderNumber: same.number },
            );
          }

          const items: { partId: number; quantity: number; price: Prisma.Decimal; reserved: boolean }[] = [];
          for (const c of cart) {
            const problem = quantityProblem(c.part, c.quantity);
            if (problem) {
              throw conflict(problem, {
                code: 'NOT_ENOUGH_STOCK',
                partId: c.partId,
                available: stockView(c.part.stock).maxOrder,
              });
            }
            let reserved = false;
            if (c.part.stock?.availability === Availability.IN_STOCK) {
              const updated = await tx.$executeRaw`
                UPDATE stock SET reserved = reserved + ${c.quantity}::int
                WHERE part_id = ${c.partId}::int
                  AND availability = 'IN_STOCK'
                  AND quantity - reserved >= ${c.quantity}::int`;
              if (updated === 0) {
                const fresh = await tx.stock.findUnique({ where: { partId: c.partId } });
                const free = Math.max(0, (fresh?.quantity ?? 0) - (fresh?.reserved ?? 0));
                throw conflict(
                  `«${c.part.name}»: пока вы оформляли заказ, остаток зарезервировали по другому заказу. Доступно ${free} ${c.part.unit}.`,
                  { code: 'NOT_ENOUGH_STOCK', partId: c.partId, available: free },
                );
              }
              reserved = true;
            }
            items.push({ partId: c.partId, quantity: c.quantity, price: c.part.price, reserved });
          }

          const total = items.reduce((s, i) => s.add(i.price.mul(i.quantity)), new Prisma.Decimal(0));
          const order = await tx.order.create({
            data: {
              number: `TMP-${randomUUID()}`,
              userId: user.id,
              companyId,
              vesselId: vessel.id,
              deliveryMethod: input.deliveryMethod,
              comment: input.comment?.trim() || null,
              total,
              idempotencyKey: input.idempotencyKey,
              contentHash,
              items: { create: items },
              statusHistory: {
                create: { status: OrderStatus.PENDING, changedById: user.id, comment: 'Заказ оформлен' },
              },
            },
          });
          await tx.order.update({ where: { id: order.id }, data: { number: orderNumber(order.id) } });
          await tx.cartItem.deleteMany({ where: { userId: user.id } });
          return { orderId: order.id, duplicate: false };
        },
        { maxWait: 15_000, timeout: 20_000 },
      );
    } catch (e) {
      // тот же ключ прилетел параллельно — отдаём уже созданный заказ
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && input.idempotencyKey) {
        const existing = await this.prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (existing && existing.userId === user.id) {
          return { ...(await this.detail(existing.id, user)), duplicate: true };
        }
      }
      throw e;
    }

    const detail = await this.detail(result.orderId, user);
    if (!result.duplicate) {
      await this.notifications.email(
        this.config.get('SALES_EMAIL', 'prodazhi@nsrz.ru'),
        `Новый заказ ${detail.number}`,
        `Новый заказ ${detail.number} от ${detail.company.name}, судно ${detail.vessel.name}: ` +
          `${detail.itemsCount} поз. на сумму ${detail.total.toLocaleString('ru-RU')} ₽. Ожидает подтверждения.`,
        detail.id,
      );
      await this.notifications.notifyUser(
        user,
        `Заказ ${detail.number} принят`,
        `НСРЗ: заказ ${detail.number} принят и ожидает подтверждения. Статус — в приложении.`,
        detail.id,
      );
    }
    return { ...detail, duplicate: result.duplicate };
  }

  async listForOwner(user: AuthUser, status?: string, page = 1) {
    if (!user.companyId) return { items: [], total: 0, page, pageSize: 20 };
    return this.list({ companyId: user.companyId, ...this.statusFilter(status) }, page, 'desc');
  }

  async listForStaff(status = 'PENDING', q?: string, page = 1) {
    const where: Prisma.OrderWhereInput = { ...this.statusFilter(status) };
    const query = q?.trim();
    if (query) {
      const digits = query.replace(/\D/g, '');
      const text = escapeLike(query);
      where.OR = [
        { company: { name: { contains: text, mode: 'insensitive' } } },
        { vessel: { name: { contains: text, mode: 'insensitive' } } },
        ...(digits ? [{ number: { contains: digits } }] : []),
      ];
    }
    const [list, counts] = await Promise.all([
      // очередь — сначала самые старые
      this.list(where, page, status === 'PENDING' ? 'asc' : 'desc'),
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const byStatus = Object.fromEntries(Object.values(OrderStatus).map((s) => [s, 0])) as Record<OrderStatus, number>;
    for (const c of counts) byStatus[c.status] = c._count._all;
    return { ...list, counts: byStatus };
  }

  async detail(id: number, viewer: AuthUser) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: detailInclude });
    // чужой заказ для судовладельца «не существует» — данные компаний изолированы (ТЗ п. 4.3)
    if (!order || (viewer.role === Role.OWNER && order.companyId !== viewer.companyId)) {
      throw new NotFoundException('Заказ не найден');
    }
    return this.mapDetail(order, viewer.role !== Role.OWNER);
  }

  /** Смена статуса сотрудником НСРЗ. Резерв снимается при отклонении и списывается со склада при завершении. */
  async changeStatus(id: number, input: ChangeStatusInput, staff: AuthUser) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true, user: true } });
    if (!order) throw new NotFoundException('Заказ не найден');

    // Второй сотрудник нажал ту же кнопку по устаревшей очереди: заказ уже в этом статусе или дальше.
    // Это не ошибка ввода, а одновременная работа — отвечаем так же, как при гонке ниже (409).
    const step = (s: OrderStatus) => STATUS_STEPS.indexOf(s);
    const alreadyThere =
      order.status === input.status || (input.status !== OrderStatus.REJECTED && step(order.status) > step(input.status));
    if (alreadyThere && !STATUS_TRANSITIONS[order.status].includes(input.status)) {
      throw conflict(
        `Заказ уже в статусе «${STATUS_TITLES[order.status]}» — его изменил другой сотрудник. Обновите страницу.`,
        { code: 'STATUS_CHANGED', status: order.status },
      );
    }
    if (!STATUS_TRANSITIONS[order.status].includes(input.status)) {
      throw new BadRequestException(
        `Нельзя перевести заказ из статуса «${STATUS_TITLES[order.status]}» в «${STATUS_TITLES[input.status]}»`,
      );
    }
    const reason = input.reason?.trim();
    if (input.status === OrderStatus.REJECTED && (!reason || reason.length < 3)) {
      throw new BadRequestException('Укажите причину отклонения — её увидит заказчик');
    }

    await this.prisma.$transaction(async (tx) => {
      // условное обновление: если двое сотрудников нажали одновременно, второй получит понятную ошибку
      const updated = await tx.order.updateMany({
        where: { id, status: order.status },
        data: { status: input.status, ...(input.status === OrderStatus.REJECTED ? { rejectReason: reason } : {}) },
      });
      if (updated.count === 0) throw conflict('Статус заказа уже изменил другой сотрудник. Обновите страницу.');

      for (const item of order.items.filter((i) => i.reserved)) {
        if (input.status === OrderStatus.REJECTED) {
          await tx.$executeRaw`
            UPDATE stock SET reserved = GREATEST(reserved - ${item.quantity}::int, 0)
            WHERE part_id = ${item.partId}::int`;
        } else if (input.status === OrderStatus.COMPLETED) {
          await tx.$executeRaw`
            UPDATE stock SET quantity = GREATEST(quantity - ${item.quantity}::int, 0),
                             reserved = GREATEST(reserved - ${item.quantity}::int, 0)
            WHERE part_id = ${item.partId}::int`;
        }
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          status: input.status,
          changedById: staff.id,
          comment: input.status === OrderStatus.REJECTED ? reason : input.comment?.trim() || null,
        },
      });
    });

    const text =
      input.status === OrderStatus.REJECTED
        ? `НСРЗ: заказ ${order.number} отклонён. Причина: ${reason}.`
        : `НСРЗ: заказ ${order.number} — статус «${STATUS_TITLES[input.status]}».`;
    await this.notifications.notifyUser(order.user, `Заказ ${order.number}: ${STATUS_TITLES[input.status]}`, text, id);

    return this.detail(id, staff);
  }

  /** Экспорт детализации заказа (ТЗ п. 4.1.2 Г) — CSV для Excel. */
  async exportCsv(id: number, viewer: AuthUser) {
    const d = await this.detail(id, viewer);
    const fmt = (iso: string | null) =>
      iso
        ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }).format(
            new Date(iso),
          )
        : '';
    const row = (...cells: unknown[]) => cells.map(csvCell).join(';');
    const num = (v: number) => v.toFixed(2).replace('.', ',');

    const lines = [
      row('Заказ', d.number),
      row('Дата оформления', fmt(d.createdAt)),
      row('Статус', d.statusTitle),
      ...(d.rejectReason ? [row('Причина отклонения', d.rejectReason)] : []),
      row('Компания', d.company.name),
      row('Судно', `${d.vessel.name}${d.vessel.imoNumber ? ' (' + d.vessel.imoNumber + ')' : ''}`),
      row('Доставка', d.deliveryTitle),
      row('Оформил', d.createdBy.fullName),
      ...(d.comment ? [row('Комментарий', d.comment)] : []),
      '',
      row('№', 'Наименование', 'Каталожный номер', 'Номер производителя', 'Кол-во', 'Ед.', 'Цена, ₽', 'Сумма, ₽'),
      ...d.items.map((i, n) =>
        row(n + 1, i.name, i.catalogNumber, i.manufacturerPartNumber ?? '', i.quantity, i.unit, num(i.price), num(i.lineTotal)),
      ),
      row('', '', '', '', '', '', 'Итого', num(d.total)),
      '',
      row('История статусов'),
      row('Статус', 'Дата и время (МСК)', 'Комментарий'),
      ...d.history.map((h) => row(h.title, fmt(h.at), h.comment ?? '')),
    ];
    return { fileName: `${d.number}.csv`, content: '﻿' + lines.join('\r\n') };
  }

  private statusFilter(status?: string): Prisma.OrderWhereInput {
    if (!status || status === 'ALL') return {};
    if (status === 'ACTIVE') return { status: { in: ACTIVE_STATUSES } };
    if ((Object.values(OrderStatus) as string[]).includes(status)) return { status: status as OrderStatus };
    throw new BadRequestException('Неизвестный статус');
  }

  private async list(where: Prisma.OrderWhereInput, page: number, direction: 'asc' | 'desc') {
    const pageSize = 20;
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: summaryInclude,
        orderBy: [{ createdAt: direction }, { id: direction }],
        skip: (Math.max(1, page) - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map((r) => this.mapSummary(r)), total, page, pageSize };
  }

  private mapSummary(o: OrderSummaryRow) {
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      statusTitle: STATUS_TITLES[o.status],
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      total: money(o.total),
      vessel: { id: o.vessel.id, name: o.vessel.name },
      company: { id: o.company.id, name: o.company.name },
      createdBy: { fullName: o.user.fullName },
      itemsCount: o.items.length,
      totalQuantity: o.items.reduce((s, i) => s + i.quantity, 0),
      preview: o.items.slice(0, 3).map((i) => i.part.name),
      rejectReason: o.rejectReason,
    };
  }

  private mapDetail(o: OrderDetailRow, forStaff: boolean) {
    const items = o.items.map((i) => ({
      partId: i.partId,
      name: i.part.name,
      catalogNumber: i.part.catalogNumber,
      manufacturerPartNumber: i.part.manufacturerPartNumber,
      imageUrl: i.part.imageUrl,
      unit: i.part.unit,
      quantity: i.quantity,
      price: money(i.price),
      lineTotal: money(i.price.mul(i.quantity)),
      reserved: i.reserved,
      ...(forStaff ? { stock: stockView(i.part.stock) } : {}),
    }));
    const history = o.statusHistory.map((h) => ({
      status: h.status,
      title: STATUS_TITLES[h.status],
      at: h.changedAt.toISOString(),
      comment: h.comment,
      by: h.changedBy ? (forStaff || h.changedBy.role === Role.OWNER ? h.changedBy.fullName : 'НСРЗ') : null,
    }));
    const rejected = o.status === OrderStatus.REJECTED;
    const timeline = STATUS_STEPS.map((step) => {
      const h = [...history].reverse().find((x) => x.status === step);
      return { status: step, title: STATUS_TITLES[step], done: !!h, current: o.status === step, at: h?.at ?? null };
    });
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      statusTitle: STATUS_TITLES[o.status],
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      deliveryMethod: o.deliveryMethod,
      deliveryTitle: DELIVERY_METHODS.find((d) => d.code === o.deliveryMethod)?.title ?? o.deliveryMethod,
      comment: o.comment,
      rejectReason: o.rejectReason,
      rejectedAt: rejected ? (history.filter((h) => h.status === OrderStatus.REJECTED).pop()?.at ?? null) : null,
      total: money(o.total),
      vessel: { id: o.vessel.id, name: o.vessel.name, imoNumber: o.vessel.imoNumber, vesselType: o.vessel.vesselType.name },
      company: { id: o.company.id, name: o.company.name, inn: o.company.inn, contactPhone: formatPhone(o.company.contactPhone) },
      createdBy: { fullName: o.user.fullName, phone: formatPhone(o.user.phone), email: o.user.email },
      items,
      itemsCount: items.length,
      totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
      timeline,
      history,
      allowedTransitions: forStaff ? STATUS_TRANSITIONS[o.status] : [],
    };
  }
}
