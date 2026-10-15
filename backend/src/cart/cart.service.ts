import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { stockView } from '../common/domain';
import { mapPart, partInclude, PartWithRelations } from '../catalog/catalog.service';
import { PrismaService } from '../prisma/prisma.service';

/** Сообщение, почему нельзя взять столько, сколько просят. null — можно. */
export function quantityProblem(part: PartWithRelations, quantity: number): string | null {
  const s = stockView(part.stock);
  if (!s.orderable) {
    return s.allReserved
      ? `«${part.name}»: всё, что есть на складе, уже в резерве по другим заказам`
      : `«${part.name}»: нет на складе`;
  }
  if (quantity > s.maxOrder) {
    return s.availability === 'ON_ORDER'
      ? `«${part.name}»: под заказ можно оформить не больше ${s.maxOrder} ${part.unit}`
      : `«${part.name}»: доступно только ${s.maxOrder} ${part.unit}` +
          (s.reserved > 0 ? ` — ещё ${s.reserved} ${part.unit} в резерве по другим заказам` : '');
  }
  return null;
}

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const rows = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { part: { include: partInclude } },
      orderBy: { createdAt: 'asc' },
    });
    const items = rows.map((r) => {
      const part = mapPart(r.part);
      return {
        part,
        quantity: r.quantity,
        lineTotal: Math.round(part.price * r.quantity * 100) / 100,
        // остаток мог измениться, пока позиция лежала в корзине
        problem: quantityProblem(r.part, r.quantity),
      };
    });
    return {
      items,
      count: items.reduce((s, i) => s + i.quantity, 0),
      positions: items.length,
      total: Math.round(items.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100,
      hasProblems: items.some((i) => i.problem),
    };
  }

  /** Добавить в корзину. Повторное добавление той же запчасти увеличивает количество, а не создаёт вторую строку. */
  async add(userId: string, partId: number, quantity: number) {
    const part = await this.findPart(partId);
    const existing = await this.prisma.cartItem.findUnique({ where: { userId_partId: { userId, partId } } });
    const next = (existing?.quantity ?? 0) + quantity;
    const problem = quantityProblem(part, next);
    if (problem) throw new ConflictException(existing ? `${problem}. В корзине уже ${existing.quantity} ${part.unit}.` : problem);

    await this.prisma.cartItem.upsert({
      where: { userId_partId: { userId, partId } },
      create: { userId, partId, quantity: next },
      update: { quantity: next },
    });
    return this.get(userId);
  }

  async setQuantity(userId: string, partId: number, quantity: number) {
    const part = await this.findPart(partId);
    const problem = quantityProblem(part, quantity);
    if (problem) throw new ConflictException(problem);
    await this.prisma.cartItem.upsert({
      where: { userId_partId: { userId, partId } },
      create: { userId, partId, quantity },
      update: { quantity },
    });
    return this.get(userId);
  }

  async remove(userId: string, partId: number) {
    await this.prisma.cartItem.deleteMany({ where: { userId, partId } });
    return this.get(userId);
  }

  /**
   * «Повторить заказ»: кладёт позиции прошлого заказа в корзину.
   * Резерв соблюдается — если свободно меньше, добавляется сколько есть, остальное возвращается в skipped.
   */
  async repeatOrder(user: { id: string; companyId: string | null }, orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { part: { include: partInclude } }, orderBy: { id: 'asc' } } },
    });
    if (!order || order.companyId !== user.companyId) throw new NotFoundException('Заказ не найден');

    const inCart = new Map(
      (await this.prisma.cartItem.findMany({ where: { userId: user.id } })).map((c) => [c.partId, c.quantity]),
    );
    const added: { partId: number; name: string; quantity: number }[] = [];
    const skipped: { partId: number; name: string; requested: number; added: number; reason: string }[] = [];

    for (const item of order.items) {
      const view = stockView(item.part.stock);
      const already = inCart.get(item.partId) ?? 0;
      const room = Math.max(0, view.maxOrder - already);
      const qty = Math.min(item.quantity, room);
      if (qty > 0) {
        await this.prisma.cartItem.upsert({
          where: { userId_partId: { userId: user.id, partId: item.partId } },
          create: { userId: user.id, partId: item.partId, quantity: already + qty },
          update: { quantity: already + qty },
        });
        added.push({ partId: item.partId, name: item.part.name, quantity: qty });
      }
      if (qty < item.quantity) {
        skipped.push({
          partId: item.partId,
          name: item.part.name,
          requested: item.quantity,
          added: qty,
          reason: !view.orderable
            ? view.allReserved
              ? 'всё в резерве по другим заказам'
              : 'нет на складе'
            : `доступно только ${view.maxOrder} ${item.part.unit}`,
        });
      }
    }
    return { cart: await this.get(user.id), added, skipped };
  }

  async clear(userId: string) {
    await this.prisma.cartItem.deleteMany({ where: { userId } });
    return this.get(userId);
  }

  private async findPart(partId: number) {
    const part = await this.prisma.part.findUnique({ where: { id: partId }, include: partInclude });
    if (!part) throw new NotFoundException('Запчасть не найдена');
    return part;
  }
}
