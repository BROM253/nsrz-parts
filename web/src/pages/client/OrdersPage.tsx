import { RightOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Empty, Segmented } from 'antd';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { OrderSummary, Page } from '../../api/types';
import { itemVariants, listVariants, Skeleton, StatusTag } from '../../components/ui';
import { ago, money, plural } from '../../format';

const FILTERS = [
  { label: 'Все', value: 'ALL' },
  { label: 'В работе', value: 'ACTIVE' },
  { label: 'Завершённые', value: 'COMPLETED' },
  { label: 'Отклонённые', value: 'REJECTED' },
];

export default function OrdersPage() {
  const [status, setStatus] = useState('ALL');
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['orders', status],
    queryFn: () => api.get<Page<OrderSummary>>(`/orders?status=${status}`),
    refetchInterval: 20_000, // статусы меняет НСРЗ — подтягиваем изменения
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 className="section-title">Мои заказы</h1>
          <p className="muted" style={{ margin: 0 }}>
            Заказы всех судов вашей компании. Статусы обновляются автоматически.
          </p>
        </div>
        <Segmented options={FILTERS} value={status} onChange={(v) => setStatus(v as string)} />
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={92} style={{ borderRadius: 18 }} />
          ))}
        </div>
      ) : !data?.items.length ? (
        <div className="card card-pad">
          <Empty description="Заказов пока нет">
            <Link to="/">
              <Button type="primary">Найти запчасти</Button>
            </Link>
          </Empty>
        </div>
      ) : (
        <motion.div key={status} variants={listVariants} initial="hidden" animate="show" style={{ display: 'grid', gap: 12 }}>
          {data.items.map((o) => (
            <motion.div key={o.id} variants={itemVariants} whileHover={{ x: 4 }}>
              <div className="card" style={{ padding: '18px 22px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }} onClick={() => navigate(`/orders/${o.id}`)}>
                <div style={{ minWidth: 170 }}>
                  <div className="mono" style={{ fontSize: 17, color: 'var(--primary)' }}>
                    {o.number}
                  </div>
                  <div className="faint" style={{ fontSize: 13 }}>
                    {ago(o.createdAt)}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ fontWeight: 600 }}>{o.vessel.name}</div>
                  <div className="muted" style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 520 }}>
                    {o.preview.join(', ')}
                    {o.itemsCount > o.preview.length ? ` и ещё ${o.itemsCount - o.preview.length}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 120 }}>
                  <div style={{ fontWeight: 700 }}>{money(o.total)}</div>
                  <div className="faint" style={{ fontSize: 13 }}>
                    {o.itemsCount} {plural(o.itemsCount, 'позиция', 'позиции', 'позиций')}
                  </div>
                </div>
                <div style={{ minWidth: 200, textAlign: 'right' }}>
                  <StatusTag status={o.status} title={o.statusTitle} />
                </div>
                <RightOutlined className="faint" />
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
