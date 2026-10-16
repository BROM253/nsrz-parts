import { CheckCircleFilled, WarningFilled } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Table, Tooltip } from 'antd';
import { motion } from 'motion/react';
import { api } from '../../api/client';
import { ease, Skeleton } from '../../components/ui';
import { ago, fmtDateTime } from '../../format';

/** Панель НСРЗ: мониторинг (этап 7) — сбои, ошибки и производительность. Только для администратора. */

interface Summary {
  requests: number;
  perMinute: number;
  errors5xx: number;
  errors4xx: number;
  p50: number;
  p95: number;
  p99: number;
}
interface Span {
  all: number | null;
  work: number | null;
  checks: number;
}
interface Monitoring {
  version: string;
  status: 'ok' | 'degraded';
  problems: string[];
  db: { ok: boolean; ms: number };
  backup: { last: string | null; ageHours: number | null };
  support: { new: number; inProgress: number };
  startedAt: string;
  uptimeSec: number;
  memoryMb: number;
  hour: Summary;
  day: Summary;
  perMinute: { at: string; requests: number; errors: number }[];
  slowRoutes: { route: string; requests: number; p50: number; p95: number }[];
  errors: { at: string; method: string; route: string; status: number; message: string }[];
  availability: {
    checks: number;
    lastCheck: { at: string; local: { ok: boolean; ms: number }; public: { ok: boolean; ms: number } | null } | null;
    day: Span | null;
    week: Span | null;
    incidents: { kind: string; event: string; start: string; end?: string; minutes?: number }[];
  };
}

const TARGET = 99; // ТЗ п. 4.4: доступность не ниже 99 % в 8:00–20:00 МСК
const pctText = (v: number | null | undefined) => (v === null || v === undefined ? 'нет данных' : `${v.toLocaleString('ru-RU')} %`);
const uptimeText = (s: number) => (s < 3600 ? `${Math.round(s / 60)} мин` : s < 86400 ? `${Math.floor(s / 3600)} ч ${Math.round((s % 3600) / 60)} мин` : `${Math.floor(s / 86400)} дн ${Math.floor((s % 86400) / 3600)} ч`);

