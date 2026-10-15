import { SearchOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Input, Segmented, Table } from 'antd';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { OrderStatus, StaffOrdersPage } from '../../api/types';
import { ease, StatusTag } from '../../components/ui';
import { ago, money } from '../../format';

export default function QueuePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('PENDING');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['panel', 'orders', status, q, page],
    queryFn: () => api.get<StaffOrdersPage>(`/panel/orders?status=${status}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });
  const counts = data?.counts;
  const c = (s: OrderStatus[]) => (counts ? s.reduce((a, k) => a + counts[k], 0) : 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Ожидают подтверждения', value: c(['PENDING']), color: 'var(--warning)' },
          { label: 'В работе', value: c(['CONFIRMED', 'ASSEMBLING', 'READY']), color: 'var(--teal)' },
          { label: 'Завершено', value: c(['COMPLETED']), color: 'var(--success)' },
          { label: 'Отклонено', value: c(['REJECTED']), color: 'var(--danger)' },
        ].map((k, i) => (
          <motion.div key={k.label} className="kpi" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.35, ease }}>
            <div className="label">{k.label}</div>
            <div className="value" style={{ color: k.color }}>
              {k.value}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="card card-pad">
        <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 16 }}>
          <Segmented
            value={status}
            onChange={(v) => {
              setStatus(v as string);
              setPage(1);
            }}
            options={[
              { label: `Ожидают · ${c(['PENDING'])}`, value: 'PENDING' },
              { label: 'В работе', value: 'ACTIVE' },
              { label: 'Готовы к выдаче', value: 'READY' },
              { label: 'Все', value: 'ALL' },
              { label: 'Отклонённые', value: 'REJECTED' },
            ]}
          />
          <Input allowClear prefix={<SearchOutlined className="faint" />} placeholder="Номер, компания или судно" style={{ width: 300 }} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <Table
          rowKey="id"
          loading={isLoading}
          dataSource={data?.items}
          rowClassName={(o) => (Date.now() - new Date(o.createdAt).getTime() < 10 * 60_000 && o.status === 'PENDING' ? 'row-new' : '')}
          onRow={(o) => ({ onClick: () => navigate(`/panel/orders/${o.id}`), style: { cursor: 'pointer' } })}
          pagination={{ current: page, pageSize: data?.pageSize ?? 20, total: data?.total, onChange: setPage, showSizeChanger: false }}
          locale={{ emptyText: status === 'PENDING' ? 'Очередь пуста — все заказы обработаны 🎉' : 'Заказов нет' }}
          columns={[
            {
              title: 'Заказ',
              render: (_, o) => (
                <div>
                  <div className="mono" style={{ color: 'var(--primary)', fontSize: 15 }}>
                    {o.number}
                  </div>
                  <div className="faint" style={{ fontSize: 12.5 }}>
                    {ago(o.createdAt)}
                  </div>
                </div>
              ),
            },
            { title: 'Компания', render: (_, o) => <div><div style={{ fontWeight: 600 }}>{o.company.name}</div><div className="faint" style={{ fontSize: 12.5 }}>{o.createdBy.fullName}</div></div> },
            { title: 'Судно', dataIndex: ['vessel', 'name'] },
            { title: 'Позиции', render: (_, o) => <span className="muted" style={{ fontSize: 13.5 }}>{o.preview.join(', ')}{o.itemsCount > o.preview.length ? ` +${o.itemsCount - o.preview.length}` : ''}</span> },
            { title: 'Сумма', align: 'right', render: (_, o) => <b>{money(o.total)}</b> },
            { title: 'Статус', render: (_, o) => <StatusTag status={o.status} title={o.statusTitle} /> },
          ]}
        />
      </div>
    </motion.div>
  );
}
