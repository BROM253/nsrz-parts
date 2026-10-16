// Нагрузочное тестирование (этап 5): сеанс судовладельца + опрос очереди сотрудниками НСРЗ.
//
//   k6 run -e PROFILE=load   load/scenario.js   — номинал пилота: 20 судовладельцев + 3 сотрудника (ТЗ п. 6)
//   k6 run -e PROFILE=stress load/scenario.js   — ступени 50 → 100 → 200 пользователей (в 10 раз больше пилота)
//   k6 run -e PROFILE=spike  load/scenario.js   — резкий наплыв: 0 → 150 за 10 секунд
//
// Запускать против QA-стенда (порт 3100, база nsrz_qa), рабочие данные не трогаются.
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { BASE, clientIp, createOwners, json, login, pick, uuid } from './lib.js';

const PROFILE = __ENV.PROFILE || 'load';

const PROFILES = {
  load: {
    owners: { executor: 'ramping-vus', startVUs: 0, stages: [{ duration: '30s', target: 20 }, { duration: '2m', target: 20 }, { duration: '15s', target: 0 }] },
    users: 20,
  },
  stress: {
    owners: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 }, { duration: '1m', target: 50 },
        { duration: '30s', target: 100 }, { duration: '1m', target: 100 },
        { duration: '30s', target: 200 }, { duration: '1m', target: 200 },
        { duration: '20s', target: 0 },
      ],
    },
    users: 200,
  },
  spike: {
    owners: { executor: 'ramping-vus', startVUs: 0, stages: [{ duration: '10s', target: 150 }, { duration: '40s', target: 150 }, { duration: '10s', target: 0 }] },
    users: 150,
  },
};
const profile = PROFILES[PROFILE];

