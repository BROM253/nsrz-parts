// Проверка гипотез о дефектах на QA-стенде (порт 3100). Только наш собственный стенд и его демо-данные.
// node security/probe.mjs
const BASE = process.env.QA_URL ?? 'http://localhost:3100';

async function call(method, path, { token, body, ip } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (ip) headers['X-Forwarded-For'] = ip;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* CSV или пусто */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function login(who, ip) {
  for (let i = 0; i < 4; i++) {
    const sent = await call('POST', '/api/auth/request-code', { body: { login: who }, ip });
    if (sent.status === 429) { await new Promise((r) => setTimeout(r, 5500)); continue; }
    const res = await call('POST', '/api/auth/verify', { body: { login: who, code: sent.json.devCode }, ip });
    return res.json;
  }
  throw new Error('вход не удался: ' + who);
}

const results = [];
const note = (id, title, ok, detail) => {
  results.push({ id, title, verdict: ok ? 'защита работает' : 'ДЕФЕКТ ПОДТВЕРЖДЁН', detail });
  console.log(`${ok ? '✓' : '✗'} ${id}. ${title}\n    ${detail}`);
};

const admin = await login('admin@nsrz.ru', '10.88.0.1');
const owner = await login('+7 900 000-00-01', '10.88.0.2');

// 1. Ошибка внешнего ключа (несуществующая компания) — должна быть 400, а не 500
{
  const r = await call('POST', '/api/admin/vessels', {
    token: admin.accessToken,
    body: { companyId: '00000000-0000-4000-8000-000000000000', vesselTypeId: 1, name: 'Проверка' },
  });
  note('Г-1', 'Судно для несуществующей компании', r.status === 400 || r.status === 404, `ответ ${r.status}: ${r.text.slice(0, 120)}`);
}

// 2. Администратор может отключить сам себя → никто не сможет управлять пользователями
{
  const r = await call('PATCH', `/api/admin/users/${admin.user.id}`, { token: admin.accessToken, body: { isActive: false } });
  const ok = r.status >= 400;
  note('Г-2', 'Администратор отключает собственную учётную запись', ok, `ответ ${r.status}`);
  if (!ok) {
    // вернуть как было — напрямую через стенд нельзя (админ отключён), стенд перезаливается перед тестами
    console.log('    (стенд нужно перезалить: npm run stand:seed)');
  }
}

// 3. Экспорт CSV: комментарий, начинающийся с «=», попадает в ячейку как формула
{
  const me = owner.user;
  const parts = await call('GET', '/api/parts?q=' + encodeURIComponent('Реле контроля фаз'), { token: owner.accessToken });
  await call('DELETE', '/api/cart', { token: owner.accessToken });
  await call('POST', '/api/cart/items', { token: owner.accessToken, body: { partId: parts.json.items[0].id, quantity: 1 } });
  const order = await call('POST', '/api/orders', {
    token: owner.accessToken,
    body: { vesselId: me.vessels[me.vessels.length - 1].id, deliveryMethod: 'PICKUP', comment: '=1+1' },
  });
  if (order.status !== 201) {
    note('Г-3', 'Экспорт CSV и формулы', false, `не удалось создать заказ: ${order.status} ${order.text.slice(0, 100)}`);
  } else {
    const csv = await call('GET', `/api/orders/${order.json.id}/export.csv`, { token: owner.accessToken });
    const line = csv.text.split(/\r?\n/).find((l) => l.startsWith('Комментарий'));
    note('Г-3', 'Экспорт CSV: текст «=1+1» не должен стать формулой в Excel', !/;=/.test(line ?? ''), `строка: ${line}`);
  }
}

// 4. Загрузка остатков ниже резерва — предупреждает ли импорт, как ручное изменение
{
  const staff = await login('sklad@nsrz.ru', '10.88.0.3');
  const list = await call('GET', '/api/panel/stock?q=' + encodeURIComponent('Реле контроля фаз'), { token: staff.accessToken });
  const p = list.json.items[0];
  const form = new FormData();
  form.append('file', new Blob([`﻿каталожный номер;количество\r\n${p.catalogNumber};0\r\n`], { type: 'text/csv' }), 'ostatki.csv');
  const res = await fetch(BASE + '/api/panel/stock/import', { method: 'POST', headers: { Authorization: `Bearer ${staff.accessToken}` }, body: form });
  const body = await res.json();
  const warned = JSON.stringify(body).includes('резерв');
  note('Г-4', `Импорт ставит 0 при резерве ${p.stock.reserved} — есть ли предупреждение`, warned || p.stock.reserved === 0, `ответ ${res.status}: ${JSON.stringify(body).slice(0, 160)}`);
}

// 5. Два сотрудника подтверждают один заказ по устаревшей очереди
{
  const sales = await login('prodazhi@nsrz.ru', '10.88.0.4');
  const queue = await call('GET', '/api/panel/orders?status=PENDING', { token: sales.accessToken });
  const id = queue.json.items[0].id;
  await call('PATCH', `/api/panel/orders/${id}/status`, { token: sales.accessToken, body: { status: 'CONFIRMED' } });
  const other = await login('sklad@nsrz.ru', '10.88.0.5');
  const second = await call('PATCH', `/api/panel/orders/${id}/status`, { token: other.accessToken, body: { status: 'CONFIRMED' } });
  note('Г-5', 'Повторное подтверждение уже подтверждённого заказа (второй сотрудник)', second.status === 409, `ответ ${second.status}: ${second.json?.message}`);
}

console.log('\nИтого:', results.filter((r) => r.verdict.startsWith('ДЕФЕКТ')).length, 'дефектов из', results.length, 'гипотез');
