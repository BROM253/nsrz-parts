const moneyFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

export const money = (v: number) => `${moneyFmt.format(v)} ₽`;
export const fmtDateTime = (iso?: string | null) => (iso ? dateTime.format(new Date(iso)).replace(',', ' ·') : '—');
export const fmtDate = (iso?: string | null) => (iso ? shortDate.format(new Date(iso)) : '—');
export const fmtTime = (iso?: string | null) => (iso ? time.format(new Date(iso)) : '—');

/** «5 мин назад», «вчера в 14:20». */
export function ago(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `сегодня в ${fmtTime(iso)}`;
  if (d.toDateString() === yesterday.toDateString()) return `вчера в ${fmtTime(iso)}`;
  return `${fmtDate(iso)} в ${fmtTime(iso)}`;
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const ROLE_TITLES: Record<string, string> = {
  OWNER: 'Судовладелец',
  SALES: 'Отдел продаж',
  WAREHOUSE: 'Склад',
  ADMIN: 'Администратор',
};