export default function MonitoringPage() {
  const { data, dataUpdatedAt } = useQuery({ queryKey: ['admin', 'monitoring'], queryFn: () => api.get<Monitoring>('/admin/monitoring'), refetchInterval: 15_000 });
  if (!data) return <Skeleton height={520} />;

  const ok = data.status === 'ok';
  const week = data.availability.week;
  const max = Math.max(1, ...data.perMinute.map((m) => m.requests));
  const kpis = [
    { title: 'Доступность в рабочее время, 7 дней', value: pctText(week?.work ?? week?.all), hint: `цель ТЗ — не ниже ${TARGET} % · проверок: ${week?.checks ?? 0}`, good: (week?.work ?? week?.all ?? 100) >= TARGET },
    { title: 'Время ответа API, p95 за час', value: `${data.hour.p95.toLocaleString('ru-RU')} мс`, hint: `медиана ${data.hour.p50} мс · p99 ${data.hour.p99} мс`, good: data.hour.p95 < 500 },
    { title: 'Ошибки сервера (5xx) за сутки', value: String(data.day.errors5xx), hint: `запросов за сутки: ${data.day.requests.toLocaleString('ru-RU')}`, good: data.day.errors5xx === 0 },
    { title: 'Резервная копия', value: data.backup.ageHours === null ? 'нет' : `${data.backup.ageHours} ч назад`, hint: data.backup.last ? fmtDateTime(data.backup.last) : 'не делалась', good: data.backup.ageHours !== null && data.backup.ageHours <= 25 },
  ];

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <motion.div
        className="card card-pad"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ease }}
        style={{ display: 'flex', alignItems: 'center', gap: 16, borderLeft: `5px solid ${ok ? 'var(--success)' : 'var(--danger)'}` }}
      >
        {ok ? <CheckCircleFilled style={{ fontSize: 34, color: 'var(--success)' }} /> : <WarningFilled style={{ fontSize: 34, color: 'var(--danger)' }} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{ok ? 'Система работает нормально' : 'Требует внимания'}</div>
          <div className="muted" style={{ fontSize: 14 }}>
            {ok ? 'База данных, сервер, резервные копии и адрес в интернете — в порядке' : data.problems.join('; ')}
          </div>
        </div>
        <div className="faint" style={{ fontSize: 13, textAlign: 'right' }}>
          версия {data.version} · работает {uptimeText(data.uptimeSec)}
          <br />
          база {data.db.ms} мс · память {data.memoryMb} МБ · обновлено {ago(new Date(dataUpdatedAt).toISOString())}
        </div>
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }} className="kpi-grid">
        {kpis.map((k, i) => (
          <motion.div key={k.title} className="card card-pad" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, ease }}>
            <div className="faint" style={{ fontSize: 13 }}>{k.title}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: k.good ? 'var(--success)' : 'var(--danger)', margin: '4px 0' }}>{k.value}</div>
            <div className="faint" style={{ fontSize: 12.5 }}>{k.hint}</div>
          </motion.div>
        ))}
      </div>

      <div className="card card-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Запросы за последний час</h3>
          <span className="faint" style={{ fontSize: 13 }}>
            {data.hour.requests.toLocaleString('ru-RU')} запросов · {data.hour.perMinute} в минуту · ошибок 4xx: {data.hour.errors4xx}, 5xx: {data.hour.errors5xx}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120, marginTop: 14 }}>
          {data.perMinute.map((m) => (
            <Tooltip key={m.at} title={`${new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}: ${m.requests} запр.${m.errors ? `, ошибок ${m.errors}` : ''}`}>
              <div style={{ flex: 1, height: `${Math.max(2, (m.requests / max) * 100)}%`, background: m.errors ? 'var(--danger)' : 'var(--primary)', opacity: m.requests ? 0.9 : 0.25, borderRadius: '3px 3px 0 0' }} />
            </Tooltip>
          ))}
        </div>
        <div className="faint" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
          <span>60 минут назад</span>
          <span>сейчас</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18 }} className="two-col">
        <div className="card card-pad">
          <h3 style={{ marginTop: 0 }}>Самые медленные запросы за сутки</h3>
          <Table
            size="small"
            rowKey="route"
            pagination={false}
            dataSource={data.slowRoutes}
            locale={{ emptyText: 'Пока мало данных' }}
            columns={[
              { title: 'Запрос', render: (_, r) => <span className="mono" style={{ fontSize: 12.5 }}>{r.route}</span> },
              { title: 'Кол-во', dataIndex: 'requests', width: 70, align: 'right' },
              { title: 'p95, мс', dataIndex: 'p95', width: 80, align: 'right' },
            ]}
          />
        </div>
        <div className="card card-pad">
          <h3 style={{ marginTop: 0 }}>Доступность и инциденты</h3>
          <div style={{ display: 'grid', gap: 6, fontSize: 14.5, marginBottom: 12 }}>
            <div>За сутки: <b>{pctText(data.availability.day?.all)}</b> (в рабочее время — {pctText(data.availability.day?.work)})</div>
            <div>За 7 дней: <b>{pctText(week?.all)}</b> (в рабочее время — {pctText(week?.work)})</div>
            <div className="faint" style={{ fontSize: 13 }}>
              {data.availability.lastCheck
                ? `Последняя проверка ${ago(data.availability.lastCheck.at)}: сервер ${data.availability.lastCheck.local.ms} мс, адрес в интернете ${data.availability.lastCheck.public ? (data.availability.lastCheck.public.ok ? `${data.availability.lastCheck.public.ms} мс` : 'не отвечает') : '—'}`
                : 'Сторож доступности не запущен (scripts/monitor.mjs запускается из start-server.cmd)'}
            </div>
          </div>
          {data.availability.incidents.length ? (
            data.availability.incidents.map((i, n) => (
              <div key={n} style={{ fontSize: 13.5, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                {i.event === 'down' ? '⚠ ' : '✓ '}
                {i.kind === 'public' ? 'Адрес в интернете' : 'Сервер на ПК'}: {i.event === 'down' ? `не отвечает с ${fmtDateTime(i.start)}` : `восстановлен ${fmtDateTime(i.end)}, простой ${i.minutes} мин`}
              </div>
            ))
          ) : (
            <div className="faint" style={{ fontSize: 13.5 }}>Инцидентов не было</div>
          )}
        </div>
      </div>

      <div className="card card-pad">
        <h3 style={{ marginTop: 0 }}>Журнал ошибок сервера</h3>
        <Table
          size="small"
          rowKey={(e) => e.at + e.route}
          pagination={false}
          dataSource={data.errors}
          locale={{ emptyText: 'Ошибок нет' }}
          columns={[
            { title: 'Время', width: 150, render: (_, e) => fmtDateTime(e.at) },
            { title: 'Запрос', width: 260, render: (_, e) => <span className="mono" style={{ fontSize: 12.5 }}>{e.method} {e.route}</span> },
            { title: 'Ошибка', render: (_, e) => <span style={{ fontSize: 13 }}>{e.message}</span> },
          ]}
        />
        <p className="faint" style={{ fontSize: 13, marginBottom: 0 }}>
          При 5 и более ошибках за 5 минут администратору уходит письмо. Обращения пользователей: новых {data.support.new}, в работе {data.support.inProgress}.
        </p>
      </div>
    </div>
  );
}
