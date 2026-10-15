import { BadRequestException } from '@nestjs/common';

export type LoginKind = 'phone' | 'email';

/** Телефон → +7XXXXXXXXXX, почта → нижний регистр. Иначе 400. */
export function normalizeLogin(raw: string): { kind: LoginKind; value: string } {
  const login = (raw ?? '').trim();
  if (login.includes('@')) {
    const email = login.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Проверьте адрес почты');
    }
    return { kind: 'email', value: email };
  }
  let digits = login.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.slice(1);
  if (digits.length === 10) digits = '7' + digits;
  if (digits.length !== 11 || !digits.startsWith('7')) {
    throw new BadRequestException('Введите номер телефона в формате +7 900 000-00-00 или корпоративную почту');
  }
  return { kind: 'phone', value: '+' + digits };
}

/** Ключ для поиска по номерам: «6L20 ff-118» → «6L20FF118». */
export function numberKey(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/[^0-9A-ZА-Я]/g, '');
}

/** Текст для поиска по словам: нижний регистр, ё → е. Не зависит от локали PostgreSQL. */
export function searchText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

export function maskLogin(kind: LoginKind, value: string): string {
  if (kind === 'email') {
    const [name, domain] = value.split('@');
    return `${name.slice(0, 2)}***@${domain}`;
  }
  // +7 900 ***-**-01
  return `${value.slice(0, 2)} ${value.slice(2, 5)} ***-**-${value.slice(-2)}`;
}

export function formatPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = value.replace(/\D/g, '');
  if (d.length !== 11) return value;
  return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
}
