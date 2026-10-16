import { SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Button, Empty, Input, Pagination, Switch } from 'antd';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useCartActions, useDictionaries } from '../../api/hooks';
import type { Part, PartsPage } from '../../api/types';
import { useAuth } from '../../auth';
import { AvailabilityBadge, ease, flyToCart, itemVariants, listVariants, PartImage, Skeleton, SyncPill, Waves } from '../../components/ui';
import { money, plural } from '../../format';

function PartCard({ part }: { part: Part }) {
  const navigate = useNavigate();
  const { add } = useCartActions();
  const [added, setAdded] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);

  const quickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    add.mutate(
      { partId: part.id, quantity: 1 },
      {
        onSuccess: () => {
          flyToCart(imageRef.current, part.imageUrl);
          setAdded(true);
          setTimeout(() => setAdded(false), 1600);
        },
      },
    );
  };

  return (
    <motion.div variants={itemVariants} layout whileHover={{ y: -4 }} transition={{ duration: 0.25, ease }}>
      <div
        className="part-card"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
          e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
        }}
        onClick={() => navigate(`/parts/${part.id}`)} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/parts/${part.id}`)}>
        <div ref={imageRef} style={{ margin: '-20px -20px 4px' }}>
          <PartImage src={part.imageUrl} icon={part.category.icon} alt={part.name} height={168} radius={0} style={{ borderRadius: '18px 18px 0 0' }} />
        </div>
        <div>
          <div className="faint" style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>
            {part.category.name}
          </div>
          <h3>{part.name}</h3>
        </div>
        <div className="numbers">
          <span>
            <span className="faint">Кат. №</span> <span className="mono">{part.catalogNumber}</span>
          </span>
          {part.manufacturerPartNumber && (
            <span>
              <span className="faint">Произв.</span> <span className="mono">{part.manufacturerPartNumber}</span>
            </span>
          )}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <AvailabilityBadge stock={part.stock} unit={part.unit} lead={part.leadTimeDays} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="price">
            {money(part.price)} <small>/ {part.unit}</small>
          </div>
          <motion.div whileTap={{ scale: 0.92 }}>
            <Button
              type={added ? 'default' : 'primary'}
              shape="round"
              icon={<ShoppingCartOutlined />}
              disabled={!part.stock.orderable}
              loading={add.isPending}
              onClick={quickAdd}
              style={added ? { borderColor: 'var(--success)', color: 'var(--success)' } : undefined}
            >
              {added ? 'Добавлено' : 'В корзину'}
            </Button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

export default function CatalogPage() {
  const { user } = useAuth();
  const { data: dict } = useDictionaries();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const q = params.get('q') ?? '';
  const vt = params.get('vt');
  const cat = params.get('cat');
  const only = params.get('only') === '1';
  const page = Number(params.get('page') ?? 1);

  // если адрес поменялся извне (кнопка «Назад»), подтягиваем строку поиска из него
  useEffect(() => {
    if (q !== text.trim()) setText(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // поиск с задержкой 300 мс — не дёргаем сервер на каждую букву
  useEffect(() => {
    if (text.trim() === q) return; // строка уже в адресе — менять нечего
    const t = setTimeout(() => update({ q: text.trim() || null, page: null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const update = (patch: Record<string, string | null>) =>
    setParams(
      () => {
        // Берём адрес на момент вызова, а не параметры прошлой отрисовки: иначе отложенный поиск
        // затирал фильтр, выбранный в эти 300 мс (дефект найден UI-автотестом ФТ-11).
        const next = new URLSearchParams(window.location.search);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (vt) query.set('vesselTypeId', vt);
  if (cat) query.set('categoryId', cat);
  if (only) query.set('onlyAvailable', 'true');
  query.set('page', String(page));
  query.set('pageSize', '12');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['parts', query.toString()],
    queryFn: () => api.get<PartsPage>(`/parts?${query}`),
    placeholderData: keepPreviousData,
  });

  const firstName = user?.fullName.split(' ')[1];
  const myTypes = new Set(user?.vessels.map((v) => v.vesselType.name));

  return (
    <div>
      <motion.section className="hero" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease }}>
        <Waves className="hero-waves" />
        <div style={{ position: 'relative', maxWidth: 760 }}>
          <div className="muted" style={{ fontWeight: 600, marginBottom: 6 }}>
            {firstName ? `Здравствуйте, ${firstName}!` : 'Здравствуйте!'} {user?.company?.name}
          </div>
          <h1>Какая деталь нужна?</h1>
          <p className="muted" style={{ margin: '0 0 18px' }}>
            Ищите по наименованию, каталожному номеру НСРЗ или номеру производителя — пробелы и дефисы не важны.
          </p>
          <div className="search-big">
            <Input
              size="large"
              allowClear
              autoFocus
              prefix={<SearchOutlined style={{ color: 'var(--primary)', fontSize: 20, marginRight: 6 }} />}
              placeholder="Например: 6L20 FF 118 или «фильтр топливный»"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="chips">
              <span className="faint" style={{ alignSelf: 'center', fontSize: 13, fontWeight: 600, width: 92 }}>
                Тип судна
              </span>
              {dict?.vesselTypes.map((t) => (
                <motion.button key={t.id} whileTap={{ scale: 0.94 }} className={`chip${vt === String(t.id) ? ' on' : ''}`} onClick={() => update({ vt: vt === String(t.id) ? null : String(t.id), page: null })}>
                  {t.name}
                  {myTypes.has(t.name) && vt !== String(t.id) && <span className="count">• ваш флот</span>}
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18 }}>
        <div className="chips">
          <motion.button whileTap={{ scale: 0.94 }} className={`chip${!cat ? ' on' : ''}`} onClick={() => update({ cat: null, page: null })}>
            Все категории
          </motion.button>
          {dict?.categories.map((c) => (
            <motion.button key={c.id} whileTap={{ scale: 0.94 }} className={`chip${cat === String(c.id) ? ' on' : ''}`} onClick={() => update({ cat: cat === String(c.id) ? null : String(c.id), page: null })}>
              {c.name} <span className="count">{c.partsCount}</span>
            </motion.button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <b style={{ fontSize: 17 }}>
              {data ? `${data.total} ${plural(data.total, 'запчасть', 'запчасти', 'запчастей')}` : 'Ищем…'}
            </b>
            <AnimatePresence>
              {isFetching && !isLoading && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="faint" style={{ fontSize: 13 }}>
                  обновляем…
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <Switch checked={only} onChange={(v) => update({ only: v ? '1' : null, page: null })} />
              <span>Только то, что можно заказать</span>
            </label>
            <SyncPill at={data?.stockUpdatedAt} />
          </div>
        </div>

        {isLoading ? (
          <div className="grid-parts">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={340} style={{ borderRadius: 18 }} />
            ))}
          </div>
        ) : data && data.items.length === 0 ? (
          <motion.div className="card card-pad" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Empty description={<span>Ничего не нашли. Проверьте номер или уберите фильтры.<br />Если детали нет в каталоге — позвоните в отдел продаж, найдём под заказ.</span>} />
          </motion.div>
        ) : (
          <motion.div key={query.toString()} className="grid-parts" variants={listVariants} initial="hidden" animate="show">
            {data?.items.map((p) => <PartCard key={p.id} part={p} />)}
          </motion.div>
        )}

        {data && data.total > data.pageSize && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <Pagination
              current={page}
              pageSize={data.pageSize}
              total={data.total}
              showSizeChanger={false}
              onChange={(p) => {
                update({ page: p === 1 ? null : String(p) });
                window.scrollTo({ top: 300, behavior: 'smooth' });
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
