// Предел производительности: поток запросов поиска без пауз нарастает, пока сервер не начнёт тормозить.
// Нужен, чтобы знать запас: во сколько раз сервер выдержит больше, чем даёт пилот.
//
//   k6 run load/capacity.js   (QA-стенд, порт 3100)
import http from 'k6/http';
import { check } from 'k6';
import { BASE, json, login, pick } from './lib.js';

export const options = {
  scenarios: {
    capacity: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 600,
      stages: [
        { duration: '30s', target: 200 },
        { duration: '30s', target: 500 },
        { duration: '30s', target: 1000 },
        { duration: '30s', target: 1500 },
        { duration: '30s', target: 2000 },
      ],
    },
  },
  thresholds: {
    // точка насыщения — где p95 перестаёт укладываться в 0,5 с или появляются ошибки
    http_req_duration: [{ threshold: 'p(95)<500', abortOnFail: true, delayAbortEval: '10s' }],
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '10s' }],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

const TERMS = ['фильтр', 'подшипник', '6L20', 'кольцо', 'насос', 'уплотнение', 'датчик', 'клапан', 'реле'];

export function setup() {
  // несколько сессий на всех — серверу важен поток запросов, а не число учётных записей
  return { tokens: ['+7 900 000-00-01', '+7 900 000-00-02', 'sergeeva@rybak-kuban.ru'].map((l, i) => login(l, `10.66.0.${i + 1}`).accessToken) };
}

export default function (data) {
  // разные клиенты (IP): ограничение 600 запросов в минуту действует на каждого отдельно
  const ip = `10.66.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
  const r = http.get(`${BASE}/api/parts?q=${encodeURIComponent(pick(TERMS))}&page=1&pageSize=12`, json(pick(data.tokens), ip));
  check(r, { 'поиск 200': (x) => x.status === 200 });
}

export function handleSummary(data) {
  const m = data.metrics;
  const d = m.http_req_duration.values;
  const text =
    `Ёмкость: выполнено ${m.http_reqs.values.count} запросов поиска, средний поток ${m.http_reqs.values.rate.toFixed(0)} в секунду, ` +
    `пик заданного потока — по ступеням 200/500/1000/1500/2000 в секунду\n` +
    `Задержка: медиана ${d.med.toFixed(0)} мс, p95 ${d['p(95)'].toFixed(0)} мс, p99 ${d['p(99)'].toFixed(0)} мс, макс ${d.max.toFixed(0)} мс\n` +
    `Ошибки: ${(m.http_req_failed.values.rate * 100).toFixed(2)} %; не хватило виртуальных пользователей (запросы не отправлены): ${m.dropped_iterations ? m.dropped_iterations.values.count : 0}\n`;
  return { stdout: text, 'load/results/capacity.txt': text, 'load/results/capacity.json': JSON.stringify(data, null, 1) };
}
