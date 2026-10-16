import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import type { MonitoringService } from '../monitoring/monitoring.service';

/**
 * Общий обработчик ошибок:
 *  - ошибки Prisma — в понятные HTTP-ответы вместо «500 Internal Server Error»;
 *  - необработанные сбои (не HttpException) — в журнал ошибок мониторинга (этап 7), ответ клиенту — без подробностей.
 */
@Catch()
export class PrismaExceptionFilter extends BaseExceptionFilter {
  constructor(
    applicationRef?: ConstructorParameters<typeof BaseExceptionFilter>[0],
    private readonly monitoring?: MonitoringService,
  ) {
    super(applicationRef);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: 'Запись с такими данными уже существует',
          error: 'Conflict',
        });
      }
      if (exception.code === 'P2003') {
        // ссылка на несуществующую запись (компания, тип судна, родительская категория) — ошибка ввода, а не сбой сервера
        return res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Связанная запись не найдена — проверьте выбранную компанию или справочник',
          error: 'Bad Request',
        });
      }
      if (exception.code === 'P2025') {
        return res.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Запись не найдена',
          error: 'Not Found',
        });
      }
    }
    if (!(exception instanceof HttpException) && this.monitoring) {
      const req = host.switchToHttp().getRequest();
      const e = exception as Error;
      this.monitoring.recordError({
        method: req?.method ?? '',
        route: req?.route?.path ?? req?.path ?? '',
        status: 500,
        message: `${e?.name ?? 'Error'}: ${e?.message ?? String(exception)}`,
      });
    }
    return super.catch(exception, host);
  }
}
