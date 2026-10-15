import { LogoutOutlined, ShoppingCartOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button, Dropdown } from 'antd';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useCart, useDictionaries } from '../../api/hooks';
import { useAuth } from '../../auth';
import { AnimatedOutlet, Logo, SyncPill } from '../../components/ui';

const LINKS = [
  { to: '/', label: 'Каталог', end: true },
  { to: '/orders', label: 'Мои заказы' },
];

/** Иконка корзины подпрыгивает, когда количество меняется. */
function CartButton() {
  const { data } = useCart();
  const count = data?.count ?? 0;
  const prev = useRef(count);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (count !== prev.current) setBump((b) => b + 1);
    prev.current = count;
  }, [count]);
  return (
    <Link to="/cart" aria-label="Корзина">
      <motion.div key={bump} animate={bump ? { scale: [1, 1.25, 0.92, 1.06, 1], rotate: [0, -8, 6, 0] } : {}} transition={{ duration: 0.55 }}>
        <Badge count={count} overflowCount={99} color="#B4532A" offset={[-2, 4]}>
          <Button shape="circle" size="large" icon={<ShoppingCartOutlined style={{ fontSize: 20 }} />} />
        </Badge>
      </motion.div>
    </Link>
  );
}

export default function ClientLayout() {
  const { user, signOut } = useAuth();
  const { data: dict } = useDictionaries();
  const navigate = useNavigate();
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
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'who', label: <div style={{ minWidth: 200 }}><b>{user?.fullName}</b><div className="faint" style={{ fontSize: 13 }}>{user?.company?.name}</div></div>, disabled: true },
                { type: 'divider' },
                { key: 'profile', icon: <UserOutlined />, label: 'Профиль и суда', onClick: () => navigate('/profile') },
                { key: 'logout', icon: <LogoutOutlined />, label: 'Выйти', danger: true, onClick: () => signOut().then(() => navigate('/login')) },
              ],
            }}
          >
            <Avatar size={40} style={{ background: '#F6E3D6', color: '#9C4422', cursor: 'pointer', fontWeight: 700 }}>
              {user?.fullName.split(' ').slice(0, 2).map((p) => p[0]).join('')}
            </Avatar>
          </Dropdown>
        </div>
      </header>

      <main className="page">
        <AnimatedOutlet />
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <span>АО «Новороссийский судоремонтный завод» · отдел продаж: +7 8617 00-00-00</span>
          <SyncPill at={dict?.stockUpdatedAt} />
        </div>
      </footer>
    </div>
  );
}
