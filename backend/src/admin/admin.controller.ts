import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { Roles } from '../common/auth.decorators';
import { STAFF_ROLES } from '../common/domain';
import { formatPhone, normalizeLogin } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';

class CreateUserDto {
  @ApiProperty() @IsString() @Length(3, 120) fullName: string;
  @ApiProperty({ enum: Role }) @IsEnum(Role) role: Role;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() companyId?: string;
}

class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ enum: Role }) @IsOptional() @IsEnum(Role) role?: Role;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 120) fullName?: string;
}

class CreateCompanyDto {
  @ApiProperty() @IsString() @Length(2, 200) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(10, 12) inn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) contactPhone?: string;
}

class CreateVesselDto {
  @ApiProperty() @IsUUID() companyId: string;
  @ApiProperty() @IsInt() vesselTypeId: number;
  @ApiProperty() @IsString() @Length(2, 120) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) imoNumber?: string;
}

class NameDto {
  @ApiProperty() @IsString() @Length(2, 120) name: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() parentId?: number;
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async users() {
    const users = await this.prisma.user.findMany({ include: { company: true }, orderBy: [{ role: 'asc' }, { fullName: 'asc' }] });
    return users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      role: u.role,
      phone: formatPhone(u.phone),
      email: u.email,
      company: u.company ? { id: u.company.id, name: u.company.name } : null,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  async createUser(dto: CreateUserDto) {
    const phone = dto.phone?.trim() ? normalizeLogin(dto.phone).value : null;
    const email = dto.email?.trim() ? normalizeLogin(dto.email).value : null;
    if (phone && !phone.startsWith('+')) throw new BadRequestException('Проверьте номер телефона');
    if (!phone && !email) throw new BadRequestException('Нужен телефон или почта — по ним пользователь входит');
    if (dto.role === Role.OWNER && !dto.companyId) throw new BadRequestException('Судовладельцу нужна компания');
    const user = await this.prisma.user.create({
      data: { fullName: dto.fullName.trim(), role: dto.role, phone, email, companyId: dto.role === Role.OWNER ? dto.companyId : null },
    });
    return { id: user.id };
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    await this.prisma.user.update({ where: { id }, data: dto });
    if (dto.isActive === false) {
      await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return { ok: true };
  }

  async companies() {
    const rows = await this.prisma.company.findMany({
      include: { vessels: { include: { vesselType: true }, orderBy: { name: 'asc' } }, _count: { select: { users: true, orders: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      inn: c.inn,
      contactPhone: formatPhone(c.contactPhone),
      usersCount: c._count.users,
      ordersCount: c._count.orders,
      vessels: c.vessels.map((v) => ({ id: v.id, name: v.name, imoNumber: v.imoNumber, vesselType: v.vesselType.name })),
    }));
  }

  async notifications(take: number) {
    const rows = await this.prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take, include: { order: true } });
    return rows.map((n) => ({
      id: n.id,
      channel: n.channel,
      recipient: n.channel === 'SMS' ? formatPhone(n.recipient) : n.recipient,
      subject: n.subject,
      // коды входа в журнале панели не показываем
      body: n.body.replace(/(Код входа[^:]*: )\d{4,6}/, '$1••••'),
      status: n.status,
      provider: n.provider,
      error: n.error,
      orderNumber: n.order?.number ?? null,
      at: n.createdAt.toISOString(),
    }));
  }
}

@ApiTags('Администрирование')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly prisma: PrismaService) {}

  @Roles(...STAFF_ROLES)
  @Get('users')
  users() {
    return this.admin.users();
  }

  @Roles(Role.ADMIN)
  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.admin.createUser(dto);
  }

  @Roles(Role.ADMIN)
  @Patch('users/:id')
  updateUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.admin.updateUser(id, dto);
  }

  @Roles(...STAFF_ROLES)
  @Get('companies')
  companies() {
    return this.admin.companies();
  }

  @Roles(Role.ADMIN)
  @Post('companies')
  async createCompany(@Body() dto: CreateCompanyDto) {
    const c = await this.prisma.company.create({ data: { name: dto.name.trim(), inn: dto.inn || null, contactPhone: dto.contactPhone || null } });
    return { id: c.id };
  }

  @Roles(Role.ADMIN)
  @Post('vessels')
  async createVessel(@Body() dto: CreateVesselDto) {
    const v = await this.prisma.vessel.create({ data: { ...dto, imoNumber: dto.imoNumber || null } });
    return { id: v.id };
  }

  @Roles(Role.ADMIN)
  @Post('vessel-types')
  async createVesselType(@Body() dto: NameDto) {
    const v = await this.prisma.vesselType.create({ data: { name: dto.name.trim() } });
    return { id: v.id };
  }

  @Roles(Role.ADMIN)
  @Post('categories')
  async createCategory(@Body() dto: NameDto) {
    const c = await this.prisma.partCategory.create({ data: { name: dto.name.trim(), parentId: dto.parentId ?? null } });
    return { id: c.id };
  }

  @Roles(...STAFF_ROLES)
  @Get('notifications')
  notifications(@Query('take') take?: string) {
    return this.admin.notifications(Math.min(200, Math.max(1, Number(take) || 50)));
  }
}

@Module({
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
