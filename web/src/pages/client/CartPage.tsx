import { DeleteOutlined, ShoppingOutlined, WarningFilled } from '@ant-design/icons';
import { Button, Empty } from 'antd';
import { AnimatePresence, motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart, useCartActions } from '../../api/hooks';
import { AvailabilityBadge, ease, PartImage, Skeleton, Stepper } from '../../components/ui';
import { money, plural } from '../../format';

export function Steps({ step }: { step: 1 | 2 | 3 }) {
  const items = ['Корзина', 'Оформление', 'Готово'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
      {items.map((t, i) => (
        <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              fontSize: 13,
              fontWeight: 700,
              background: i + 1 <= step ? 'var(--primary)' : 'var(--border)',
              color: i + 1 <= step ? '#fff' : 'var(--text-2)',
              transition: 'all .3s',
            }}
          >
            {i + 1 < step ? '✓' : i + 1}
          </span>
          <span style={{ fontWeight: i + 1 === step ? 700 : 500, color: i + 1 <= step ? 'var(--text)' : 'var(--text-3)' }}>{t}</span>
          {i < items.length - 1 && <span style={{ width: 36, height: 2, background: i + 1 < step ? 'var(--primary)' : 'var(--border)', borderRadius: 2 }} />}
        </div>
      ))}
    </div>
  );
}

export default function CartPage() {
  const { data: cart, isLoading } = useCart();
  const { set, remove } = useCartActions();
  const navigate = useNavigate();

  if (isLoading) return <Skeleton height={300} />;

  if (!cart || cart.items.length === 0) {
    return (
      <motion.div className="card card-pad" style={{ padding: 48, textAlign: 'center' }} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
        <Empty image={<ShoppingOutlined style={{ fontSize: 64, color: 'var(--border-strong)' }} />} description={<span className="muted">Корзина пуста — найдите нужные детали в каталоге</span>}>
          <Link to="/">
            <Button type="primary" size="large">
              Перейти в каталог
            </Button>
          </Link>
        </Empty>
      </motion.div>
    );
  }

  return (
    <div>
      <Steps step={1} />
      <h1 className="section-title">Корзина</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {cart.positions} {plural(cart.positions, 'позиция', 'позиции', 'позиций')} · {cart.count} ед. Количество ограничено свободным остатком склада.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 24, alignItems: 'start' }} className="two-col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <AnimatePresence initial={false}>
            {cart.items.map((line) => (
              <motion.div
                key={line.part.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -60, height: 0, marginBottom: -12 }}
                transition={{ duration: 0.3, ease }}
                className="card"
                style={{ padding: 18, borderColor: line.problem ? 'var(--danger)' : undefined }}
              >
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <PartImage src={line.part.imageUrl} icon={line.part.category.icon} alt={line.part.name} height={72} radius={12} style={{ width: 96 }} />
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <Link to={`/parts/${line.part.id}`} style={{ color: 'var(--text)', fontWeight: 650, fontSize: 16 }}>
                      {line.part.name}
                    </Link>
                    <div className="mono faint" style={{ fontSize: 13, margin: '2px 0 6px' }}>
                      {line.part.catalogNumber}
                    </div>
                    <AvailabilityBadge stock={line.part.stock} unit={line.part.unit} lead={line.part.leadTimeDays} />
                  </div>
                  <Stepper
                    value={line.quantity}
                    max={Math.max(line.quantity, line.part.stock.maxOrder)}
                    onChange={(v) => set.mutate({ partId: line.part.id, quantity: v })}
                    disabled={set.isPending}
                  />
                  <div style={{ width: 130, textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 17 }}>{money(line.lineTotal)}</div>
                    <div className="faint" style={{ fontSize: 12.5 }}>
                      {money(line.part.price)} × {line.quantity}
                    </div>
                  </div>
                  <Button type="text" danger icon={<DeleteOutlined />} aria-label="Удалить" onClick={() => remove.mutate(line.part.id)} style={{ width: 44, height: 44 }} />
                </div>
                {line.problem && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: 12, color: 'var(--danger)', fontSize: 14 }}>
                    <WarningFilled /> {line.problem}. Уменьшите количество или удалите позицию.
                  </motion.div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <motion.div className="card card-pad" style={{ position: 'sticky', top: 92 }} layout>
          <div className="muted">Итого</div>
          <motion.div key={cart.total} initial={{ scale: 0.94, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} className="price" style={{ fontSize: 32, margin: '4px 0 16px' }}>
            {money(cart.total)}
          </motion.div>
          <p className="faint" style={{ fontSize: 13.5, marginTop: 0 }}>
            Цены без учёта доставки. После отправки детали резервируются, а наличие подтверждает склад НСРЗ.
          </p>
          <Button type="primary" size="large" block disabled={cart.hasProblems} onClick={() => navigate('/checkout')}>
            Оформить заказ
          </Button>
          {cart.hasProblems && (
            <p style={{ color: 'var(--danger)', fontSize: 13.5, marginBottom: 0 }}>Сначала исправьте позиции, отмеченные красным.</p>
          )}
          <Link to="/">
            <Button type="link" block style={{ marginTop: 8 }}>
              Продолжить поиск
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
