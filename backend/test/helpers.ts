import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { seed } from '../prisma/seed';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

export const LOGINS = {
  owner1: '+7 900 000-00-01', // ООО «Черноморский флот»
  owner2: '+7 900 000-00-02', // ООО «Азов-Транс»
  owner3: 'sergeeva@rybak-kuban.ru', // ООО «Рыбак Кубани», вход по почте
  warehouse: 'sklad@nsrz.ru',
  sales: 'prodazhi@nsrz.ru',
  admin: 'admin@nsrz.ru',
  disabled: 'polishuk@nsrz.ru',
};

export async function createApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  await seed(prisma);
  return { app, prisma };
}

export async function login(app: INestApplication, who: string) {
  const sent = await request(app.getHttpServer()).post('/api/auth/request-code').send({ login: who }).expect(200);
  const res = await request(app.getHttpServer())
    .post('/api/auth/verify')
    .send({ login: who, code: sent.body.devCode })
    .expect(200);
  return res.body as { accessToken: string; refreshToken: string; user: any };
}

/** Клиент API от имени пользователя. */
export function as(app: INestApplication, token: string) {
  const server = app.getHttpServer();
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (url: string) => auth(request(server).get(`/api${url}`)),
    post: (url: string, body?: object) => auth(request(server).post(`/api${url}`)).send(body ?? {}),
    put: (url: string, body?: object) => auth(request(server).put(`/api${url}`)).send(body ?? {}),
    patch: (url: string, body?: object) => auth(request(server).patch(`/api${url}`)).send(body ?? {}),
    delete: (url: string) => auth(request(server).delete(`/api${url}`)),
    upload: (url: string, name: string, content: string) =>
      auth(request(server).post(`/api${url}`)).attach('file', Buffer.from(content, 'utf8'), name),
  };
}

export type Client = ReturnType<typeof as>;

export async function partId(prisma: PrismaService, catalogNumber: string) {
  return (await prisma.part.findUniqueOrThrow({ where: { catalogNumber } })).id;
}

export async function stockOf(prisma: PrismaService, catalogNumber: string) {
  const part = await prisma.part.findUniqueOrThrow({ where: { catalogNumber }, include: { stock: true } });
  return part.stock!;
}

/** Положить в корзину и оформить заказ на первое судно пользователя. */
export async function placeOrder(client: Client, items: [number, number][], vesselId: string, key = randomUUID()) {
  await client.delete('/cart').expect(200);
  for (const [id, qty] of items) await client.post('/cart/items', { partId: id, quantity: qty }).expect(201);
  return client.post('/orders', { vesselId, deliveryMethod: 'PICKUP', idempotencyKey: key });
}
