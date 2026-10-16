import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Мониторинг (этап 7): производительность и ошибки API — в памяти сервера, доступность —
 * из журналов сторожа scripts/monitor.mjs (data/monitoring), который проверяет сервер и туннель раз в минуту.
 */

interface Sample {
  t: number;
  ms: number;
  status: number;
  route: string;
}
export interface ErrorEvent {
  at: string;
  method: string;
  route: string;
  status: number;
  message: string;
}
interface UptimeCheck {
  t: string;
  local: { ok: boolean; ms: number };
  public?: { ok: boolean; ms: number; status?: number };
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const MAX_SAMPLES = 50_000;
const ALERT_WINDOW = 5 * 60_000;
const ALERT_THRESHOLD = 5;
const ALERT_PAUSE = 30 * 60_000;

export function monitoringDir(): string {
  return process.env.MONITORING_DIR ?? join(__dirname, '..', '..', '..', 'data', 'monitoring');
}

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
const round = (v: number) => Math.round(v * 10) / 10;

/** Рабочее время по ТЗ п. 4.4 — 8:00–20:00 по Москве (UTC+3). */
const isWorkHours = (iso: string) => {
  const h = (new Date(iso).getUTCHours() + 3) % 24;
  return h >= 8 && h < 20;
};

@Injectable()
export class MonitoringService {
  private readonly log = new Logger('Мониторинг');
  readonly startedAt = new Date();
  private samples: Sample[] = [];
  private errors: ErrorEvent[] = [];
  private lastAlert = 0;

  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /** Каждый ответ API: путь без номеров (/api/parts/:id), код, время. */
  record(route: string, status: number, ms: number) {
    this.samples.push({ t: Date.now(), ms, status, route });
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    if (status >= 500) this.maybeAlert();
  }

  /** Необработанная ошибка (сбой кода или базы) — в журнал ошибок мониторинга. */
  recordError(e: Omit<ErrorEvent, 'at'>) {
    this.errors.unshift({ at: new Date().toISOString(), ...e, message: e.message.slice(0, 500) });
    this.errors.length = Math.min(this.errors.length, 100);
    this.log.error(`${e.method} ${e.route} → ${e.status}: ${e.message}`);
  }

  private maybeAlert() {
    const now = Date.now();
    const recent = this.samples.filter((s) => s.status >= 500 && now - s.t < ALERT_WINDOW).length;
    if (recent < ALERT_THRESHOLD || now - this.lastAlert < ALERT_PAUSE) return;
    this.lastAlert = now;
    const to = this.config.get('ADMIN_EMAIL', 'admin@nsrz.ru');
    void this.notifications.email(
      to,
      'Сбой сервера НСРЗ',
      `За последние 5 минут ${recent} ошибок сервера (5xx). Проверьте раздел «Мониторинг» в панели НСРЗ и журнал data\\logs\\server-errors.log.`,
    );
  }

  private summary(windowMs: number) {
    const from = Date.now() - windowMs;
    const list = this.samples.filter((s) => s.t >= from);
    const ms = list.map((s) => s.ms).sort((a, b) => a - b);
    const minutes = Math.max(1, Math.min(windowMs, Date.now() - this.startedAt.getTime()) / 60_000);
    return {
      requests: list.length,
      perMinute: round(list.length / minutes),
      errors5xx: list.filter((s) => s.status >= 500).length,
      errors4xx: list.filter((s) => s.status >= 400 && s.status < 500).length,
      p50: round(pct(ms, 0.5)),
      p95: round(pct(ms, 0.95)),
      p99: round(pct(ms, 0.99)),
    };
  }

  private perMinute() {
    const now = Date.now();
    const buckets = Array.from({ length: 60 }, (_, i) => ({ at: new Date(now - (59 - i) * 60_000).toISOString(), requests: 0, errors: 0 }));
    for (const s of this.samples) {
      const idx = 59 - Math.floor((now - s.t) / 60_000);
      if (idx < 0 || idx > 59) continue;
      buckets[idx].requests++;
      if (s.status >= 500) buckets[idx].errors++;
    }
    return buckets;
  }

  private slowRoutes() {
    const from = Date.now() - DAY;
    const by = new Map<string, number[]>();
    for (const s of this.samples) if (s.t >= from) by.set(s.route, [...(by.get(s.route) ?? []), s.ms]);
    return [...by.entries()]
      .filter(([, v]) => v.length >= 5)
      .map(([route, v]) => {
        const sorted = v.sort((a, b) => a - b);
        return { route, requests: v.length, p50: round(pct(sorted, 0.5)), p95: round(pct(sorted, 0.95)) };
      })
      .sort((a, b) => b.p95 - a.p95)
      .slice(0, 6);
  }

  /** Доступность по журналам сторожа: всего и в рабочее время, за сутки и неделю; инциденты. */
  availability() {
    const dir = monitoringDir();
    if (!existsSync(dir)) return { checks: 0, lastCheck: null, day: null, week: null, incidents: [] };
    const weekAgo = Date.now() - 7 * DAY;
    const checks: UptimeCheck[] = [];
    for (const f of readdirSync(dir).filter((n) => /^uptime-\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort().slice(-8)) {
      for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const c = JSON.parse(line) as UptimeCheck;
          if (new Date(c.t).getTime() >= weekAgo) checks.push(c);
        } catch {
          /* неполная строка при записи */
        }
      }
    }
    // доступность для пользователей — через интернет (туннель), если проверялась, иначе — сам сервер
    const up = (c: UptimeCheck) => (c.public ? c.public.ok : c.local.ok);
    const rate = (list: UptimeCheck[]) => (list.length ? round((list.filter(up).length / list.length) * 100) : null);
    const span = (from: number) => {
      const list = checks.filter((c) => new Date(c.t).getTime() >= from);
      return { all: rate(list), work: rate(list.filter((c) => isWorkHours(c.t))), checks: list.length };
    };
    const incidentsFile = join(dir, 'incidents.jsonl');
    const incidents = existsSync(incidentsFile)
      ? readFileSync(incidentsFile, 'utf8')
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => {
            try {
              return JSON.parse(l);
            } catch {
              return null;
            }
          })
          .filter(Boolean)
          .slice(-10)
          .reverse()
      : [];
    const last = checks[checks.length - 1];
    return {
      checks: checks.length,
      lastCheck: last ? { at: last.t, local: last.local, public: last.public ?? null } : null,
      day: span(Date.now() - DAY),
      week: span(weekAgo),
      incidents,
    };
  }

  snapshot() {
    return {
      startedAt: this.startedAt.toISOString(),
      uptimeSec: Math.round((Date.now() - this.startedAt.getTime()) / 1000),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      hour: this.summary(HOUR),
      day: this.summary(DAY),
      perMinute: this.perMinute(),
      slowRoutes: this.slowRoutes(),
      errors: this.errors.slice(0, 20),
      availability: this.availability(),
    };
  }
}
