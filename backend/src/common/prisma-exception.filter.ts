import { ArgumentsHost, Catch, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

/** Переводит ошибки Prisma в понятные HTTP-ответы вместо «500 Internal Server Error». */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
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
    return super.catch(exception, host);
  }
}
