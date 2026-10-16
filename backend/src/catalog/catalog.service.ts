import { Injectable, NotFoundException } from '@nestjs/common';
import { Availability, Prisma } from '@prisma/client';
import { DELIVERY_METHODS, REJECT_REASONS, STATUS_TITLES, stockView } from '../common/domain';
import { escapeLike, numberKey, searchText } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';

export const partInclude = {
  category: true,
  stock: true,
  vesselTypes: { include: { vesselType: true } },
} satisfies Prisma.PartInclude;

export type PartWithRelations = Prisma.PartGetPayload<{ include: typeof partInclude }>;

export function mapPart(p: PartWithRelations, withDescription = false) {
  return {
    id: p.id,
    name: p.name,
    ...(withDescription ? { description: p.description } : {}),
    catalogNumber: p.catalogNumber,
    manufacturerPartNumber: p.manufacturerPartNumber,
    category: { id: p.category.id, name: p.category.name, icon: p.category.icon },
    price: Number(p.price),
    unit: p.unit,
    leadTimeDays: p.leadTimeDays,
    imageUrl: p.imageUrl,
    vesselTypes: p.vesselTypes.map((v) => v.vesselType.name).sort(),
    stock: stockView(p.stock),
  };
}

export interface PartQuery {
  q?: string;
  vesselTypeId?: number;
  categoryId?: number;
  onlyAvailable?: boolean;
  availability?: Availability;
  page?: number;
  pageSize?: number;
}

/** Условия поиска (ТЗ п. 4.1.2 А): по наименованию, каталожному номеру, номеру производителя. */
export function partWhere(prisma: PrismaService, query: PartQuery): Prisma.PartWhereInput {
  const and: Prisma.PartWhereInput[] = [];
  const q = query.q?.trim();
  if (q) {
    const words = searchText(q).split(' ').filter(Boolean);
    const key = numberKey(q);
    const or: Prisma.PartWhereInput[] = [
      // каждое слово должно встретиться в наименовании или описании: «фильтр топливный»
      { AND: words.map((w) => ({ searchText: { contains: escapeLike(w) } })) },
    ];
    if (key.length >= 2) or.push({ searchKey: { contains: key } });
    and.push({ OR: or });
  }
  if (query.vesselTypeId) and.push({ vesselTypes: { some: { vesselTypeId: query.vesselTypeId } } });
  if (query.categoryId) and.push({ categoryId: query.categoryId });
  if (query.availability) and.push({ stock: { availability: query.availability } });
  if (query.onlyAvailable) {
    and.push({
      OR: [
        { stock: { availability: Availability.ON_ORDER } },
        { stock: { availability: Availability.IN_STOCK, quantity: { gt: prisma.stock.fields.reserved } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: PartQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20));
    const where = partWhere(this.prisma, query);

    const [total, parts, stockUpdatedAt] = await Promise.all([
      this.prisma.part.count({ where }),
      this.prisma.part.findMany({
        where,
        include: partInclude,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.stockUpdatedAt(),
    ]);

    // точное совпадение номера — первым
    const key = numberKey(query.q);
    const items = parts.map((p) => mapPart(p));
    if (key.length >= 3) {
      items.sort((a, b) => {
        const ea = numberKey(a.catalogNumber) === key || numberKey(a.manufacturerPartNumber) === key ? 0 : 1;
        const eb = numberKey(b.catalogNumber) === key || numberKey(b.manufacturerPartNumber) === key ? 0 : 1;
        return ea - eb;
      });
    }
    return { items, total, page, pageSize, stockUpdatedAt };
  }

  async part(id: number) {
    const part = await this.prisma.part.findUnique({ where: { id }, include: partInclude });
    if (!part) throw new NotFoundException('Запчасть не найдена');
    return { ...mapPart(part, true), stockUpdatedAt: await this.stockUpdatedAt() };
  }

  /** Время последнего обновления остатков — показываем везде, где виден остаток (ТЗ, риски). */
  async stockUpdatedAt(): Promise<string | null> {
    const agg = await this.prisma.stock.aggregate({ _max: { updatedAt: true } });
    return agg._max.updatedAt?.toISOString() ?? null;
  }

  async dictionaries() {
    const [vesselTypes, categories, stockUpdatedAt] = await Promise.all([
      this.prisma.vesselType.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.partCategory.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { parts: true } } } }),
      this.stockUpdatedAt(),
    ]);
    return {
      vesselTypes: vesselTypes.map((v) => ({ id: v.id, name: v.name })),
      categories: categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, parentId: c.parentId, partsCount: c._count.parts })),
      deliveryMethods: DELIVERY_METHODS,
      statuses: Object.entries(STATUS_TITLES).map(([code, title]) => ({ code, title })),
      rejectReasons: REJECT_REASONS,
      stockUpdatedAt,
    };
  }
}
