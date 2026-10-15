import { ArrowLeftOutlined, CheckOutlined, CloseOutlined, DownloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Modal, Radio, Result, Space, Table } from 'antd';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { useDictionaries } from '../../api/hooks';
import type { OrderDetail, OrderStatus } from '../../api/types';
import { AvailabilityBadge, ease, Skeleton, StatusTag, StatusTimeline } from '../../components/ui';
import { fmtDateTime, money } from '../../format';
import { OrderInfo } from '../client/OrderPage';

const ACTIONS: Partial<Record<OrderStatus, { label: string; hint: string }>> = {
  CONFIRMED: { label: 'Подтвердить наличие', hint: 'Склад проверил: всё есть' },
  ASSEMBLING: { label: 'Начать комплектацию', hint: 'Детали собирают на складе' },
  READY: { label: 'Готов к выдаче / отправлен', hint: 'Можно забирать или уже в пути' },
  COMPLETED: { label: 'Завершить — выдан заказчику', hint: 'Товар спишется со склада' },
};

export default function ProcessOrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { message } = App.useApp();
  const { data: dict } = useDictionaries();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState<string>();
  const [other, setOther] = useState('');
  const [justChanged, setJustChanged] = useState<string | null>(null);

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['panel', 'order', id],
    queryFn: () => api.get<OrderDetail>(`/panel/orders/${id}`),
    refetchInterval: 15_000,
  });

  const change = useMutation({
    mutationFn: (body: { status: OrderStatus; reason?: string }) => api.patch<OrderDetail>(`/panel/orders/${id}/status`, body),
    onSuccess: (o) => {
      qc.setQueryData(['panel', 'order', id], o);
      qc.invalidateQueries({ queryKey: ['panel', 'orders'] });
      setJustChanged(o.statusTitle);
      setTimeout(() => setJustChanged(null), 2600);
      message.success(`Статус: «${o.statusTitle}». Заказчик получит уведомление.`);
      setRejectOpen(false);
    },
    onError: (e) => {
      message.error((e as ApiError).message);
      qc.invalidateQueries({ queryKey: ['panel', 'order', id] });
    },
  });

  if (isLoading) return <Skeleton height={480} />;
  if (error || !order) return <Result status="404" title="Заказ не найден" extra={<Button onClick={() => navigate('/panel')}>К очереди</Button>} />;

  const next = order.allowedTransitions.filter((s) => s !== 'REJECTED');
  const canReject = order.allowedTransitions.includes('REJECTED');
  const shortage = order.items.some((i) => i.stock && i.stock.availability === 'IN_STOCK' && i.stock.quantity < i.quantity);

  return (
    <div>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/panel')} style={{ marginLeft: -12, marginBottom: 12 }}>
        К очереди
      </Button>

      <motion.div className="card card-pad" style={{ padding: 28 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div className="mono" style={{ fontSize: 28, color: 'var(--primary)' }}>
              {order.number}
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>
              {order.company.name} · {order.vessel.name}
            </div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
              <StatusTag status={order.status} title={order.statusTitle} />
              <AnimatePresence>
                {justChanged && (
                  <motion.span initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} style={{ color: 'var(--success)', fontWeight: 600, fontSize: 14 }}>
                    ✓ обновлено
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
          <Space wrap align="start">
            {next.map((s) => (
              <motion.div key={s} whileTap={{ scale: 0.96 }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <Button type="primary" size="large" icon={<CheckOutlined />} loading={change.isPending && change.variables?.status === s} onClick={() => change.mutate({ status: s })} title={ACTIONS[s]?.hint}>
                  {ACTIONS[s]?.label ?? s}
                </Button>
              </motion.div>
            ))}
            {canReject && (
              <Button danger size="large" icon={<CloseOutlined />} onClick={() => setRejectOpen(true)}>
                Отклонить
              </Button>
            )}
            <Button size="large" icon={<DownloadOutlined />} onClick={() => api.download(`/panel/orders/${order.id}/export.csv`, `${order.number}.csv`)}>
              CSV
            </Button>
          </Space>
        </div>

        <div style={{ margin: '30px 0 6px' }}>
          <StatusTimeline key={order.status} timeline={order.timeline} rejected={order.status === 'REJECTED'} />
        </div>
        {order.status === 'REJECTED' && (
          <div className="demo-hint" style={{ background: 'var(--danger-soft)', borderColor: 'var(--danger)', color: 'var(--danger)', marginTop: 14 }}>
            Отклонён {fmtDateTime(order.rejectedAt)}. Причина: {order.rejectReason}
          </div>
        )}
      </motion.div>

      <div className="two-col" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(300px, 1fr)', gap: 20, marginTop: 20 }}>
        <div className="card card-pad">
          <h3 style={{ marginTop: 0 }}>Позиции и наличие на складе</h3>
          {shortage && order.status === 'PENDING' && (
            <div className="demo-hint" style={{ marginBottom: 14 }}>
              По некоторым позициям на складе меньше, чем в заказе. Проверьте фактическое наличие перед подтверждением.
            </div>
          )}
          <Table
            rowKey="partId"
            pagination={false}
            dataSource={order.items}
            columns={[
              { title: 'Запчасть', render: (_, i) => <div><div style={{ fontWeight: 600 }}>{i.name}</div><div className="mono faint" style={{ fontSize: 12.5 }}>{i.catalogNumber}</div></div> },
              { title: 'В заказе', align: 'right', render: (_, i) => <b>{i.quantity} {i.unit}</b> },
              {
                title: 'Склад',
                render: (_, i) =>
                  i.stock ? (
                    <div>
                      <AvailabilityBadge stock={i.stock} unit={i.unit} />
                      <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
                        на складе {i.stock.quantity} · в резерве {i.stock.reserved}
                        {i.reserved ? ' (вкл. этот заказ)' : ''}
                      </div>
                    </div>
                  ) : null,
              },
              { title: 'Сумма', align: 'right', render: (_, i) => money(i.lineTotal) },
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}><b>Итого</b></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right"><b>{money(order.total)}</b></Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </div>
        <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
          <div className="card card-pad">
            <h3 style={{ marginTop: 0 }}>Заказчик и доставка</h3>
            <OrderInfo order={order} />
          </div>
          <div className="card card-pad">
            <h3 style={{ marginTop: 0 }}>История</h3>
            {[...order.history].reverse().map((h) => (
              <div key={h.at + h.status} style={{ marginBottom: 12 }}>
                <b>{h.title}</b>
                <div className="faint" style={{ fontSize: 13 }}>
                  {fmtDateTime(h.at)} · {h.by}
                </div>
                {h.comment && <div className="muted" style={{ fontSize: 13.5 }}>{h.comment}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal
        open={rejectOpen}
        title={`Отклонить заказ ${order.number}`}
        okText="Отклонить заказ"
        okButtonProps={{ danger: true, disabled: !reason || (reason === 'Другое' && other.trim().length < 3), loading: change.isPending }}
        cancelText="Отмена"
        onCancel={() => setRejectOpen(false)}
        onOk={() => change.mutate({ status: 'REJECTED', reason: reason === 'Другое' ? other.trim() : reason })}
      >
        <p className="muted">Причину увидит заказчик. Резерв по заказу будет снят.</p>
        <Radio.Group value={reason} onChange={(e) => setReason(e.target.value)} style={{ display: 'grid', gap: 10 }}>
          {dict?.rejectReasons.map((r) => (
            <Radio key={r} value={r}>
              {r}
            </Radio>
          ))}
        </Radio.Group>
        {reason === 'Другое' && <Input.TextArea style={{ marginTop: 12 }} rows={2} maxLength={300} placeholder="Опишите причину" value={other} onChange={(e) => setOther(e.target.value)} />}
      </Modal>
    </div>
  );
}
