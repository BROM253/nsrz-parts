import { ArrowLeftOutlined, DownloadOutlined, RedoOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Result, Table } from 'antd';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Cart, OrderDetail } from '../../api/types';
import { ease, Skeleton, StatusTag, StatusTimeline } from '../../components/ui';
import { ago, fmtDateTime, money } from '../../format';

export function OrderInfo({ order }: { order: OrderDetail }) {
  const rows: [string, React.ReactNode][] = [
    ['Судно', `${order.vessel.name} · ${order.vessel.vesselType}${order.vessel.imoNumber ? ' · ' + order.vessel.imoNumber : ''}`],
    ['Компания', order.company.name],
    ['Доставка', order.deliveryTitle],
    ['Оформил', `${order.createdBy.fullName}${order.createdBy.phone ? ', ' + order.createdBy.phone : ''}`],
    ['Дата оформления', fmtDateTime(order.createdAt)],
  ];
  if (order.comment) rows.push(['Комментарий', order.comment]);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12, fontSize: 14.5 }}>
          <span className="muted">{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}

export default function OrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [repeating, setRepeating] = useState(false);
  const { data: order, isLoading, error, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ['orders', 'one', id],
    queryFn: () => api.get<OrderDetail>(`/orders/${id}`),
    refetchInterval: 15_000, // смена статуса в панели НСРЗ появляется здесь в течение 15 секунд
  });

  if (isLoading) return <Skeleton height={420} />;
  if (error || !order) return <Result status="404" title="Заказ не найден" subTitle={(error as ApiError)?.message} extra={<Button onClick={() => navigate('/orders')}>К заказам</Button>} />;

  /** «Повторить заказ»: позиции — в корзину; то, чего не хватает на складе, перечисляем. */
  const repeat = async () => {
    setRepeating(true);
    try {
      const res = await api.post<{ cart: Cart; added: { name: string; quantity: number }[]; skipped: { name: string; requested: number; added: number; reason: string }[] }>(`/cart/repeat/${order.id}`);
      qc.setQueryData(['cart'], res.cart);
      if (res.skipped.length) {
        modal.warning({
          title: 'Не всё удалось добавить',
          content: (
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {res.skipped.map((s) => (
                <li key={s.name}>
                  {s.name}: добавлено {s.added} из {s.requested} — {s.reason}
                </li>
              ))}
            </ul>
          ),
          okText: 'Перейти в корзину',
          onOk: () => navigate('/cart'),
        });
      } else {
        message.success('Позиции заказа добавлены в корзину');
        navigate('/cart');
      }
    } catch (e) {
      message.error((e as ApiError).message);
    } finally {
      setRepeating(false);
    }
  };

  const exportCsv = () => api.download(`/orders/${order.id}/export.csv`, `${order.number}.csv`).catch((e) => message.error(e.message));

  return (
    <div>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/orders')} style={{ marginLeft: -12, marginBottom: 12 }}>
        Все заказы
      </Button>
      <motion.div className="card card-pad" style={{ padding: 28 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div className="faint" style={{ fontSize: 13, fontWeight: 600 }}>
              Заказ
            </div>
            <div className="mono" style={{ fontSize: 30, color: 'var(--primary)', lineHeight: 1.2 }}>
              {order.number}
            </div>
            <div style={{ marginTop: 8 }}>
              <StatusTag status={order.status} title={order.statusTitle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="faint" style={{ fontSize: 13 }}>
              обновлено {ago(new Date(dataUpdatedAt).toISOString())}
            </span>
            <Button icon={<ReloadOutlined spin={isFetching} />} onClick={() => refetch()}>
              Обновить
            </Button>
            <Button icon={<RedoOutlined />} loading={repeating} onClick={repeat}>
              Повторить заказ
            </Button>
            <Button icon={<DownloadOutlined />} onClick={exportCsv}>
              Экспорт в Excel (CSV)
            </Button>
          </div>
        </div>

        <div style={{ margin: '32px 0 8px' }}>
          <StatusTimeline timeline={order.timeline} rejected={order.status === 'REJECTED'} />
        </div>

        {order.status === 'REJECTED' && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="demo-hint" style={{ background: 'var(--danger-soft)', borderColor: 'var(--danger)', color: 'var(--danger)', marginTop: 18 }}>
            <b>Заказ отклонён {fmtDateTime(order.rejectedAt)}.</b> Причина: {order.rejectReason}. Резерв снят — детали можно заказать заново или уточнить в отделе продаж.
          </motion.div>
        )}
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)', gap: 20, marginTop: 20 }} className="two-col">
        <motion.div className="card card-pad" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.35, ease }}>
          <h3 style={{ marginTop: 0 }}>Состав заказа</h3>
          <Table
            size="middle"
            rowKey="partId"
            pagination={false}
            dataSource={order.items}
            columns={[
              {
                title: 'Запчасть',
                render: (_, i) => (
                  <div>
                    <div style={{ fontWeight: 600 }}>{i.name}</div>
                    <div className="mono faint" style={{ fontSize: 12.5 }}>
                      {i.catalogNumber}
                    </div>
                  </div>
                ),
              },
              { title: 'Кол-во', align: 'right', render: (_, i) => `${i.quantity} ${i.unit}` },
              { title: 'Цена', align: 'right', render: (_, i) => money(i.price) },
              { title: 'Сумма', align: 'right', render: (_, i) => <b>{money(i.lineTotal)}</b> },
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}>
                  <b>Итого</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <b style={{ fontSize: 16 }}>{money(order.total)}</b>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </motion.div>
        <motion.div style={{ display: 'grid', gap: 20, alignContent: 'start' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.35, ease }}>
          <div className="card card-pad">
            <h3 style={{ marginTop: 0 }}>Детали</h3>
            <OrderInfo order={order} />
          </div>
          <div className="card card-pad">
            <h3 style={{ marginTop: 0 }}>История</h3>
            <div style={{ display: 'grid', gap: 14 }}>
              {[...order.history].reverse().map((h, i) => (
                <motion.div key={h.at + h.status} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }} style={{ display: 'flex', gap: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: i === 0 ? 'var(--primary)' : 'var(--border-strong)', marginTop: 6, flex: 'none' }} />
                  <div>
                    <b>{h.title}</b>
                    <div className="faint" style={{ fontSize: 13 }}>
                      {fmtDateTime(h.at)}
                      {h.by ? ` · ${h.by}` : ''}
                    </div>
                    {h.comment && <div className="muted" style={{ fontSize: 13.5 }}>{h.comment}</div>}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
