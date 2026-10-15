import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DeliveryMethod, OrderStatus, Role } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, MaxLength, Min } from 'class-validator';
import type { Response } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { STAFF_ROLES } from '../common/domain';
import { OrdersService } from './orders.service';

class CreateOrderDto {
  @ApiProperty({ description: 'Судно компании заказчика' })
  @IsUUID('all', { message: 'Выберите судно' })
  vesselId: string;

  @ApiProperty({ enum: DeliveryMethod })
  @IsEnum(DeliveryMethod, { message: 'Выберите способ доставки' })
  deliveryMethod: DeliveryMethod;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @ApiPropertyOptional({ description: 'Ключ попытки оформления (UUID). Повтор с тем же ключом вернёт тот же заказ.' })
  @IsOptional()
  @IsString()
  @Length(8, 64)
  idempotencyKey?: string;
}

class ChangeStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional({ description: 'Причина отклонения (обязательна для REJECTED)' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  comment?: string;
}

class ListQueryDto {
  @ApiPropertyOptional({ description: 'PENDING / CONFIRMED / … / ACTIVE / ALL' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
}

function csvFile(res: Response, file: { fileName: string; content: string }) {
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="order.csv"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
  });
  return new StreamableFile(Buffer.from(file.content, 'utf8'));
}

@ApiTags('Заказы (судовладелец)')
@ApiBearerAuth()
@Roles(Role.OWNER)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const order = await this.orders.create(user, dto);
    res.status(order.duplicate ? 200 : 201);
    return order;
  }

  @Get()
  @ApiQuery({ name: 'status', required: false })
  list(@CurrentUser() user: AuthUser, @Query() q: ListQueryDto) {
    return this.orders.listForOwner(user, q.status, q.page);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.orders.detail(id, user);
  }

  @Get(':id/export.csv')
  async export(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    return csvFile(res, await this.orders.exportCsv(id, user));
  }
}

@ApiTags('Панель НСРЗ: заказы')
@ApiBearerAuth()
@Roles(...STAFF_ROLES)
@Controller('panel/orders')
export class PanelOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() q: ListQueryDto) {
    return this.orders.listForStaff(q.status ?? 'PENDING', q.q, q.page);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.orders.detail(id, user);
  }

  @Patch(':id/status')
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.orders.changeStatus(id, dto, user);
  }

  @Get(':id/export.csv')
  async export(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    return csvFile(res, await this.orders.exportCsv(id, user));
  }
}

@Module({
  controllers: [OrdersController, PanelOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
