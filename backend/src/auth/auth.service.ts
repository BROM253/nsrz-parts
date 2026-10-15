import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { createHash, randomBytes, randomInt } from 'crypto';
import { formatPhone, maskLogin, normalizeLogin } from '../common/text';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const CODE_TTL_SEC = 5 * 60;
const RESEND_AFTER_SEC = 30;
const MAX_ATTEMPTS = 5;
const ACCESS_TTL_SEC = 60 * 60; // 1 час
const REFRESH_TTL_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  private get devCodes(): boolean {
    return this.config.get('AUTH_DEV_CODES') === 'true';
  }

  private hashCode(login: string, code: string): string {
    return createHash('sha256').update(`${login}:${code}:${this.config.get('JWT_SECRET')}`).digest('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Шаг 1: отправить одноразовый код по SMS или на почту. */
  async requestCode(rawLogin: string) {
    const { kind, value } = normalizeLogin(rawLogin);
    const user = await this.prisma.user.findUnique({ where: kind === 'phone' ? { phone: value } : { email: value } });
    if (!user || !user.isActive) {
      throw new NotFoundException('Пользователь не найден. Для подключения обратитесь в отдел продаж НСРЗ.');
    }

    const last = await this.prisma.authCode.findFirst({ where: { login: value }, orderBy: { createdAt: 'desc' } });
    if (last && process.env.NODE_ENV !== 'test') {
      const passed = (Date.now() - last.createdAt.getTime()) / 1000;
      if (passed < RESEND_AFTER_SEC) {
        throw new HttpException(
          { statusCode: 429, message: `Новый код можно запросить через ${Math.ceil(RESEND_AFTER_SEC - passed)} с` },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const code = String(randomInt(1000, 10000));
    // старые коды этого логина больше не действуют
    await this.prisma.authCode.updateMany({ where: { login: value, consumedAt: null }, data: { consumedAt: new Date() } });
    await this.prisma.authCode.create({
      data: { login: value, codeHash: this.hashCode(value, code), expiresAt: new Date(Date.now() + CODE_TTL_SEC * 1000) },
    });

    const text = `Код входа в «НСРЗ. Заказ запчастей»: ${code}. Никому его не сообщайте.`;
    if (kind === 'phone') await this.notifications.sms(value, text);
    else await this.notifications.email(value, 'Код входа — НСРЗ. Заказ запчастей', text);

    return {
      channel: kind === 'phone' ? 'sms' : 'email',
      sentTo: maskLogin(kind, value),
      expiresInSec: CODE_TTL_SEC,
      resendInSec: RESEND_AFTER_SEC,
      ...(this.devCodes ? { devCode: code } : {}),
    };
  }

  /** Шаг 2: проверить код и выдать токены. */
  async verify(rawLogin: string, code: string) {
    const { kind, value } = normalizeLogin(rawLogin);
    const record = await this.prisma.authCode.findFirst({
      where: { login: value, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new BadRequestException('Код устарел. Запросите новый.');
    if (record.attempts >= MAX_ATTEMPTS) {
      throw new HttpException({ statusCode: 429, message: 'Слишком много попыток. Запросите новый код.' }, 429);
    }
    if (record.codeHash !== this.hashCode(value, code.trim())) {
      await this.prisma.authCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      const left = MAX_ATTEMPTS - record.attempts - 1;
      throw new BadRequestException(left > 0 ? `Неверный код. Осталось попыток: ${left}` : 'Неверный код. Запросите новый.');
    }

    // Код одноразовый: помечаем использованным условно, чтобы два параллельных запроса не вошли дважды.
    const consumed = await this.prisma.authCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) throw new BadRequestException('Код уже использован. Запросите новый.');

    const user = await this.prisma.user.findUnique({ where: kind === 'phone' ? { phone: value } : { email: value } });
    if (!user || !user.isActive) throw new UnauthorizedException('Доступ отключён');
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!record || record.revokedAt || record.expiresAt < new Date() || !record.user.isActive) {
      throw new UnauthorizedException('Сессия истекла, войдите снова');
    }
    // Ротация: старый refresh-токен больше не действует.
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) throw new UnauthorizedException('Сессия истекла, войдите снова');
    return this.issueTokens(record.user);
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async profile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        company: { include: { vessels: { include: { vesselType: true }, orderBy: { name: 'asc' } } } },
      },
    });
    return {
      id: user.id,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone,
      phoneFormatted: formatPhone(user.phone),
      email: user.email,
      company: user.company
        ? {
            id: user.company.id,
            name: user.company.name,
            inn: user.company.inn,
            contactPhone: user.company.contactPhone,
          }
        : null,
      vessels: (user.company?.vessels ?? []).map((v) => ({
        id: v.id,
        name: v.name,
        imoNumber: v.imoNumber,
        vesselType: { id: v.vesselType.id, name: v.vesselType.name },
      })),
    };
  }

  private async issueTokens(user: User) {
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role }, { expiresIn: ACCESS_TTL_SEC });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000),
      },
    });
    return { accessToken, refreshToken, expiresInSec: ACCESS_TTL_SEC, user: await this.profile(user.id) };
  }
}
