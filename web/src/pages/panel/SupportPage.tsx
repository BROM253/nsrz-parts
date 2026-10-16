import { CustomerServiceOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Drawer, Empty, Input, Segmented, Table } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { StatusPill, type SupportStatus, type Ticket } from '../../components/Support';
import { fmtDateTime } from '../../format';

/** Панель НСРЗ: обращения судовладельцев (техподдержка, этап 7). */

interface TicketsPage {
  items: Ticket[];
  counts: Record<SupportStatus, number>;
}

const FILTERS = [
  { value: 'OPEN', label: 'Открытые' },
  { value: 'NEW', label: 'Новые' },
  { value: 'IN_PROGRESS', label: 'В работе' },
  { value: 'RESOLVED', label: 'Решённые' },
  { value: 'ALL', label: 'Все' },
];
const PLATFORMS: Record<string, string> = { android: 'Android', iphone: 'iPhone', web: 'сайт' };

export const useSupportQueue = (status = 'OPEN') =>
  useQuery({ queryKey: ['panel', 'support', status], queryFn: () => api.get<TicketsPage>(`/panel/support?status=${status}`), refetchInterval: 20_000, placeholderData: keepPreviousData });

export default function SupportPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [status, setStatus] = useState('OPEN');
  const [openId, setOpenId] = useState<number | null>(null);
  const [reply, setReply] = useState('');
  const { data, isLoading } = useSupportQueue(status);
  const open = data?.items.find((t) => t.id === openId) ?? null;

  const save = useMutation({
    mutationFn: (body: { status?: SupportStatus; reply?: string }) => api.patch<Ticket>(`/panel/support/${openId}`, body),
    onSuccess: (t, body) => {
      message.success(body.reply ? `Ответ на ${t.number} отправлен заказчику` : `${t.number}: «${t.statusTitle}»`);
      qc.invalidateQueries({ queryKey: ['panel', 'support'] });
      if (body.reply) {
        setReply('');
        setOpenId(null);
      }
    },
    onError: (e) => message.error((e as ApiError).message),
  });

  const c = data?.counts;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
        {[
          ['Новые', c?.NEW, 'var(--warning)'],
          ['В работе', c?.IN_PROGRESS, 'var(--teal)'],
          ['Решено', c?.RESOLVED, 'var(--success)'],
        ].map(([title, n, color]) => (
          <div key={title as string} className="card card-pad">
            <div className="faint" style={{ fontSize: 13 }}>{title}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: color as string }}>{n ?? '—'}</div>
          </div>
        ))}
      </div>

      <div className="card card-pad">
        <div style={{ marginBottom: 14 }}>
          <Segmented options={FILTERS} value={status} onChange={(v) => setStatus(v as string)} />
        </div>
        <Table
          rowKey="id"
          loading={isLoading}
          dataSource={data?.items}
          locale={{ emptyText: <Empty description="Обращений нет" /> }}
          pagination={false}
          onRow={(t) => ({ onClick: () => { setOpenId(t.id); setReply(t.reply ?? ''); }, style: { cursor: 'pointer' } })}
          rowClassName="row-appear"
          columns={[
            { title: 'Номер', width: 130, render: (_, t) => <b className="mono" style={{ color: 'var(--primary)' }}>{t.number}</b> },
            { title: 'Поступило', width: 150, render: (_, t) => <span style={{ fontSize: 13 }}>{fmtDateTime(t.createdAt)}</span> },
            { title: 'Заказчик', render: (_, t) => <div><div style={{ fontWeight: 600 }}>{t.company?.name ?? '—'}</div><div className="faint" style={{ fontSize: 12.5 }}>{t.user?.fullName}</div></div> },
            { title: 'Тема', width: 170, render: (_, t) => t.categoryTitle },
            { title: 'Сообщение', render: (_, t) => <span style={{ fontSize: 13.5 }}>{t.message.length > 90 ? t.message.slice(0, 90) + '…' : t.message}</span> },
            { title: 'Статус', width: 140, render: (_, t) => <StatusPill status={t.status} title={t.statusTitle} /> },
          ]}
        />
      </div>

      <Drawer open={!!open} onClose={() => setOpenId(null)} width={560} title={open ? <span><CustomerServiceOutlined /> Обращение {open.number}</span> : ''}>
        {open && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span className="muted">{open.categoryTitle} · {fmtDateTime(open.createdAt)}</span>
              <StatusPill status={open.status} title={open.statusTitle} />
            </div>
            <div className="card card-pad" style={{ background: 'var(--surface-warm)' }}>
              <div style={{ fontWeight: 600 }}>{open.company?.name ?? '—'}</div>
              <div>{open.user?.fullName}</div>
              <div className="muted" style={{ fontSize: 13.5, display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
                {open.user?.phone && <span><PhoneOutlined /> {open.user.phone}</span>}
                {open.user?.email && <span><MailOutlined /> {open.user.email}</span>}
              </div>
              <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>
                Отправлено: {PLATFORMS[open.platform ?? ''] ?? 'неизвестно'}
                {open.order && (
                  <>
                    {' · '}заказ <Link to={`/panel/orders/${open.order.id}`}>{open.order.number}</Link>
                  </>
                )}
              </div>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 15.5 }}>{open.message}</div>
            {open.reply && open.status === 'RESOLVED' && (
              <div style={{ padding: '10px 14px', borderLeft: '3px solid var(--success)', background: 'var(--success-soft)', borderRadius: 8 }}>
                <b>Ответ</b> <span className="faint" style={{ fontSize: 13 }}>{open.repliedBy} · {open.repliedAt ? fmtDateTime(open.repliedAt) : ''}</span>
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{open.reply}</div>
              </div>
            )}
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{open.reply ? 'Изменить ответ' : 'Ответ заказчику'}</div>
              <Input.TextArea rows={5} maxLength={2000} showCount value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Ответ придёт заказчику по SMS или на почту и появится в его профиле" />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button type="primary" disabled={reply.trim().length < 2} loading={save.isPending && !!save.variables?.reply} onClick={() => save.mutate({ reply: reply.trim() })}>
                Ответить и закрыть
              </Button>
              {open.status === 'NEW' && (
                <Button loading={save.isPending && save.variables?.status === 'IN_PROGRESS'} onClick={() => save.mutate({ status: 'IN_PROGRESS' })}>
                  Взять в работу
                </Button>
              )}
              {open.status === 'RESOLVED' && (
                <Button onClick={() => save.mutate({ status: 'IN_PROGRESS' })}>Открыть снова</Button>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