export const options = {
  scenarios: {
    owners: { ...profile.owners, exec: 'owner', gracefulRampDown: '10s' },
    staff: { executor: 'constant-vus', vus: 3, duration: PROFILE === 'stress' ? '5m' : PROFILE === 'spike' ? '1m' : '2m45s', exec: 'staff' },
  },
  thresholds: {
    // целевые показатели (SLO) для пилота
    'http_req_failed': ['rate<0.01'], // сбоев сервера и ошибок меньше 1 %
    'http_req_duration{type:catalog}': ['p(95)<500'], // поиск и карточка — 95 % быстрее 0,5 с
    'http_req_duration{type:order}': ['p(95)<1000'], // оформление заказа — 95 % быстрее 1 с
    'http_req_duration{type:static}': ['p(95)<300'], // страница сайта
    'checks': ['rate>0.99'],
  },
  setupTimeout: '3m',
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const ordersCreated = new Counter('orders_created');
const ordersRejectedByStock = new Counter('orders_business_409');
const rejectStock = new Counter('order_409_stock');
const rejectDuplicate = new Counter('order_409_duplicate');
const unexpected = new Counter('unexpected_status');
const orderSuccess = new Rate('order_success_rate');

const TERMS = ['фильтр', 'подшипник', '6L20', 'кольцо', 'насос', 'НСРЗ-ГД', 'уплотнение', 'датчик', 'трос', 'клапан', 'DG-OF-2240', 'реле'];
// детали с большим остатком — чтобы заказы проходили, а не упирались в склад
const ORDERABLE = ['Подшипник насоса 6309-2RS', 'Трос стальной швартовный, 24 мм', 'Кольцо уплотнительное крышки цилиндра', 'Фильтр масляный дизель-генератора', 'Реле контроля фаз'];

export function setup() {
  const prefix = { load: '01', stress: '02', spike: '03' }[PROFILE];
  const owners = createOwners(profile.users, prefix);
  // id деталей для заказа
  const admin = login('admin@nsrz.ru', '10.77.250.2');
  const parts = ORDERABLE.map((name) => {
    const r = http.get(`${BASE}/api/parts?q=${encodeURIComponent(name)}`, json(admin.accessToken, '10.77.250.2'));
    return r.json('items').find((p) => p.name === name).id;
  });
  return { owners, parts };
}

// состояние каждого виртуального пользователя
let session = null;

export function owner(data) {
  const ip = clientIp(__VU);
  if (!session) {
    const me = login(data.owners[(__VU - 1) % data.owners.length], ip);
    session = { token: me.accessToken, vessels: me.user.vessels.map((v) => v.id) };
  }
  const opt = (type) => json(session.token, ip, { tags: { type } });

  group('Открыть сайт', () => {
    if (__ITER % 5 === 0) {
      const page = http.get(`${BASE}/`, { headers: { 'Accept-Encoding': 'br, gzip', 'X-Forwarded-For': ip }, tags: { type: 'static' } });
      check(page, { 'страница сайта': (r) => r.status === 200 && r.body.includes('<div id="root">') });
    }
    http.get(`${BASE}/api/dictionaries`, opt('catalog'));
  });

  let found = [];
  group('Поиск и карточка', () => {
    const r = http.get(`${BASE}/api/parts?q=${encodeURIComponent(pick(TERMS))}&page=1&pageSize=12`, opt('catalog'));
    check(r, { 'поиск 200': (x) => x.status === 200 });
    found = r.status === 200 ? r.json('items') : [];
    sleep(Math.random() * 2 + 0.5); // человек смотрит результаты
    if (found.length) {
      const card = http.get(`${BASE}/api/parts/${pick(found).id}`, opt('catalog'));
      check(card, { 'карточка 200': (x) => x.status === 200 && x.json('stock') !== undefined });
    }
    const filtered = http.get(`${BASE}/api/parts?categoryId=${1 + Math.floor(Math.random() * 7)}&onlyAvailable=true`, opt('catalog'));
    check(filtered, { 'фильтр 200': (x) => x.status === 200 });
  });

  if (Math.random() < 0.3) {
    group('Корзина и заказ', () => {
      http.del(`${BASE}/api/cart`, null, opt('cart'));
      const add = http.post(`${BASE}/api/cart/items`, JSON.stringify({ partId: pick(data.parts), quantity: 1 + Math.floor(Math.random() * 2) }), opt('cart'));
      if (add.status === 409) {
        ordersRejectedByStock.add(1);
        rejectStock.add(1);
        return;
      }
      check(add, { 'в корзину 201': (x) => x.status === 201 });
      sleep(1);
      const order = http.post(
        `${BASE}/api/orders`,
        JSON.stringify({ vesselId: pick(session.vessels), deliveryMethod: 'PICKUP', idempotencyKey: uuid() }),
        opt('order'),
      );
      check(order, { 'заказ: 201 или понятный 409': (x) => x.status === 201 || x.status === 409 });
      orderSuccess.add(order.status === 201);
      if (order.status === 201) ordersCreated.add(1);
      else {
        ordersRejectedByStock.add(1);
        const code = order.status === 409 ? order.json('code') : null;
        if (code === 'DUPLICATE_ORDER') rejectDuplicate.add(1);
        else if (code === 'NOT_ENOUGH_STOCK') rejectStock.add(1);
        else {
          unexpected.add(1);
          console.warn(`заказ: ${order.status} ${String(order.body).slice(0, 160)}`);
        }
      }
    });
  }

  group('История заказов', () => {
    const r = http.get(`${BASE}/api/orders?status=ALL`, opt('catalog'));
    check(r, { 'история 200': (x) => x.status === 200 });
  });
  sleep(Math.random() * 3 + 1);
}

let staffToken = null;
const STAFF = ['prodazhi@nsrz.ru', 'sklad@nsrz.ru', 'admin@nsrz.ru'];

/** Сотрудник держит открытой очередь: панель опрашивает её раз в 15 с и подтверждает заказы. */
export function staff() {
  const ip = clientIp(240 + __VU);
  if (!staffToken) staffToken = login(STAFF[(__VU - 1) % STAFF.length], ip).accessToken;
  const opt = json(staffToken, ip, { tags: { type: 'panel' } });
  const queue = http.get(`${BASE}/api/panel/orders?status=PENDING`, opt);
  check(queue, { 'очередь 200': (x) => x.status === 200 });
  const first = queue.status === 200 ? queue.json('items')[0] : null;
  if (first && Math.random() < 0.5) {
    const r = http.patch(`${BASE}/api/panel/orders/${first.id}/status`, JSON.stringify({ status: 'CONFIRMED' }), opt);
    check(r, { 'подтверждение: 200 или 409 (уже подтвердил коллега)': (x) => x.status === 200 || x.status === 409 });
    if (r.status !== 200 && r.status !== 409) {
      unexpected.add(1);
      console.warn(`подтверждение: ${r.status} ${String(r.body).slice(0, 200)}`);
    }
  }
  sleep(15);
}

export function handleSummary(data) {
  const m = data.metrics;
  const ms = (v) => (v === undefined ? '—' : `${Math.round(v)} мс`);
  const trend = (name) => m[name] && m[name].values;
  const lines = [
    `Профиль: ${PROFILE}; виртуальных пользователей (макс.): ${m.vus_max ? m.vus_max.values.max : '—'}`,
    `Запросов: ${m.http_reqs.values.count} (${m.http_reqs.values.rate.toFixed(1)} в секунду)`,
    `Ошибки (кроме ожидаемых 409): ${(m.http_req_failed.values.rate * 100).toFixed(2)} %`,
    `Проверки пройдены: ${(m.checks.values.rate * 100).toFixed(2)} %`,
  ];
  for (const [title, key] of [
    ['Каталог/поиск', 'http_req_duration{type:catalog}'],
    ['Оформление заказа', 'http_req_duration{type:order}'],
    ['Страница сайта', 'http_req_duration{type:static}'],
    ['Панель (очередь)', 'http_req_duration{type:panel}'],
    ['Все запросы', 'http_req_duration'],
  ]) {
    const v = trend(key);
    if (v) lines.push(`${title}: среднее ${ms(v.avg)}, медиана ${ms(v.med)}, p95 ${ms(v['p(95)'])}, p99 ${ms(v['p(99)'])}, макс ${ms(v.max)}`);
  }
  const c = (k) => (m[k] ? m[k].values.count : 0);
  lines.push(`Из них: нет свободного остатка — ${c('order_409_stock')}, точная копия ожидающего заказа — ${c('order_409_duplicate')}; неожиданных ответов — ${c('unexpected_status')}`);
  lines.push(`Заказов создано: ${m.orders_created ? m.orders_created.values.count : 0}; бизнес-отказов 409 (нет остатка / дубль): ${m.orders_business_409 ? m.orders_business_409.values.count : 0}`);
  const failedThresholds = Object.entries(m)
    .filter(([, v]) => v.thresholds && Object.values(v.thresholds).some((t) => !t.ok))
    .map(([k]) => k);
  lines.push(failedThresholds.length ? `ПОРОГИ НЕ ВЫПОЛНЕНЫ: ${failedThresholds.join(', ')}` : 'Все пороги (SLO) выполнены');
  const text = lines.join('\n') + '\n';
  return { stdout: text, [`load/results/${PROFILE}.json`]: JSON.stringify(data, null, 1), [`load/results/${PROFILE}.txt`]: text };
}
