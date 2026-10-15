import { ArrowLeftOutlined, CheckCircleFilled, CopyOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { App, Button, Result, Tag, Tooltip } from 'antd';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { useCart, useCartActions } from '../../api/hooks';
import type { Part } from '../../api/types';
import { useAuth } from '../../auth';
import { AvailabilityBadge, CategoryIcon, ease, flyToCart, Skeleton, Stepper } from '../../components/ui';
import { fmtDateTime, money } from '../../format';

function Copy({ value }: { value: string }) {
  const { message } = App.useApp();
  return (
    <Tooltip title="Скопировать">
      <Button
        type="text"
        size="small"
        icon={<CopyOutlined />}
        onClick={() => navigator.clipboard?.writeText(value).then(() => message.success('Номер скопирован'))}
      />
    </Tooltip>
  );
}

export default function PartPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: part, isLoading, error } = useQuery({
    queryKey: ['parts', 'one', id],
    queryFn: () => api.get<Part>(`/parts/${id}`),
    refetchInterval: 30_000, // остаток мог поменяться — обновляем, пока карточка открыта
  });
  const { data: cart } = useCart();
  const { add } = useCartActions();
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const inCart = cart?.items.find((i) => i.part.id === Number(id))?.quantity ?? 0;
  const max = part ? Math.max(0, part.stock.maxOrder - inCart) : 0;

  useEffect(() => {
    if (qty > max && max > 0) setQty(max);
  }, [max, qty]);

  if (isLoading) {
    return (
      <div className="card card-pad">
        <Skeleton height={32} width="60%" />
        <Skeleton height={18} width="40%" style={{ marginTop: 16 }} />
        <Skeleton height={160} style={{ marginTop: 24 }} />
      </div>
    );
  }
  if (error || !part) {
    return <Result status="404" title="Запчасть не найдена" subTitle={(error as ApiError)?.message} extra={<Button onClick={() => navigate('/')}>В каталог</Button>} />;
  }

  const fitsMyFleet = user?.vessels.filter((v) => part.vesselTypes.includes(v.vesselType.name)) ?? [];

  const addToCart = (e: React.MouseEvent) => {
    const button = e.currentTarget;
    add.mutate(
      { partId: part.id, quantity: qty },
      {
        onSuccess: () => {
          flyToCart(button);
          setJustAdded(true);
          setQty(1);
        },
      },
    );
  };

  return (
    <div>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} style={{ marginLeft: -12, marginBottom: 12 }}>
        Назад к поиску
      </Button>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(300px, 1fr)', gap: 24, alignItems: 'start' }} className="two-col">
        <motion.div className="card card-pad" style={{ padding: 32 }} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease }}>
          <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <motion.div initial={{ rotate: -12, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
              <CategoryIcon icon={part.category.icon} big />
            </motion.div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <Tag bordered={false} style={{ background: 'var(--primary-tint)', color: 'var(--primary-hover)', fontWeight: 600, borderRadius: 999 }}>
                {part.category.name}
              </Tag>
              <h1 style={{ fontSize: 28, letterSpacing: '-0.02em', margin: '10px 0 8px' }}>{part.name}</h1>
              <AvailabilityBadge stock={part.stock} unit={part.unit} lead={part.leadTimeDays} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 28 }}>
            <div className="card" style={{ padding: '14px 16px', boxShadow: 'none', background: 'var(--surface-warm)' }}>
              <div className="faint" style={{ fontSize: 13 }}>Каталожный номер НСРЗ</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="mono" style={{ fontSize: 17 }}>{part.catalogNumber}</span>
                <Copy value={part.catalogNumber} />
              </div>
            </div>
            {part.manufacturerPartNumber && (
              <div className="card" style={{ padding: '14px 16px', boxShadow: 'none', background: 'var(--surface-warm)' }}>
                <div className="faint" style={{ fontSize: 13 }}>Номер детали производителя</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="mono" style={{ fontSize: 17 }}>{part.manufacturerPartNumber}</span>
                  <Copy value={part.manufacturerPartNumber} />
                </div>
              </div>
            )}
          </div>

          <h3 style={{ marginTop: 28, marginBottom: 8 }}>Описание</h3>
          <p className="muted" style={{ lineHeight: 1.65, margin: 0 }}>
            {part.description ?? '—'}
          </p>

          <h3 style={{ marginTop: 24, marginBottom: 10 }}>Подходит для судов</h3>
          <div className="chips">
            {part.vesselTypes.map((t) => (
              <span key={t} className="pill" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
                {t}
              </span>
            ))}
          </div>
          {fitsMyFleet.length > 0 && (
            <p style={{ marginTop: 12, color: 'var(--success)', fontWeight: 600 }}>
              <CheckCircleFilled /> Подходит вашим судам: {fitsMyFleet.map((v) => v.name).join(', ')}
            </p>
          )}
        </motion.div>

        <motion.div className="card card-pad" style={{ position: 'sticky', top: 92, padding: 28 }} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease, delay: 0.05 }}>
          <div className="price" style={{ fontSize: 30 }}>
            {money(part.price)} <small>за {part.unit}</small>
          </div>

          <div style={{ margin: '18px 0', display: 'grid', gap: 8, fontSize: 14.5 }}>
            {part.stock.availability !== 'ON_ORDER' && (
              <>
                <Row label="На складе" value={`${part.stock.quantity} ${part.unit}`} />
                <Row label="В резерве по заказам" value={`${part.stock.reserved} ${part.unit}`} />
                <Row label="Доступно для заказа" value={<b style={{ color: part.stock.available ? 'var(--success)' : 'var(--danger)' }}>{part.stock.available} {part.unit}</b>} />
              </>
            )}
            {part.stock.availability === 'ON_ORDER' && <Row label="Срок поставки" value={<b>{part.leadTimeDays} дн.</b>} />}
            <Row label="Остатки обновлены" value={fmtDateTime(part.stock.updatedAt)} />
          </div>

          {part.stock.orderable && max > 0 ? (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Stepper value={qty} max={max} onChange={setQty} />
              <motion.div whileTap={{ scale: 0.96 }} style={{ flex: 1 }}>
                <Button type="primary" size="large" block icon={<ShoppingCartOutlined />} onClick={addToCart} loading={add.isPending}>
                  В корзину · {money(part.price * qty)}
                </Button>
              </motion.div>
            </div>
          ) : (
            <div className="demo-hint" style={{ background: 'var(--danger-soft)', borderColor: 'var(--danger)', color: 'var(--danger)' }}>
              {inCart > 0 && part.stock.orderable
                ? `В корзине уже весь доступный остаток (${inCart} ${part.unit}).`
                : part.stock.allReserved
                  ? 'Весь остаток зарезервирован по другим заказам. Загляните позже или позвоните в отдел продаж.'
                  : 'Сейчас нет на складе. Отдел продаж НСРЗ подскажет срок поставки.'}
            </div>
          )}
          {part.stock.availability === 'IN_STOCK' && part.stock.available > 0 && part.stock.available <= 3 && (
            <p className="faint" style={{ fontSize: 13, marginTop: 10 }}>
              Осталось мало — после отправки заказа детали резервируются за вами.
            </p>
          )}

          <AnimatePresence>
            {(justAdded || inCart > 0) && (
              <motion.div initial={{ opacity: 0, height: 0, marginTop: 0 }} animate={{ opacity: 1, height: 'auto', marginTop: 16 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease }}>
                <Link to="/cart">
                  <Button block size="large" style={{ borderColor: 'var(--success)', color: 'var(--success)', fontWeight: 600 }}>
                    <CheckCircleFilled /> Перейти в корзину · {inCart} {part.unit}
                  </Button>
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px dashed var(--border)', paddingBottom: 8 }}>
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
