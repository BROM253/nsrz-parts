import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Prisma, Role, SupportCategory, SupportStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { STAFF_ROLES } from '../common/domain';
import { formatPhone } from '../common/text';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/** Техподдержка (этап 7): обращения судовладельцев из приложения и сайта, ответы сотрудников НСРЗ в панели. */

export const CATEGORY_TITLES: Record<SupportCategory, string> = {
  QUESTION: 'Вопрос по работе',
  BUG: 'Ошибка в приложении',
  ORDER: 'Вопрос по заказу',
  IDEA: 'Предложение',
};
export const SUPPORT_STATUS_TITLES: Record<SupportStatus, string> = {
  NEW: 'Новое',
  IN_PROGRESS: 'В работе',
  RESOLVED: 'Решено',
};
export const ticketNumber = (id: number) => `ОБР-${String(id).padStart(6, '0')}`;

class CreateTicketDto {
  @ApiProperty({ enum: SupportCategory })
  @IsEnum(SupportCategory, { message: 'Выберите тему обращения' })
  category: SupportCategory;

  @ApiProperty({ minLength: 5, maxLength: 2000 })
  @IsString()
  @Length(5, 2000, { message: 'Опишите вопрос — от 5 до 2000 символов' })
  message: string;

  @ApiPropertyOptional({ description: 'Заказ, к которому относится вопрос' })
  @IsOptional()
  @IsInt()
  orderId?: number;

  @ApiPropertyOptional({ description: 'android / iphone / web' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  platform?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  appVersion?: string;
}

class AnswerTicketDto {
  @ApiPropertyOptional({ enum: SupportStatus })
  @IsOptional()
  @IsEnum(SupportStatus)
  status?: SupportStatus;

  @ApiPropertyOptional({ description: 'Ответ заказчику — придёт ему по SMS или почте' })
  @IsOptional()
  @IsString()
  @Length(2, 2000)
  reply?: string;
}

class TicketListQuery {
  @ApiPropertyOptional({ description: 'NEW / IN_PROGRESS / RESOLVED / OPEN / ALL' })
  @IsOptional()
  @IsString()
  status?: string;
}

const include = { user: true, repliedBy: true, company: true, order: true } satisfies Prisma.SupportTicketInclude;
type TicketRow = Prisma.SupportTicketGetPayload<{ include: typeof include }>;

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  view(t: TicketRow, forStaff: boolean) {
    return {
      id: t.id,
      number: ticketNumber(t.id),
      category: t.category,
      categoryTitle: CATEGORY_TITLES[t.category],
      message: t.message,
      status: t.status,
      statusTitle: SUPPORT_STATUS_TITLES[t.status],
      reply: t.reply,
      repliedAt: t.repliedAt?.toISOString() ?? null,
      repliedBy: t.repliedBy ? (forStaff ? t.repliedBy.fullName : 'НСРЗ') : null,
      order: t.order ? { id: t.order.id, number: t.order.number } : null,
      platform: t.platform,
      appVersion: t.appVersion,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      ...(forStaff
        ? {
            user: { fullName: t.user.fullName, phone: formatPhone(t.user.phone), email: t.user.email },
            company: t.company ? { id: t.company.id, name: t.company.name } : null,
          }
        : {}),
    };
  }

  async create(user: AuthUser, dto: CreateTicketDto) {
    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
      // чужой заказ для судовладельца «не существует» — так же, как в истории заказов
      if (!order || order.companyId !== user.companyId) throw new BadRequestException('Заказ не найден');
    }
    const created = await this.prisma.supportTicket.create({
      data: {
        userId: user.id,
        companyId: user.companyId,
        orderId: dto.orderId ?? null,
        category: dto.category,
        message: dto.message.trim(),
        platform: dto.platform ?? null,
        appVersion: dto.appVersion ?? null,
      },
      include,
    });
    const view = this.view(created, false);
    await this.notifications.email(
      this.config.get('SUPPORT_EMAIL', this.config.get('SALES_EMAIL', 'prodazhi@nsrz.ru')),
      `Обращение ${view.number}: ${view.categoryTitle}`,
      `Новое обращение ${view.number} от ${created.user.fullName}${created.company ? `, ${created.company.name}` : ''}` +
        `${created.order ? ` по заказу ${created.order.number}` : ''}: «${view.message.slice(0, 300)}». Ответить — в панели НСРЗ, раздел «Обращения».`,
      created.orderId ?? undefined,
    );
    return view;
  }

  async listMine(user: AuthUser) {
    const rows = await this.prisma.supportTicket.findMany({ where: { userId: user.id }, include, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((r) => this.view(r, false));
  }

  async listForStaff(status = 'OPEN') {
    const where: Prisma.SupportTicketWhereInput =
      status === 'ALL' ? {} : status === 'OPEN' ? { status: { in: [SupportStatus.NEW, SupportStatus.IN_PROGRESS] } } : { status: this.statusOf(status) };
    const [rows, counts] = await Promise.all([
      // открытые — сначала самые старые, как очередь заказов
      this.prisma.supportTicket.findMany({ where, include, orderBy: { createdAt: status === 'OPEN' || status === 'NEW' ? 'asc' : 'desc' }, take: 100 }),
      this.prisma.supportTicket.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const byStatus = Object.fromEntries(Object.values(SupportStatus).map((s) => [s, 0])) as Record<SupportStatus, number>;
    for (const c of counts) byStatus[c.status] = c._count._all;
    return { items: rows.map((r) => this.view(r, true)), counts: byStatus };
  }

  async answer(id: number, dto: AnswerTicketDto, staff: AuthUser) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id }, include });
    if (!ticket) throw new NotFoundException('Обращение не найдено');
    if (!dto.reply && !dto.status) throw new BadRequestException('Нечего сохранять');
    const reply = dto.reply?.trim();
    const status = dto.status ?? (reply ? SupportStatus.RESOLVED : ticket.status);
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: { status, ...(reply ? { reply, repliedById: staff.id, repliedAt: new Date() } : {}) },
      include,
    });
    if (reply) {
      const number = ticketNumber(id);
      await this.notifications.notifyUser(
        ticket.user,
        `Ответ на обращение ${number}`,
        `НСРЗ, ответ на обращение ${number}: ${reply.slice(0, 300)}`,
        ticket.orderId ?? undefined,
      );
    }
    return this.view(updated, true);
  }

  private statusOf(s: string): SupportStatus {
    if ((Object.values(SupportStatus) as string[]).includes(s)) return s as SupportStatus;
    throw new BadRequestException('Неизвестный статус');
  }
}

@ApiTags('Поддержка (судовладелец)')
@ApiBearerAuth()
@Roles(Role.OWNER)
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.support.create(user, dto);
  }

  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.support.listMine(user);
  }
}

@ApiTags('Панель НСРЗ: обращения')
@ApiBearerAuth()
@Roles(...STAFF_ROLES)
@Controller('panel/support')
export class PanelSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(@Query() q: TicketListQuery) {
    return this.support.listForStaff(q.status ?? 'OPEN');
  }

  @Patch(':id')
  answer(@Param('id', ParseIntPipe) id: number, @Body() dto: AnswerTicketDto, @CurrentUser() staff: AuthUser) {
    return this.support.answer(id, dto, staff);
  }
}

@Module({
  controllers: [SupportController, PanelSupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
