import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input } from 'antd';
import { motion } from 'motion/react';
import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { useCart, useDictionaries } from '../../api/hooks';
import type { DeliveryMethod, OrderDetail } from '../../api/types';
import { useAuth } from '../../auth';
import { ease, Skeleton, SuccessCheck } from '../../components/ui';
import { money } from '../../format';
import { Steps } from './CartPage';

function OptionCard({ selected, onClick, title, hint, delay = 0 }: { selected: boolean; onClick: () => void; title: string; hint?: string; delay?: number }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      style={{
        textAlign: 'left',
        padding: '16px 18px',
        borderRadius: 14,
        border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
        background: selected ? 'var(--primary-tint)' : 'var(--surface)',
        cursor: 'pointer',
        font: 'inherit',
        color: 'var(--text)',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        transition: 'border-color .2s, background .2s',
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: `2px solid ${selected ? 'var(--primary)' : 'var(--border-strong)'}`,
          display: 'grid',
          placeItems: 'center',
          flex: 'none',
          marginTop: 2,
        }}
      >
        {selected && <motion.span layoutId={`dot-${hint ? 'd' : 'v'}`} style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)' }} />}
      </span>
      <span>
        <b style={{ display: 'block' }}>{title}</b>
        {hint && <span className="muted" style={{ fontSize: 13.5 }}>{hint}</span>}
      </span>
    </motion.button>
  );
}

export default function CheckoutPage() {
  const { user } = useAuth();
  const { data: cart, isLoading } = useCart();
  const { data: dict } = useDictionaries();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [vesselId, setVesselId] = useState(user?.vessels[0]?.id);
  const [delivery, setDelivery] = useState<DeliveryMethod>('PICKUP');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<OrderDetail | null>(null);
  // один ключ на одну попытку оформления: двойное нажатие или повтор после обрыва связи не создадут второй заказ
  const idempotencyKey = useRef(crypto.randomUUID());
  const submitted = useRef(false);

  if (done) {
    return (
      <motion.div className="card card-pad" style={{ maxWidth: 620, margin: '20px auto', padding: 44, textAlign: 'center' }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease }}>
        <Steps step={3} />
        <SuccessCheck />
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} style={{ fontSize: 28, margin: '16px 0 4px', letterSpacing: '-0.02em' }}>
          Заказ отправлен
        </motion.h1>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.85 }}>
          <div className="mono" style={{ fontSize: 26, color: 'var(--primary)', margin: '8px 0' }}>
            {done.number}
          </div>
          <p className="muted">
            Статус: <b>«{done.statusTitle}»</b>. Детали зарезервированы за вами. Как только склад НСРЗ подтвердит наличие, статус обновится — вы получите SMS.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <Button type="primary" size="large" onClick={() => navigate(`/orders/${done.id}`)}>
              Следить за заказом
            </Button>
            <Button size="large" onClick={() => navigate('/')}>
              Продолжить поиск
            </Button>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  if (isLoading || submitted.current) return <Skeleton height={400} />;
  if (!cart || cart.items.length === 0) return <Navigate to="/cart" replace />;

  const submit = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const order = await api.post<OrderDetail>('/orders', { vesselId, deliveryMethod: delivery, comment: comment.trim() || undefined, idempotencyKey: idempotencyKey.current });
      // сначала запоминаем успех, потом чистим корзину — иначе пустая корзина уведёт со страницы раньше экрана «Готово»
      submitted.current = true;
      setDone(order);
      qc.setQueryData(['cart'], { items: [], count: 0, positions: 0, total: 0, hasProblems: false });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['parts'] });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e as ApiError);
      qc.invalidateQueries({ queryKey: ['cart'] });
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <Steps step={2} />
      <h1 className="section-title">Оформление заказа</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Проверьте список, выберите судно и способ доставки.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 24, alignItems: 'start' }} className="two-col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className="card card-pad">
            <h3 style={{ marginTop: 0 }}>1. Судно</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {user?.vessels.map((v, i) => (
                <OptionCard key={v.id} selected={vesselId === v.id} onClick={() => setVesselId(v.id)} title={v.name} hint={`${v.vesselType.name}${v.imoNumber ? ' · ' + v.imoNumber : ''}`} delay={i * 0.05} />
              ))}
            </div>
          </section>
          <section className="card card-pad">
            <h3 style={{ marginTop: 0 }}>2. Доставка</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              {dict?.deliveryMethods.map((d, i) => (
                <OptionCard key={d.code} selected={delivery === d.code} onClick={() => setDelivery(d.code)} title={d.title} hint={d.hint} delay={i * 0.05} />
              ))}
            </div>
          </section>
          <section className="card card-pad">
            <h3 style={{ marginTop: 0 }}>3. Комментарий для НСРЗ</h3>
            <Input.TextArea rows={3} maxLength={500} showCount value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: нужно до отхода судна в пятницу" />
          </section>
        </div>

        <div className="card card-pad" style={{ position: 'sticky', top: 92 }}>
          <h3 style={{ marginTop: 0 }}>Ваш заказ</h3>
          <div style={{ display: 'grid', gap: 10, maxHeight: 280, overflow: 'auto', marginBottom: 12 }}>
            {cart.items.map((l) => (
              <div key={l.part.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                <span>
                  {l.part.name} <span className="faint">× {l.quantity}</span>
                </span>
                <b style={{ whiteSpace: 'nowrap' }}>{money(l.lineTotal)}</b>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="muted">Итого</span>
            <span className="price" style={{ fontSize: 26 }}>{money(cart.total)}</span>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 14 }}>
              <Alert
                type={error.code === 'DUPLICATE_ORDER' ? 'warning' : 'error'}
                showIcon
                message={error.message}
                action={
                  error.code === 'DUPLICATE_ORDER' ? (
                    <Link to={`/orders/${error.body.orderId}`}>
                      <Button size="small">Открыть</Button>
                    </Link>
                  ) : error.code === 'NOT_ENOUGH_STOCK' ? (
                    <Link to="/cart">
                      <Button size="small">В корзину</Button>
                    </Link>
                  ) : undefined
                }
              />
            </motion.div>
          )}

          <motion.div whileTap={{ scale: 0.97 }}>
            <Button type="primary" size="large" block style={{ marginTop: 16, height: 52 }} loading={sending} disabled={!vesselId || cart.hasProblems} onClick={submit}>
              Отправить заказ
            </Button>
          </motion.div>
          <Link to="/cart">
            <Button type="link" block style={{ marginTop: 6 }}>
              Изменить корзину
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
