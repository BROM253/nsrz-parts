import { ShoppingCartOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button, Tooltip } from 'antd';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useCart, useDictionaries } from '../../api/hooks';
import { useAuth } from '../../auth';
import { LogoutButton } from '../../components/LogoutButton';
import { AnimatedOutlet, ease, Logo, SyncPill } from '../../components/ui';

const LINKS = [
  { to: '/', label: 'Каталог', end: true },
  { to: '/orders', label: 'Мои заказы' },
];

/** Иконка корзины подпрыгивает, когда количество меняется. */
function CartButton() {
  const { data } = useCart();
  const count = data?.count ?? 0;
  const prev = useRef(count);
  const flyingUntil = useRef(0);
  const [bump, setBump] = useState(0);
  // во время «полёта» корзина ждёт приземления товара и подпрыгивает именно тогда
  useEffect(() => {
    const onFly = () => (flyingUntil.current = Date.now() + 1800);
    const onLanded = () => setBump((b) => b + 1);
    window.addEventListener('nsrz:fly', onFly);
    window.addEventListener('nsrz:landed', onLanded);
    return () => {
      window.removeEventListener('nsrz:fly', onFly);
      window.removeEventListener('nsrz:landed', onLanded);
    };
  }, []);
  useEffect(() => {
    if (count !== prev.current && Date.now() > flyingUntil.current) setBump((b) => b + 1);
    prev.current = count;
  }, [count]);
  return (
    <Link to="/cart" aria-label="Корзина" id="cart-button">
      <motion.div key={bump} animate={bump ? { scale: [1, 1.25, 0.92, 1.06, 1], rotate: [0, -8, 6, 0] } : {}} transition={{ duration: 0.55 }}>
        <Badge count={count} overflowCount={99} color="#B4532A" offset={[-2, 4]}>
          <Button shape="circle" size="large" icon={<ShoppingCartOutlined style={{ fontSize: 20 }} />} />
        </Badge>
      </motion.div>
    </Link>
  );
}

/** «Полёт в корзину»: при добавлении детали от кнопки к значку корзины летит терракотовая точка. */
const FLIGHT_SEC = 1.4; // медленно, чтобы перенос товара было видно

type Flight = { id: number; x: number; y: number; tx: number; ty: number; image?: string | null; quantity: number };

function FlyToCart() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [plus, setPlus] = useState<{ id: number; x: number; y: number; quantity: number }[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const { x, y, image, quantity } = (e as CustomEvent).detail;
      const target = document.getElementById('cart-button')?.getBoundingClientRect();
      if (!target) return;
      const id = Date.now() + Math.random();
      const flight = { id, x, y, tx: target.left + target.width / 2, ty: target.top + target.height / 2, image, quantity: quantity ?? 1 };
      setFlights((f) => [...f, flight]);
      setTimeout(() => {
        setFlights((f) => f.filter((p) => p.id !== id));
        // приземлились: корзина подпрыгивает, над ней всплывает «+N»
        window.dispatchEvent(new CustomEvent('nsrz:landed'));
        setPlus((p) => [...p, { id, x: flight.tx, y: flight.ty, quantity: flight.quantity }]);
        setTimeout(() => setPlus((p) => p.filter((q) => q.id !== id)), 1100);
      }, FLIGHT_SEC * 1000);
    };
    window.addEventListener('nsrz:fly', on);
    return () => window.removeEventListener('nsrz:fly', on);
  }, []);
  const size = 84;
  return (
    <>
      <AnimatePresence>
        {flights.map((p) => {
          const peak = Math.min(p.y, p.ty) - 160;
          return (
            <motion.div
              key={p.id}
              className={p.image ? 'fly-item' : 'fly-dot'}
              style={p.image ? { width: size, height: size * 0.75, backgroundImage: `url(${p.image})` } : undefined}
              initial={{ x: p.x - size / 2, y: p.y - size * 0.375, scale: 1, rotate: 0, opacity: 1 }}
              animate={{
                x: [p.x - size / 2, p.x - size / 2 + (p.tx - p.x) * 0.35, p.tx - size / 2],
                y: [p.y - size * 0.375, peak, p.ty - size * 0.375],
                scale: [1, 1.15, 0.22],
                rotate: [0, -12, 8],
                opacity: [1, 1, 0.85],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: FLIGHT_SEC, times: [0, 0.45, 1], ease: ['easeOut', 'easeIn'] }}
            />
          );
        })}
      </AnimatePresence>
      <AnimatePresence>
        {plus.map((p) => (
          <motion.div
            key={p.id}
            className="fly-plus"
            initial={{ x: p.x + 6, y: p.y - 10, opacity: 0, scale: 0.6 }}
            animate={{ y: p.y - 44, opacity: [0, 1, 1, 0], scale: 1 }}
            transition={{ duration: 1.05, ease }}
          >
            +{p.quantity}
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );
}

export default function ClientLayout() {
  const { user } = useAuth();
  const { data: dict } = useDictionaries();
  const location = useLocation();

  return (
    <div className="client-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <Logo />
            <span>
              НСРЗ · Запчасти
              <small>Склад Новороссийского судоремонтного завода</small>
            </span>
          </Link>
          <nav className="nav">
            {LINKS.map((l) => {
              const active = l.end ? location.pathname === '/' || location.pathname.startsWith('/parts') : location.pathname.startsWith(l.to);
              return (
                <NavLink key={l.to} to={l.to} className={active ? 'active' : ''}>
                  {l.label}
                  {active && <motion.span layoutId="nav-indicator" className="nav-indicator" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                </NavLink>
              );
            })}
          </nav>
          <CartButton />
          <Tooltip title={`${user?.fullName ?? ''} · профиль и суда`}>
            <Link to="/profile" aria-label="Профиль">
              <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}>
                <Avatar size={40} style={{ background: '#F6E3D6', color: '#9C4422', cursor: 'pointer', fontWeight: 700 }}>
                  {user?.fullName.split(' ').slice(0, 2).map((p) => p[0]).join('')}
                </Avatar>
              </motion.div>
            </Link>
          </Tooltip>
          <LogoutButton />
        </div>
      </header>

      <main className="page">
        <AnimatedOutlet />
      </main>

      <motion.footer className="footer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.5, ease }}>
        <div className="footer-inner">
          <span>АО «Новороссийский судоремонтный завод» · отдел продаж: +7 8617 00-00-00</span>
          <SyncPill at={dict?.stockUpdatedAt} />
        </div>
      </motion.footer>
      <FlyToCart />
    </div>
  );
}
