// Целостность остатков под одновременными заказами (план проекта: «проверка целостности данных об остатках»).
// 50 судовладельцев в одну и ту же секунду заказывают деталь, свободных единиц которой меньше, чем желающих.
// Ожидание: заказов создано ровно столько, сколько было свободно, резерв не превышает остаток, остальные получают понятный 409.
//
//   k6 run load/race.js   (QA-стенд, порт 3100)
import http from 'k6/http';
import { check, fail } from 'k6';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';
import { BASE, clientIp, createOwners, json, login, uuid } from './lib.js';

const BUYERS = 50;
const FREE_UNITS = 7;
const PART = 'Блок однорольный 5 т';
const FILLER = 'Форсунка топливная в сборе';

export const options = {
  scenarios: {
    race: { executor: 'per-vu-iterations', vus: BUYERS, iterations: 1, maxDuration: '2m' },
  },
  setupTimeout: '3m',
};

const won = new Counter('race_orders_created');
const lost = new Counter('race_409');

export function setup() {
  const owners = createOwners(BUYERS, '09');
  const staff = login('sklad@nsrz.ru', '10.77.251.1');
  const auth = json(staff.accessToken, '10.77.251.1');
  const part = http.get(`${BASE}/api/parts?q=${encodeURIComponent(PART)}`, auth).json('items').find((p) => p.name === PART);
  // «под заказ» без ограничения склада: разное количество делает корзины разными,
  // иначе одинаковые заказы одной компании отсеет правило «точная копия ждёт подтверждения»
  const filler = http.get(`${BASE}/api/parts?q=${encodeURIComponent(FILLER)}`, auth).json('items').find((p) => p.name === FILLER);
  // склад выставляет остаток: свободно ровно FREE_UNITS
  const set = http.patch(`${BASE}/api/panel/stock/${part.id}`, JSON.stringify({ quantity: part.stock.reserved + FREE_UNITS, availability: 'IN_STOCK' }), auth);
  if (set.status !== 200) fail(`остаток не выставлен: ${set.status}`);

  // каждый покупатель заранее входит и кладёт 1 шт. в корзину — в гонке участвует только оформление
  const buyers = owners.map((phone, i) => {
    const ip = clientIp(500 + i);
    const me = login(phone, ip);
    const h = json(me.accessToken, ip);
    http.del(`${BASE}/api/cart`, null, h);
    const add = http.post(`${BASE}/api/cart/items`, JSON.stringify({ partId: part.id, quantity: 1 }), h);
    if (add.status !== 201) fail(`корзина ${phone}: ${add.status} ${add.body}`);
    const add2 = http.post(`${BASE}/api/cart/items`, JSON.stringify({ partId: filler.id, quantity: i + 1 }), h);
    if (add2.status !== 201) fail(`корзина ${phone}: ${add2.status} ${add2.body}`);
    return { token: me.accessToken, ip, vesselId: me.user.vessels[0].id };
  });
  return { buyers, partId: part.id, staffToken: staff.accessToken, reservedBefore: part.stock.reserved };
}

export default function (data) {
  const b = data.buyers[exec.vu.idInTest - 1];
  // все стартуют одновременно: per-vu-iterations запускает итерации без задержки
  const r = http.post(`${BASE}/api/orders`, JSON.stringify({ vesselId: b.vesselId, deliveryMethod: 'PICKUP', idempotencyKey: uuid() }), json(b.token, b.ip));
  check(r, { '201 или 409 NOT_ENOUGH_STOCK': (x) => x.status === 201 || (x.status === 409 && x.json('code') === 'NOT_ENOUGH_STOCK') });
  if (r.status === 201) won.add(1);
  else lost.add(1);
}

export function teardown(data) {
  const auth = json(data.staffToken, '10.77.251.1');
  const part = http.get(`${BASE}/api/parts/${data.partId}`, auth).json();
  const reservedNow = part.stock.reserved - data.reservedBefore;
  console.log(`Итог гонки: на складе ${part.stock.quantity}, в резерве ${part.stock.reserved} (новых ${reservedNow}), свободно ${part.stock.available}`);
  check(part, {
    'резерв не превышает остаток (нет продажи «в минус»)': (p) => p.stock.reserved <= p.stock.quantity,
    [`зарезервировано ровно ${FREE_UNITS} новых единиц`]: () => reservedNow === FREE_UNITS,
    'свободный остаток = 0': (p) => p.stock.available === 0,
  });
}

export function handleSummary(data) {
  const c = (k) => (data.metrics[k] ? data.metrics[k].values.count : 0);
  const checks = data.metrics.checks.values;
  const text =
    `Гонка: ${BUYERS} покупателей одновременно, свободно ${FREE_UNITS} шт.\n` +
    `Заказов создано: ${c('race_orders_created')}, отказов 409: ${c('race_409')}\n` +
    `Проверки: ${checks.passes} из ${checks.passes + checks.fails}` +
    (checks.fails ? ' — ЕСТЬ НАРУШЕНИЯ\n' : ' — целостность остатков сохранена\n');
  return { stdout: text, 'load/results/race.txt': text, 'load/results/race.json': JSON.stringify(data, null, 1) };
}
