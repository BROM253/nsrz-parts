import { CheckCircleFilled, ClockCircleOutlined, CustomerServiceOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Modal } from 'antd';
import { motion } from 'motion/react';
import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { fmtDateTime } from '../format';
import { ease } from './ui';

/** Техподдержка (этап 7): обращение из сайта и список «Мои обращения». */

export type SupportCategory = 'QUESTION' | 'BUG' | 'ORDER' | 'IDEA';
export type SupportStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED';
export interface Ticket {
  id: number;
  number: string;
  category: SupportCategory;
  categoryTitle: string;
  message: string;
  status: SupportStatus;
  statusTitle: string;
  reply: string | null;
  repliedAt: string | null;
  repliedBy: string | null;
  order: { id: number; number: string } | null;
  platform: string | null;
  createdAt: string;
  user?: { fullName: string; phone: string | null; email: string | null };
  company?: { id: string; name: string } | null;
}

export const CATEGORIES: { code: SupportCategory; title: string; hint: string }[] = [
  { code: 'QUESTION', title: 'Вопрос по работе', hint: 'как что-то сделать в приложении' },
  { code: 'ORDER', title: 'Вопрос по заказу', hint: 'срок, доставка, состав' },
  { code: 'BUG', title: 'Ошибка', hint: 'что-то не работает или работает не так' },
  { code: 'IDEA', title: 'Предложение', hint: 'чего не хватает, что сделать удобнее' },
];

export const STATUS_COLORS: Record<SupportStatus, { bg: string; fg: string }> = {
  NEW: { bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  IN_PROGRESS: { bg: 'var(--teal-soft)', fg: 'var(--teal)' },
  RESOLVED: { bg: 'var(--success-soft)', fg: 'var(--success)' },
};

export function StatusPill({ status, title }: { status: SupportStatus; title: string }) {
  const c = STATUS_COLORS[status];
  return (
    <span className="pill" style={{ background: c.bg, color: c.fg, fontWeight: 600 }}>
      {status === 'RESOLVED' ? <CheckCircleFilled /> : <ClockCircleOutlined />} {title}
    </span>
  );
}

export const useMyTickets = () => useQuery({ queryKey: ['support', 'mine'], queryFn: () => api.get<Ticket[]>('/support'), refetchInterval: 30_000 });

/** Окно «Сообщить о проблеме / задать вопрос». orderId — если открыто со страницы заказа. */
export function SupportDialog({ open, onClose, order }: { open: boolean; onClose: () => void; order?: { id: number; number: string } }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [category, setCategory] = useState<SupportCategory>(order ? 'ORDER' : 'QUESTION');
  const [text, setText] = useState('');
  const send = useMutation({
    mutationFn: () =>
      api.post<Ticket>('/support', { category, message: text.trim(), orderId: order?.id, platform: 'web', appVersion: import.meta.env.VITE_APP_VERSION }),
    onSuccess: (t) => {
      message.success(`Обращение ${t.number} отправлено. Ответ придёт по SMS и появится в профиле.`, 6);
      qc.invalidateQueries({ queryKey: ['support'] });
      setText('');
      onClose();
    },
    onError: (e) => message.error((e as ApiError).message),
  });
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <span>
          <CustomerServiceOutlined style={{ color: 'var(--primary)' }} /> {order ? `Вопрос по заказу ${order.number}` : 'Помощь и обратная связь'}
        </span>
      }
      okText="Отправить"
      cancelText="Отмена"
      okButtonProps={{ disabled: text.trim().length < 5, loading: send.isPending }}
      onOk={() => send.mutate()}
      width={560}
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Обращение получит отдел продаж НСРЗ. Ответ придёт по SMS или на почту и появится в профиле в разделе «Мои обращения».
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        {CATEGORIES.map((c) => (
          <motion.button
            key={c.code}
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => setCategory(c.code)}
            className={`option-card${category === c.code ? ' on' : ''}`}
            style={{ textAlign: 'left', padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: `1.5px solid ${category === c.code ? 'var(--primary)' : 'var(--border)'}`, background: category === c.code ? 'var(--primary-soft)' : 'var(--surface)' }}
          >
            <b style={{ display: 'block' }}>{c.title}</b>
            <span className="muted" style={{ fontSize: 13 }}>{c.hint}</span>
          </motion.button>
        ))}
      </div>
      <Input.TextArea
        rows={5}
        maxLength={2000}
        showCount
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={category === 'BUG' ? 'Что вы делали и что пошло не так? Например: «нажимаю «Оформить заказ», страница не открывается»' : 'Опишите вопрос'}
      />
    </Modal>
  );
}

/** Список «Мои обращения» в профиле. */
export function MyTickets() {
  const { data } = useMyTickets();
  if (!data?.length) return <p className="faint">Обращений пока нет. Вопрос или предложение — кнопка «Помощь» вверху страницы.</p>;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {data.map((t, i) => (
        <motion.div key={t.id} className="card card-pad" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, ease }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <b className="mono" style={{ color: 'var(--primary)' }}>{t.number}</b>
            <StatusPill status={t.status} title={t.statusTitle} />
          </div>
          <div className="faint" style={{ fontSize: 13, margin: '4px 0 8px' }}>
            {t.categoryTitle} · {fmtDateTime(t.createdAt)}
            {t.order ? ` · заказ ${t.order.number}` : ''}
          </div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{t.message}</div>
          {t.reply && (
            <div style={{ marginTop: 12, padding: '10px 14px', borderLeft: '3px solid var(--success)', background: 'var(--success-soft)', borderRadius: 8 }}>
              <b>Ответ НСРЗ</b> <span className="faint" style={{ fontSize: 13 }}>{t.repliedAt ? fmtDateTime(t.repliedAt) : ''}</span>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{t.reply}</div>
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}

/** Кнопка «Помощь» в шапке сайта. */
export function HelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="text" icon={<CustomerServiceOutlined />} onClick={() => setOpen(true)} aria-label="Помощь">
        <span className="logout-label">Помощь</span>
      </Button>
      <SupportDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
