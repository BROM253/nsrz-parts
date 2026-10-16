// Общие функции нагрузочных сценариев k6.
import http from 'k6/http';
import { check, fail, sleep } from 'k6';

export const BASE = __ENV.QA_URL || 'http://localhost:3100';

// 409 — ожидаемый бизнес-отказ (закончился остаток, дубликат заказа), а не сбой сервера
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 409));

/**
 * Каждый виртуальный пользователь — отдельный «клиент» со своим IP (X-Forwarded-For),
 * как реальные судовладельцы за туннелем: ограничение частоты запросов считается на каждого отдельно.
 */
export function clientIp(n) {
  return `10.77.${Math.floor(n / 250) % 250}.${(n % 250) + 1}`;
}

export function json(token, ip, extra = {}) {
  const h = { 'Content-Type': 'application/json', 'X-Forwarded-For': ip };
  if (token) h.Authorization = `Bearer ${token}`;
  return { headers: h, ...extra };
}

/** Вход по коду (демо-режим отдаёт код в ответе). */
export function login(loginName, ip) {
  let sent;
  for (let attempt = 0; attempt < 4; attempt++) {
    sent = http.post(`${BASE}/api/auth/request-code`, JSON.stringify({ login: loginName }), json(null, ip, { tags: { type: 'auth' }, responseCallback: http.expectedStatuses(200, 429) }));
    if (sent.status !== 429) break;
    sleep(5.5); // повторный код на тот же логин — не чаще раза в 5 с (защита сервера)
  }
  if (!check(sent, { 'код отправлен': (r) => r.status === 200 })) fail(`request-code ${loginName}: ${sent.status} ${sent.body}`);
  const res = http.post(
    `${BASE}/api/auth/verify`,
    JSON.stringify({ login: loginName, code: sent.json('devCode') }),
    json(null, ip, { tags: { type: 'auth' } }),
  );
  if (!check(res, { 'вход выполнен': (r) => r.status === 200 })) fail(`verify ${loginName}: ${res.status} ${res.body}`);
  return res.json();
}

/**
 * Создаёт тестовых судовладельцев (через API администратора), по одному на виртуального пользователя.
 * Телефоны +7 950 0xx-xx-xx — диапазон только для нагрузочных тестов.
 */
export function createOwners(count, prefix) {
  const admin = login('admin@nsrz.ru', '10.77.250.1');
  const auth = json(admin.accessToken, '10.77.250.1');
  const companies = http.get(`${BASE}/api/admin/companies`, auth).json();
  const users = [];
  for (let i = 0; i < count; i++) {
    const phone = `+7950${prefix}${String(i).padStart(4, '0')}`;
    const company = companies[i % companies.length];
    const r = http.post(
      `${BASE}/api/admin/users`,
      JSON.stringify({ fullName: `Нагрузочный Тест ${prefix}-${i}`, role: 'OWNER', phone, companyId: company.id }),
      auth,
    );
    // 409 — пользователь остался с прошлого прогона, это нормально
    if (r.status !== 201 && r.status !== 409) fail(`создание пользователя ${phone}: ${r.status} ${r.body}`);
    users.push(phone);
  }
  return users;
}

export function uuid() {
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 32; i++) s += h[Math.floor(Math.random() * 16)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
