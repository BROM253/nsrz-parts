import { useQuery } from '@tanstack/react-query';
import { Progress, Segmented, Tooltip } from 'antd';
import { motion } from 'motion/react';
import { useState } from 'react';
import { api } from '../../api/client';
import type { OrderStatus } from '../../api/types';
import { CountUp, ease, Skeleton } from '../../components/ui';
import { money } from '../../format';

interface Stats {
  totals: { all: number; pending: number; active: number; completed: number; rejected: number };
  avgConfirmMinutes: number | null;
  confirmedWithin4h: number | null;
  completedTotal30d: number;
  byDay: { date: string; count: number; total: number }[];
  byStatus: { status: OrderStatus; title: string; count: number }[];
  topParts: { partId: number; name: string; catalogNumber: string; quantity: number }[];
  lowStock: { partId: number; name: string; catalogNumber: string; available: number; reserved: number }[];
}

const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING: '#D9922E',
  CONFIRMED: '#2F5D73',
  ASSEMBLING: '#B4532A',
  READY: '#7A5C99',
  COMPLETED: '#4E7D3A',
  REJECTED: '#A8392C',
};

const fmtMinutes = (m: number) => (m < 60 ? `${Math.round(m)} мин` : `${Math.floor(m / 60)} ч ${Math.round(m % 60)} мин`);

export default function StatsPage() {
  const [days, setDays] = useState(14);
  const { data } = useQuery({ queryKey: ['panel', 'stats', days], queryFn: () => api.get<Stats>(`/panel/stats?days=${days}`), refetchInterval: 30_000 });

  if (!data) return <Skeleton height={500} />;
  const max = Math.max(1, ...data.byDay.map((d) => d.count));
  const statusTotal = data.byStatus.reduce((s, b) => s + b.count, 0) || 1;

  const kpis = [
    { label: 'Всего заказов', value: <CountUp value={data.totals.all} /> },
    { label: 'Ждут подтверждения', value: <CountUp value={data.totals.pending} />, color: 'var(--warning)' },
    { label: 'В работе', value: <CountUp value={data.totals.active} />, color: 'var(--teal)' },
    { label: 'Выдано за 30 дней', value: <CountUp value={data.completedTotal30d} format={(v) => money(Math.round(v))} />, color: 'var(--success)' },
  ];

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {kpis.map((k, i) => (
          <motion.div key={k.label} className="kpi" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.4, ease }}>
            <div className="label">{k.label}</div>
            <div className="value" style={{ color: k.color }}>
              {k.value}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="two-col" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 20 }}>
        <motion.div className="card card-pad" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4, ease }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Заказы по дням</h3>
            <Segmented value={days} onChange={(v) => setDays(v as number)} options={[{ label: '14 дней', value: 14 }, { label: '30 дней', value: 30 }]} />
          </div>
          <div className="bars">
            {data.byDay.map((d, i) => (
              <Tooltip key={d.date} title={`${new Date(d.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}: ${d.count} зак., ${money(d.total)}`}>
                <div className="bar-col">
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>{d.count || ''}</span>
                  <motion.div className="bar" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.25 + i * 0.025, duration: 0.6, ease }} style={{ height: `${(d.count / max) * 150 + 3}px`, opacity: d.count ? 1 : 0.25 }} />
                  <span className="bar-label">{new Date(d.date).getDate()}</span>
                </div>
              </Tooltip>
            ))}
          </div>
        </motion.div>

        <motion.div className="card card-pad" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.4, ease }}>
          <h3 style={{ marginTop: 0 }}>Скорость подтверждения</h3>
          <p className="muted" style={{ fontSize: 14 }}>Цель ТЗ: цикл «поиск — подтверждение» не более 4 часов в рабочее время.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <Progress type="dashboard" percent={data.confirmedWithin4h ?? 0} strokeColor={{ '0%': '#D9922E', '100%': '#4E7D3A' }} size={120} format={(p) => <span style={{ fontSize: 20, fontWeight: 700 }}>{p}%</span>} />
            <div>
              <div className="faint" style={{ fontSize: 13 }}>в пределах 4 часов</div>
              <div style={{ fontSize: 13, marginTop: 8 }} className="faint">
                Среднее время
              </div>
              <b style={{ fontSize: 20 }}>{data.avgConfirmMinutes !== null ? fmtMinutes(data.avgConfirmMinutes) : '—'}</b>
            </div>
          </div>
          <h4 style={{ margin: '22px 0 10px' }}>Статусы</h4>
          <div style={{ display: 'flex', height: 14, borderRadius: 8, overflow: 'hidden', background: 'var(--border)' }}>
            {data.byStatus.filter((b) => b.count).map((b, i) => (
              <Tooltip key={b.status} title={`${b.title}: ${b.count}`}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${(b.count / statusTotal) * 100}%` }} transition={{ delay: 0.3 + i * 0.08, duration: 0.6, ease }} style={{ background: STATUS_COLOR[b.status] }} />
              </Tooltip>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 12, fontSize: 13 }}>
            {data.byStatus.map((b) => (
              <span key={b.status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: STATUS_COLOR[b.status] }} />
                {b.title}: <b>{b.count}</b>
              </span>
            ))}
          </div>
        </motion.div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        <motion.div className="card card-pad" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.4, ease }}>
          <h3 style={{ marginTop: 0 }}>Чаще всего заказывают (30 дней)</h3>
          {data.topParts.map((p, i) => (
            <div key={p.partId} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span>{p.name}</span>
                <b>{p.quantity}</b>
              </div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 4, marginTop: 4 }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${(p.quantity / (data.topParts[0]?.quantity || 1)) * 100}%` }} transition={{ delay: 0.4 + i * 0.07, duration: 0.6, ease }} style={{ height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #D9922E, #B4532A)' }} />
              </div>
            </div>
          ))}
        </motion.div>
        <motion.div className="card card-pad" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.4, ease }}>
          <h3 style={{ marginTop: 0 }}>Заканчивается на складе</h3>
          {data.lowStock.length === 0 && <p className="muted">Все позиции в достатке.</p>}
          {data.lowStock.map((p) => (
            <div key={p.partId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px dashed var(--border)' }}>
              <span>
                {p.name}
                <div className="mono faint" style={{ fontSize: 12 }}>
                  {p.catalogNumber}
                </div>
              </span>
              <span style={{ textAlign: 'right' }}>
                <b style={{ color: p.available ? 'var(--warning)' : 'var(--danger)' }}>{p.available} свободно</b>
                {p.reserved > 0 && <div className="faint" style={{ fontSize: 12 }}>в резерве {p.reserved}</div>}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
