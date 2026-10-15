import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel, NotificationStatus } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

interface SendResult {
  status: NotificationStatus;
  provider: string;
  error?: string;
}

/**
 * Интеграции с внешними сервисами уведомлений (ТЗ п. 4.6):
 *  - SMS: SMS.ru (REST API) — коды входа и смена статуса заказа;
 *  - почта: SMTP (nodemailer) — коды входа на корпоративную почту, письма отделу продаж.
 * В демо-режиме (SMS_PROVIDER=log, MAIL_TRANSPORT=log) сообщения не уходят наружу,
 * а записываются в журнал notifications — его видно в панели НСРЗ.
 * Ошибка внешнего сервиса никогда не ломает заказ: она пишется в журнал со статусом FAILED.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');
  private mailer?: nodemailer.Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async sms(to: string, text: string, orderId?: number) {
    const result = await this.sendSms(to, text).catch((e): SendResult => ({
      status: NotificationStatus.FAILED,
      provider: 'smsru',
      error: String(e?.message ?? e),
    }));
    return this.log(NotificationChannel.SMS, to, null, text, result, orderId);
  }

  async email(to: string, subject: string, text: string, orderId?: number) {
    const result = await this.sendEmail(to, subject, text).catch((e): SendResult => ({
      status: NotificationStatus.FAILED,
      provider: 'smtp',
      error: String(e?.message ?? e),
    }));
    return this.log(NotificationChannel.EMAIL, to, subject, text, result, orderId);
  }

  /** Уведомить пользователя тем каналом, который у него есть. */
  async notifyUser(user: { phone: string | null; email: string | null }, subject: string, text: string, orderId?: number) {
    if (user.phone) await this.sms(user.phone, text, orderId);
    else if (user.email) await this.email(user.email, subject, text, orderId);
  }

  private async sendSms(to: string, text: string): Promise<SendResult> {
    const provider = this.config.get<string>('SMS_PROVIDER', 'log');
    const apiId = this.config.get<string>('SMSRU_API_ID');
    if (provider !== 'smsru' || !apiId) return { status: NotificationStatus.LOGGED, provider: 'log' };

    const url =
      'https://sms.ru/sms/send?json=1' +
      `&api_id=${encodeURIComponent(apiId)}&to=${encodeURIComponent(to.replace('+', ''))}` +
      `&msg=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const body: any = await res.json();
    if (body?.status === 'OK') return { status: NotificationStatus.SENT, provider: 'smsru' };
    return { status: NotificationStatus.FAILED, provider: 'smsru', error: body?.status_text ?? `HTTP ${res.status}` };
  }

  private async sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
    const transport = this.config.get<string>('MAIL_TRANSPORT', 'log');
    const host = this.config.get<string>('SMTP_HOST');
    if (transport !== 'smtp' || !host) return { status: NotificationStatus.LOGGED, provider: 'log' };

    this.mailer ??= nodemailer.createTransport({
      host,
      port: Number(this.config.get('SMTP_PORT', 465)),
      secure: Number(this.config.get('SMTP_PORT', 465)) === 465,
      auth: { user: this.config.get('SMTP_USER'), pass: this.config.get('SMTP_PASS') },
    });
    await this.mailer.sendMail({ from: this.config.get('MAIL_FROM'), to, subject, text });
    return { status: NotificationStatus.SENT, provider: 'smtp' };
  }

  private async log(
    channel: NotificationChannel,
    recipient: string,
    subject: string | null,
    body: string,
    result: SendResult,
    orderId?: number,
  ) {
    const line = `${channel} → ${recipient}: ${subject ? subject + ' — ' : ''}${body} [${result.status}]`;
    if (result.status === NotificationStatus.FAILED) this.logger.warn(`${line} ${result.error ?? ''}`);
    else this.logger.log(line);
    try {
      return await this.prisma.notification.create({
        data: {
          channel,
          recipient,
          subject,
          body,
          status: result.status,
          provider: result.provider,
          error: result.error,
          orderId,
        },
      });
    } catch (e) {
      this.logger.error(`Не удалось записать уведомление в журнал: ${e}`);
      return null;
    }
  }
}

@Global()
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
