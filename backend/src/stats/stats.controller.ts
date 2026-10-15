import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Availability, OrderStatus } from '@prisma/client';
import { ACTIVE_STATUSES, STATUS_TITLES } from '../common/domain';
import { Roles } from '../common/auth.decorators';
import { STAFF_ROLES } from '../common/domain';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 24 * 3600 * 1000;
const moscowDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(days: number) {
    const now = new Date();
    const since = new Date(now.getTime() - (days - 1) * DAY - 3 * 3600 * 1000);
    const month = new Date(now.getTime() - 30 * DAY);

    const [recent, byStatusRaw, confirmations, topRaw, inStock, completedSum] = await Promise.all([
      this.prisma.order.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, status: true, total: true } }),
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.orderStatusHistory.findMany({
        where: { status: OrderStatus.CONFIRMED, changedAt: { gte: month } },
        select: { changedAt: true, order: { select: { createdAt: true } } },
      }),
      this.prisma.orderItem.groupBy({
        by: ['partId'],
        where: { order: { createdAt: { gte: month }, status: { not: OrderStatus.REJECTED } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
      this.prisma.stock.findMany({ where: { availability: Availability.IN_STOCK }, include: { part: true } }),
      this.prisma.order.aggregate({ where: { status: OrderStatus.COMPLETED, createdAt: { gte: month } }, _sum: { total: true } }),
    ]);

    const byDayMap = new Map<string, { date: string; count: number; total: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const date = moscowDate(new Date(now.getTime() - i * DAY));
      byDayMap.set(date, { date, count: 0, total: 0 });
    }
    for (const o of recent) {
      const slot = byDayMap.get(moscowDate(o.createdAt));
      if (slot) {
        slot.count++;
        slot.total += Number(o.total);
      }
    }

    const byStatus = Object.values(OrderStatus).map((s) => ({
      status: s,
      title: STATUS_TITLES[s],
      count: byStatusRaw.find((b) => b.status === s)?._count._all ?? 0,
    }));
    const count = (pred: (s: OrderStatus) => boolean) => byStatus.filter((b) => pred(b.status)).reduce((a, b) => a + b.count, 0);

    const minutes = confirmations.map((c) => (c.changedAt.getTime() - c.order.createdAt.getTime()) / 60000);
    const parts = await this.prisma.part.findMany({ where: { id: { in: topRaw.map((t) => t.partId) } } });

    return {
      totals: {
        all: count(() => true),
        pending: count((s) => s === OrderStatus.PENDING),
        active: count((s) => ACTIVE_STATUSES.includes(s)),
        completed: count((s) => s === OrderStatus.COMPLETED),
        rejected: count((s) => s === OrderStatus.REJECTED),
      },
      // ТЗ п. 6: цикл «поиск — подтверждение» — не более 4 часов в рабочее время
      avgConfirmMinutes: minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null,
      confirmedWithin4h: minutes.length ? Math.round((minutes.filter((m) => m <= 240).length / minutes.length) * 100) : null,
      completedTotal30d: Math.round(Number(completedSum._sum.total ?? 0)),
      byDay: [...byDayMap.values()].map((d) => ({ ...d, total: Math.round(d.total) })),
      byStatus,
      topParts: topRaw.map((t) => {
        const p = parts.find((x) => x.id === t.partId);
        return { partId: t.partId, name: p?.name ?? '—', catalogNumber: p?.catalogNumber ?? '', quantity: t._sum.quantity ?? 0 };
      }),
      lowStock: inStock
        .map((s) => ({ partId: s.partId, name: s.part.name, catalogNumber: s.part.catalogNumber, available: Math.max(0, s.quantity - s.reserved), reserved: s.reserved }))
        .filter((s) => s.available <= 2)
        .sort((a, b) => a.available - b.available)
        .slice(0, 8),
    };
  }
}

@ApiTags('Панель НСРЗ: статистика')
@ApiBearerAuth()
@Roles(...STAFF_ROLES)
@Controller('panel/stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  @ApiQuery({ name: 'days', required: false })
  get(@Query('days') days?: string) {
    const n = Math.min(60, Math.max(7, Number(days) || 14));
    return this.stats.stats(n);
  }
}

@Module({
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
