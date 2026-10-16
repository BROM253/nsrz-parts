import { APIRequestContext, expect, Page, request } from '@playwright/test';

export const BASE = process.env.QA_URL ?? 'http://localhost:3100';

export const USERS = {
  owner1: '+7 900 000-00-01', // ООО «Черноморский флот»
  owner2: '+7 900 000-00-02', // ООО «Азов-Транс»
  sales: 'prodazhi@nsrz.ru',
  warehouse: 'sklad@nsrz.ru',
  admin: 'admin@nsrz.ru',
};

/** Детали из демо-данных: большой остаток — для заказов в каждом браузере. */
export const PARTS = {
  bearing: { name: 'Подшипник насоса 6309-2RS', mpn: '6309-2RS' },
  filter: { name: 'Фильтр топливный тонкой очистки', mpn: '6L20-FF-118', catalog: 'НСРЗ-ГД-01427' },
  starter: { name: 'Стартер электрический 24 В' }, // нет на складе
};

type Tokens = { accessToken: string; refreshToken: string };
const cache = new Map<string, Tokens>();

/**
 * Вход через API (код из демо-режима). Повторный код на тот же логин сервер даёт не чаще раза в 5 с —
 * поэтому токены кэшируются, а при 429 ждём и повторяем.
 */
export async function apiLogin(login: string, fresh = false): Promise<Tokens> {
  const cached = cache.get(login);
  if (cached && !fresh) return cached;
  const ctx = await request.newContext({ baseURL: BASE });
  for (let attempt = 0; attempt < 6; attempt++) {
    const sent = await ctx.post('/api/auth/request-code', { data: { login } });
    if (sent.status() === 429) {
      await new Promise((r) => setTimeout(r, 5_500));
      continue;
    }
    expect(sent.status(), await sent.text()).toBe(200);
    const { devCode } = await sent.json();
    const res = await ctx.post('/api/auth/verify', { data: { login, code: devCode } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const tokens = { accessToken: body.accessToken, refreshToken: body.refreshToken };
    cache.set(login, tokens);
    await ctx.dispose();
    return tokens;
  }
  throw new Error(`Не удалось войти как ${login}`);
}

/** Открыть сайт уже вошедшим пользователем (токены — в localStorage, как после обычного входа). */
export async function signedIn(page: Page, login: string, path = '/') {
  const tokens = await apiLogin(login);
  await page.addInitScript((t) => {
    if (!sessionStorage.getItem('qa.signed')) {
      localStorage.setItem('nsrz.tokens', JSON.stringify(t));
      sessionStorage.setItem('qa.signed', '1');
    }
  }, tokens);
  await page.goto(path);
}

/** Клиент API от имени пользователя — подготовка данных и проверка результата «под капотом». */
export async function apiAs(login: string): Promise<APIRequestContext> {
  const { accessToken } = await apiLogin(login);
  return request.newContext({ baseURL: BASE, extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` } });
}

/** Найти id детали по названию. */
export async function partId(api: APIRequestContext, name: string): Promise<number> {
  const res = await api.get('/api/parts', { params: { q: name } });
  const item = (await res.json()).items.find((p: { name: string }) => p.name === name);
  expect(item, `деталь «${name}» есть в каталоге`).toBeTruthy();
  return item.id;
}

/** Ожидающие заказы компании отклоняются, корзина очищается — каждый тест начинает с чистого листа. */
export async function resetOwner(login: string) {
  const owner = await apiAs(login);
  await owner.delete('/api/cart');
  const staff = await apiAs(USERS.sales);
  const mine = await (await owner.get('/api/orders', { params: { status: 'PENDING' } })).json();
  for (const o of mine.items) {
    await staff.patch(`/api/panel/orders/${o.id}/status`, { data: { status: 'REJECTED', reason: 'Подготовка автотеста' } });
  }
  await owner.dispose();
  await staff.dispose();
}
