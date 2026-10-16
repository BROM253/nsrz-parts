// Перепроверка исправлений, которые видны только на работающем сервере с включённым ограничением частоты
// (на QA-стенде NODE_ENV=qa, как на рабочем). Только наш собственный стенд.
//   node security/verify-fixes.mjs
const BASE = process.env.QA_URL ?? 'http://localhost:3100';
let failed = 0;
const ok = (cond, title, detail) => {
  if (!cond) failed++;
  console.log(`${cond ? '✓' : '✗'} ${title}\n    ${detail}`);
};

const post = (path, body, headers = {}) =>
  fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

// Д-01. Подмена IP заголовком X-Forwarded-For больше не обходит лимит «30 запросов кода в минуту с одного адреса».
// Клиент подключается напрямую по адресу ПК в домашней сети (как телефон в Wi-Fi), а не через туннель
// на 127.0.0.1, — поэтому сервер должен игнорировать заголовок.
{
  const { lanUrls } = await (await fetch(BASE + '/api/public-address')).json();
  const lan = lanUrls[0];
  if (!lan) throw new Error('Не найден адрес ПК в локальной сети');
  const codes = await Promise.all(
    Array.from({ length: 36 }, (_, i) =>
      fetch(lan + '/api/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.123.0.${i + 1}` },
        body: JSON.stringify({ login: '+7 999 000-00-77' }),
      }).then((r) => r.status),
    ),
  );
  const limited = codes.filter((s) => s === 429).length;
  ok(limited >= 6, 'Д-01. Подменённый X-Forwarded-For не даёт обойти ограничение частоты', `из 36 запросов отклонено лимитом: ${limited} (ожидается ≥ 6)`);
}

// Д-10. Два одновременных запроса кода на один логин — создаётся один код (одно SMS), второй получает 429.
{
  await new Promise((r) => setTimeout(r, 61_000)); // окно ограничения частоты из предыдущей проверки истекает
  const login = 'sergeeva@rybak-kuban.ru';
  const answers = await Promise.all([1, 2, 3].map(() => post('/api/auth/request-code', { login }).then((r) => r.status)));
  const sent = answers.filter((s) => s === 200).length;
  ok(sent === 1, 'Д-10. Параллельные запросы кода на один логин отправляют одно SMS', `ответы: ${answers.join(', ')} (ожидается один 200, остальные 429)`);
}

console.log(failed ? `\nНе прошло: ${failed}` : '\nВсе исправления подтверждены на стенде');
process.exit(failed ? 1 : 0);
