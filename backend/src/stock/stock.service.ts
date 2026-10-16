import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Availability } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { AuthUser } from '../common/auth.decorators';
import { csvCell, numberKey } from '../common/text';
import { mapPart, partInclude, PartQuery, partWhere } from '../catalog/catalog.service';
import { PrismaService } from '../prisma/prisma.service';

export interface StockUpdateInput {
  quantity?: number;
  availability?: Availability;
}

const AVAILABILITY_WORDS: Record<string, Availability> = {
  'в наличии': Availability.IN_STOCK,
  'есть': Availability.IN_STOCK,
  in_stock: Availability.IN_STOCK,
  'под заказ': Availability.ON_ORDER,
  on_order: Availability.ON_ORDER,
  'нет на складе': Availability.OUT_OF_STOCK,
  'нет': Availability.OUT_OF_STOCK,
  out_of_stock: Availability.OUT_OF_STOCK,
};

const COLUMN_ALIASES = {
  number: ['catalog_number', 'каталожный номер', 'артикул', 'номер', 'catalog number'],
  quantity: ['quantity', 'количество', 'остаток', 'кол-во', 'qty'],
  availability: ['availability', 'статус', 'наличие'],
};

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PartQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const where = partWhere(this.prisma, query);
    const [total, parts, imports] = await Promise.all([
      this.prisma.part.count({ where }),
      this.prisma.part.findMany({
        where,
        include: { ...partInclude, stock: { include: { updatedBy: true } } },
        orderBy: [{ catalogNumber: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stockImport.findFirst({ orderBy: { createdAt: 'desc' }, include: { importedBy: true } }),
    ]);
    return {
      items: parts.map((p) => ({ ...mapPart(p), updatedBy: p.stock?.updatedBy?.fullName ?? null })),
      total,
      page,
      pageSize,
      lastImport: imports
        ? { fileName: imports.fileName, at: imports.createdAt.toISOString(), by: imports.importedBy.fullName }
        : null,
    };
  }

  /** Ручное обновление остатка (сценарий 3 ТЗ). Судовладелец видит новое значение при следующем запросе. */
  async update(partId: number, input: StockUpdateInput, user: AuthUser) {
    if (input.quantity === undefined && input.availability === undefined) {
      throw new BadRequestException('Нечего сохранять');
    }
    const part = await this.prisma.part.findUnique({ where: { id: partId }, include: { stock: true } });
    if (!part) throw new NotFoundException('Запчасть не найдена');

    const stock = await this.prisma.stock.upsert({
      where: { partId },
      create: {
        partId,
        quantity: input.quantity ?? 0,
        availability: input.availability ?? Availability.IN_STOCK,
        updatedById: user.id,
        updatedAt: new Date(),
      },
      update: {
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.availability ? { availability: input.availability } : {}),
        updatedById: user.id,
        updatedAt: new Date(),
      },
    });
    const full = await this.prisma.part.findUniqueOrThrow({ where: { id: partId }, include: partInclude });
    const warning =
      stock.quantity < stock.reserved
        ? `На складе ${stock.quantity} ${part.unit}, а в активных заказах зарезервировано ${stock.reserved}. Проверьте заказы в очереди.`
        : null;
    return { ...mapPart(full), updatedBy: user.fullName, warning };
  }

  /** Загрузка остатков из CSV или Excel (1-й этап интеграции со складом, ТЗ п. 4.6). */
  async import(file: Express.Multer.File | undefined, user: AuthUser) {
    if (!file) throw new BadRequestException('Выберите файл CSV или Excel');
    const name = file.originalname ? Buffer.from(file.originalname, 'latin1').toString('utf8') : 'файл';
    const rows = await this.readRows(file, name);
    if (rows.length < 2) throw new BadRequestException('В файле нет строк с данными');

    const header = rows[0].map((h) => String(h ?? '').trim().toLowerCase());
    const col = (aliases: string[]) => header.findIndex((h) => aliases.includes(h));
    const numberCol = col(COLUMN_ALIASES.number);
    const qtyCol = col(COLUMN_ALIASES.quantity);
    const availCol = col(COLUMN_ALIASES.availability);
    if (numberCol < 0 || qtyCol < 0) {
      throw new BadRequestException('Нужны столбцы «каталожный номер» и «количество». Скачайте шаблон в панели.');
    }

    const parts = await this.prisma.part.findMany({
      select: { id: true, catalogNumber: true, name: true, unit: true, stock: { select: { reserved: true } } },
    });
    const byKey = new Map(parts.map((p) => [numberKey(p.catalogNumber), p.id]));
    const byId = new Map(parts.map((p) => [p.id, p]));

    const errors: { row: number; message: string }[] = [];
    const updates: { partId: number; quantity: number; availability?: Availability }[] = [];
    const seen = new Set<number>();

    rows.slice(1).forEach((r, i) => {
      const rowNo = i + 2;
      const raw = String(r[numberCol] ?? '').trim();
      if (!raw && r.every((c) => String(c ?? '').trim() === '')) return; // пустая строка
      const partId = byKey.get(numberKey(raw));
      if (!partId) return errors.push({ row: rowNo, message: `Номер «${raw}» не найден в каталоге` });
      if (seen.has(partId)) return errors.push({ row: rowNo, message: `Номер «${raw}» повторяется в файле` });
      const qty = Number(String(r[qtyCol] ?? '').replace(',', '.').trim());
      if (!Number.isInteger(qty) || qty < 0 || qty > 1_000_000) {
        return errors.push({ row: rowNo, message: `Количество «${r[qtyCol] ?? ''}» — нужно целое число от 0` });
      }
      let availability: Availability | undefined;
      if (availCol >= 0 && String(r[availCol] ?? '').trim()) {
        availability = AVAILABILITY_WORDS[String(r[availCol]).trim().toLowerCase()];
        if (!availability) {
          return errors.push({ row: rowNo, message: `Статус «${r[availCol]}» — укажите «в наличии», «под заказ» или «нет на складе»` });
        }
      }
      seen.add(partId);
      updates.push({ partId, quantity: qty, availability });
    });

    const now = new Date();
    await this.prisma.$transaction([
      ...updates.map((u) =>
        this.prisma.stock.upsert({
          where: { partId: u.partId },
          create: { partId: u.partId, quantity: u.quantity, availability: u.availability ?? Availability.IN_STOCK, updatedAt: now, updatedById: user.id },
          update: { quantity: u.quantity, ...(u.availability ? { availability: u.availability } : {}), updatedAt: now, updatedById: user.id },
        }),
      ),
      this.prisma.stockImport.create({
        data: {
          fileName: name,
          importedById: user.id,
          rowsTotal: updates.length + errors.length,
          rowsFailed: errors.length,
          errors: errors.slice(0, 100),
        },
      }),
    ]);

    // как при ручном изменении: склад должен увидеть, что остатка не хватает на уже принятые заказы
    const warnings = updates
      .map((u) => ({ u, p: byId.get(u.partId)! }))
      .filter(({ u, p }) => (p.stock?.reserved ?? 0) > u.quantity)
      .map(({ u, p }) => `«${p.name}» (${p.catalogNumber}): на складе ${u.quantity} ${p.unit}, а в активных заказах зарезервировано ${p.stock!.reserved}. Проверьте заказы в очереди.`);

    return {
      fileName: name,
      rowsTotal: updates.length + errors.length,
      rowsUpdated: updates.length,
      rowsFailed: errors.length,
      errors: errors.slice(0, 50),
      warnings: warnings.slice(0, 50),
    };
  }

  async imports() {
    const rows = await this.prisma.stockImport.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { importedBy: true } });
    return rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      by: r.importedBy.fullName,
      at: r.createdAt.toISOString(),
      rowsTotal: r.rowsTotal,
      rowsFailed: r.rowsFailed,
    }));
  }

  async template() {
    const parts = await this.prisma.part.findMany({ include: { stock: true }, orderBy: { catalogNumber: 'asc' } });
    const titles: Record<Availability, string> = { IN_STOCK: 'в наличии', ON_ORDER: 'под заказ', OUT_OF_STOCK: 'нет на складе' };
    const lines = [
      'каталожный номер;наименование;количество;статус',
      ...parts.map((p) =>
        [p.catalogNumber, p.name, p.stock?.quantity ?? 0, titles[p.stock?.availability ?? 'OUT_OF_STOCK']].map(csvCell).join(';'),
      ),
    ];
    return '﻿' + lines.join('\r\n');
  }

  private async readRows(file: Express.Multer.File, name: string): Promise<unknown[][]> {
    const lower = name.toLowerCase();
    if (lower.endsWith('.xlsx')) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(file.buffer as any);
      const ws = wb.worksheets[0];
      if (!ws) return [];
      const rows: unknown[][] = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        const values = (row.values as unknown[]).slice(1).map((v: any) => (v && typeof v === 'object' && 'result' in v ? v.result : v?.text ?? v));
        rows.push(values);
      });
      return rows;
    }
    if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
      let text = file.buffer.toString('utf8');
      if (text.includes('�')) text = new TextDecoder('windows-1251').decode(file.buffer); // Excel часто сохраняет CSV в 1251
      text = text.replace(/^﻿/, '');
      const firstLine = text.split(/\r?\n/)[0] ?? '';
      const delimiter = firstLine.split(';').length >= firstLine.split(',').length ? ';' : ',';
      return parse(text, { delimiter, relax_column_count: true, skip_empty_lines: true, trim: true });
    }
    throw new BadRequestException('Поддерживаются файлы .csv и .xlsx');
  }
}
