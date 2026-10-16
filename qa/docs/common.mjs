// Общие функции и сведения для документов этапа 6 (инструкции пользователей, отчёт о релизе).
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));

export const URL = 'https://your-subdomain.a.tuna.free';
export const VERSION = '1.1.0';
export const SALES = 'Отдел продаж НСРЗ: +7 8617 00-00-00, prodazhi@nsrz.ru';
export const AUTHOR = 'Черный Павел Сергеевич, группа ИП41-23';

/** Скриншот из qa/docs/out/screens (снимаются docs/screens.mjs). */
export const S = (name) => join(here, 'out', 'screens', `${name}.jpg`);

export const h1 = (text, opts = {}) => ({ type: 'h1', text, ...opts });
export const h2 = (text) => ({ type: 'h2', text });
export const h3 = (text) => ({ type: 'h3', text });
export const p = (text, opts = {}) => ({ type: 'p', text, ...opts });
export const ul = (items) => ({ type: 'ul', items });
export const ol = (items) => ({ type: 'ol', items });
export const table = (caption, header, rows, widths, size = 'small') => ({ type: 'table', caption, header, rows, widths, size });
export const figure = (name, caption, width = 88) => ({ type: 'figure', file: S(name), caption, width });
export const figrow = (names, caption, labels, heightMm = 95) => ({ type: 'figrow', files: names.map(S), caption, labels, heightMm });
export const note = (kind, text, title) => ({ type: 'note', kind, ...(Array.isArray(text) ? { items: text } : { text }), ...(title ? { title } : {}) });
export const qr = (text, caption, sizeMm = 38) => ({ type: 'qr', text, caption, sizeMm });
export const code = (lines) => ({ type: 'code', lines });
export const pagebreak = () => ({ type: 'pagebreak' });

/** Титульный лист и колонтитул руководства. */
export const manualMeta = (title, subtitle, header, fileName) => ({
  kind: 'manual',
  product: 'АО «Новороссийский судоремонтный завод» · система «НСРЗ. Заказ запчастей»',
  title: [title],
  subtitle,
  info: [`Версия системы ${VERSION} · октябрь 2026`, `Адрес: ${URL}`, `Подготовил: ${AUTHOR}`],
  city: 'Новороссийск, 2026',
  header,
  docTitle: `${title} — НСРЗ. Заказ запчастей`,
  fileName,
  chapterBreak: false, // главы руководства идут подряд, без пустых хвостов страниц
});

/** Страница-предупреждение бесплатного туннеля tuna при первом заходе из браузера. */
export const TUNA_NOTE = note(
  'warn',
  'При первом открытии адреса в браузере может появиться страница «Вы собираетесь посетить your-subdomain.a.tuna.free». Это служебная страница сервиса tuna, через который сервер НСРЗ доступен из интернета. Нажмите **«Посетить»** — дальше она не появляется. Приложение для Android эту страницу не показывает.',
  'Страница «Вы собираетесь посетить…»',
);
