import type { Tokens } from './types';

const KEY = 'nsrz.tokens';

let tokens: Tokens | null = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
})();

let onSessionExpired: (() => void) | null = null;
export const setSessionExpiredHandler = (fn: () => void) => (onSessionExpired = fn);

export function setTokens(next: Tokens | null) {
  tokens = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    /* приватный режим браузера — живём без сохранения */
  }
}

export const getTokens = () => tokens;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: any = {},
  ) {
    super(message);
  }
  get code(): string | undefined {
    return this.body?.code;
  }
}

let refreshing: Promise<boolean> | null = null;

/** Обновить access-токен по refresh-токену. Параллельные запросы ждут одно обновление. */
function refresh(): Promise<boolean> {
  if (!tokens?.refreshToken) return Promise.resolve(false);
  refreshing ??= fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const body = await res.json();
      setTokens({ accessToken: body.accessToken, refreshToken: body.refreshToken });
      return true;
    })
    .catch(() => false)
    .finally(() => (refreshing = null));
  return refreshing;
}

async function send(method: string, path: string, body?: unknown, form?: FormData): Promise<Response> {
  const run = () =>
    fetch(`/api${path}`, {
      method,
      headers: {
        ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });

  let res: Response;
  try {
    res = await run();
  } catch {
    throw new ApiError(0, 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
  }
  if (res.status === 401 && tokens && !path.startsWith('/auth/')) {
    if (await refresh()) res = await run();
    else {
      setTokens(null);
      onSessionExpired?.();
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = Array.isArray(data.message) ? data.message.join('. ') : data.message;
    throw new ApiError(res.status, msg || `Ошибка сервера (${res.status})`, data);
  }
  return res;
}

async function json<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await send(method, path, body);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string) => json<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => json<T>('POST', path, body),
  put: <T>(path: string, body: unknown = {}) => json<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown = {}) => json<T>('PATCH', path, body),
  del: <T>(path: string) => json<T>('DELETE', path),
  upload: async <T>(path: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await send('POST', path, undefined, form);
    return (await res.json()) as T;
  },
  /** Скачать файл (CSV) с авторизацией. */
  download: async (path: string, fallbackName: string) => {
    const res = await send('GET', path);
    const header = res.headers.get('Content-Disposition') ?? '';
    const match = /filename\*=UTF-8''([^;]+)/.exec(header);
    const name = match ? decodeURIComponent(match[1]) : fallbackName;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};
