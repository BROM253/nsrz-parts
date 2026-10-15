import { Tag } from 'antd';
import { animate, AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';
import { ReactNode, useEffect, useRef } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import type { OrderStatus, StockView } from '../api/types';
import { fmtDateTime } from '../format';

export const ease = [0.22, 0.8, 0.36, 1] as const;

/** Логотип: якорь в тёплом квадрате. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="brand-logo" style={{ width: size, height: size }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 40 40" fill="none" stroke="#FFF7EF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="20" cy="8" r="3.5" />
        <path d="M20 11.5v22M13 17h14M7 24c1.5 6 6.5 9.5 13 9.5S31.5 30 33 24" />
        <path d="M5 26l2-2.5 3 2.2M35 26l-2-2.5-3 2.2" />
      </svg>
    </span>
  );
}

const ICONS: Record<string, ReactNode> = {
  engine: <path d="M6 14h4l2-3h8l2 3h3v4h2v-2h2v8h-2v-2h-2v4h-3l-2 2h-9l-2-3H6z" />,
  generator: (
    <>
      <circle cx="16" cy="16" r="9" />
      <path d="M17 10l-4 7h5l-3 6" />
    </>
  ),
  pump: (
    <>
      <circle cx="13" cy="17" r="7" />
      <path d="M13 10V5h6M20 17h7M27 13v8M13 14v6M10 17h6" />
    </>
  ),
  filter: <path d="M5 7h22l-8.5 10v8l-5 2V17z" />,
  propeller: (
    <>
      <circle cx="16" cy="16" r="2.5" />
      <path d="M16 13.5C14 9 15 5 18 4c2 2 1 6-2 9.5zM18.2 17.3c4.6 1.8 7 5.1 6 8-2.8.4-5.5-2.5-6-8zM13.6 17.2c-3.8 3.1-7.8 3.6-9.3 1-.1-2.7 3.6-4 9.3-1z" />
    </>
  ),
  electric: <path d="M18 3L8 18h7l-2 11 11-16h-7z" />,
  deck: (
    <>
      <circle cx="16" cy="9" r="3" />
      <path d="M16 12v14M10 16h12M6 21c1 4 5 6 10 6s9-2 10-6" />
    </>
  ),
  navigation: (
    <>
      <circle cx="16" cy="16" r="11" />
      <path d="M16 8l3.5 8L16 24l-3.5-8z" />
    </>
  ),
};

export function CategoryIcon({ icon, size = 44, big = false }: { icon?: string | null; size?: number; big?: boolean }) {
  return (
    <span className={`cat-icon${big ? ' big' : ''}`}>
      <svg width={big ? 48 : size * 0.55} height={big ? 48 : size * 0.55} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[icon ?? ''] ?? ICONS.engine}
      </svg>
    </span>
  );
}

/** Наличие: цвет + значок + текст (не только цвет — ТЗ, доступность). */
export function AvailabilityBadge({ stock, unit = 'шт.', lead }: { stock: StockView; unit?: string; lead?: number }) {
  if (stock.allReserved) {
    return <span className="avail avail-res">⏸ Всё в резерве</span>;
  }
  if (stock.availability === 'IN_STOCK') {
    return (
      <span className="avail avail-in">
        ✓ В наличии · {stock.available} {unit}
      </span>
    );
  }
  if (stock.availability === 'ON_ORDER') {
    return <span className="avail avail-ord">◷ Под заказ{lead ? ` · ${lead} дн.` : ''}</span>;
  }
  return <span className="avail avail-out">✕ Нет на складе</span>;
}

const STATUS_COLORS: Record<OrderStatus, { bg: string; fg: string; icon: string }> = {
  PENDING: { bg: '#FBEBD3', fg: '#A8660F', icon: '◷' },
  CONFIRMED: { bg: '#E3EDF0', fg: '#2F5D73', icon: '✓' },
  ASSEMBLING: { bg: '#F6E3D6', fg: '#9C4422', icon: '⚙' },
  READY: { bg: '#EDE6F4', fg: '#5E4479', icon: '⇪' },
  COMPLETED: { bg: '#E7F0DF', fg: '#4E7D3A', icon: '★' },
  REJECTED: { bg: '#F8E1DC', fg: '#A8392C', icon: '✕' },
};

export function StatusTag({ status, title }: { status: OrderStatus; title: string }) {
  const s = STATUS_COLORS[status];
  return (
    <Tag bordered={false} style={{ background: s.bg, color: s.fg, fontWeight: 600, borderRadius: 999, padding: '2px 12px', fontSize: 13 }}>
      {s.icon} {title}
    </Tag>
  );
}

/** Счётчик количества с ограничением по остатку. */
export function Stepper({ value, min = 1, max, onChange, disabled }: { value: number; min?: number; max: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <span className="stepper" aria-label="Количество">
      <button type="button" aria-label="Меньше" disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} className="value" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ duration: 0.16 }}>
          {value}
        </motion.span>
      </AnimatePresence>
      <button type="button" aria-label="Больше" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  );
}

/** Шкала статуса заказа: 5 шагов, заполняется анимацией. */
export function StatusTimeline({ timeline, rejected }: { timeline: { status: OrderStatus; title: string; done: boolean; current: boolean; at: string | null }[]; rejected?: boolean }) {
  const lastDone = timeline.reduce((acc, s, i) => (s.done ? i : acc), 0);
  return (
    <div className="timeline">
      <div className="timeline-track">
        <motion.div className="timeline-fill" initial={{ scaleX: 0 }} animate={{ scaleX: lastDone / (timeline.length - 1) }} transition={{ duration: 0.9, ease }} style={rejected ? { background: '#C9B8A8' } : undefined} />
      </div>
      {timeline.map((s, i) => (
        <div key={s.status} className={`timeline-step${s.done ? ' done' : ''}${s.current ? ' current' : ''}`}>
          <motion.div className="timeline-dot" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.12 * i, type: 'spring', stiffness: 380, damping: 22 }}>
            {s.done ? '✓' : i + 1}
          </motion.div>
          <div className="timeline-title">{s.title}</div>
          <div className="timeline-at">{s.at ? fmtDateTime(s.at) : ' '}</div>
        </div>
      ))}
    </div>
  );
}

/** Плавная смена страниц. */
export function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  const frozen = useRef(outlet);
  frozen.current = outlet;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={location.pathname} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease }}>
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}

/** Анимированная галочка «заказ отправлен». */
export function SuccessCheck() {
  return (
    <svg className="success-check" viewBox="0 0 120 120">
      <motion.circle cx="60" cy="60" r="52" fill="#E7F0DF" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 16 }} style={{ originX: '60px', originY: '60px' }} />
      <motion.circle cx="60" cy="60" r="52" fill="none" stroke="#4E7D3A" strokeWidth="5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease, delay: 0.1 }} />
      <motion.path d="M38 62l15 15 30-32" fill="none" stroke="#4E7D3A" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, ease, delay: 0.55 }} />
    </svg>
  );
}

/** Число, которое «набегает» при появлении. */
export function CountUp({ value, format = (v: number) => Math.round(v).toLocaleString('ru-RU') }: { value: number; format?: (v: number) => string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 1.1, ease });
    return () => controls.stop();
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

/** Декоративные волны. */
export function Waves({ className, color = '#B4532A' }: { className?: string; color?: string }) {
  return (
    <svg className={className} viewBox="0 0 460 200" fill="none">
      {[0, 1, 2, 3].map((i) => (
        <motion.path
          key={i}
          d={`M0 ${70 + i * 30} C 80 ${40 + i * 30}, 150 ${100 + i * 30}, 230 ${70 + i * 30} S 380 ${40 + i * 30}, 460 ${70 + i * 30}`}
          stroke={color}
          strokeOpacity={0.35 - i * 0.06}
          strokeWidth={2}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1, x: [0, -12, 0] }}
          transition={{ pathLength: { duration: 1.6, delay: i * 0.15, ease }, x: { duration: 6 + i, repeat: Infinity, ease: 'easeInOut' } }}
        />
      ))}
    </svg>
  );
}

export function Skeleton({ height = 20, width = '100%', style }: { height?: number; width?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height, width, ...style }} />;
}

/** Плашка «остатки на …» с пульсирующей точкой. */
export function SyncPill({ at }: { at: string | null | undefined }) {
  return (
    <span className="pill pill-sync" title="Время последнего обновления остатков склада НСРЗ">
      <span className="pulse-dot" /> Остатки на {fmtDateTime(at)}
    </span>
  );
}

export const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045 } },
};

export const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease } },
};
