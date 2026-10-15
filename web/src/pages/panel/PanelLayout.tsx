import { BarChartOutlined, DatabaseOutlined, InboxOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { App, Avatar, Badge, Layout, Menu } from 'antd';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { StaffOrdersPage } from '../../api/types';
import { useAuth } from '../../auth';
import { LogoutButton } from '../../components/LogoutButton';
import { AnimatedOutlet, Logo } from '../../components/ui';
import { ROLE_TITLES } from '../../format';

const TITLES: Record<string, string> = {
  '/panel': 'Очередь заказов',
  '/panel/stock': 'Остатки на складе',
  '/panel/stats': 'Статистика заказов',
  '/panel/admin': 'Пользователи и справочники',
};

export function usePendingQueue() {
  return useQuery({
    queryKey: ['panel', 'orders', 'PENDING', ''],
    queryFn: () => api.get<StaffOrdersPage>('/panel/orders?status=PENDING'),
    refetchInterval: 10_000, // новые заказы появляются в очереди не позже чем через 10 секунд
  });
}

export default function PanelLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { notification } = App.useApp();
  const { data } = usePendingQueue();
  const pending = data?.counts.PENDING ?? 0;
  const known = useRef<Set<number> | null>(null);

  // всплывающее уведомление о новом заказе
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.items.map((o) => o.id));
    if (known.current) {
      for (const o of data.items) {
        if (!known.current.has(o.id)) {
          notification.open({
            message: `Новый заказ ${o.number}`,
            description: `${o.company.name}, ${o.vessel.name} — ${o.itemsCount} поз.`,
            placement: 'bottomRight',
            onClick: () => navigate(`/panel/orders/${o.id}`),
            style: { cursor: 'pointer', borderLeft: '4px solid #B4532A' },
          });
        }
      }
    }
    known.current = ids;
  }, [data, navigate, notification]);

  const selected = location.pathname.startsWith('/panel/orders') ? '/panel' : location.pathname;
  const title = location.pathname.startsWith('/panel/orders') ? 'Обработка заказа' : TITLES[location.pathname] ?? 'Панель НСРЗ';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider width={256} breakpoint="lg" collapsedWidth={0} style={{ position: 'sticky', top: 0, height: '100vh' }}>
        <div className="panel-logo">
          <Logo size={40} />
          <span>
            Панель НСРЗ
            <small>Заказ запчастей</small>
          </span>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          onClick={(e) => navigate(e.key)}
          style={{ padding: '8px 12px', borderInlineEnd: 0 }}
          items={[
            {
              key: '/panel',
              icon: <InboxOutlined />,
              label: (
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  Очередь заказов <Badge count={pending} color="#8A5208" />
                </span>
              ),
            },
            { key: '/panel/stock', icon: <DatabaseOutlined />, label: 'Остатки на складе' },
            { key: '/panel/stats', icon: <BarChartOutlined />, label: 'Статистика' },
            { key: '/panel/admin', icon: <TeamOutlined />, label: 'Пользователи и справочники' },
          ]}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header className="panel-header" style={{ position: 'sticky', top: 0, zIndex: 20 }}>
          <h2 style={{ margin: 0, fontSize: 21, letterSpacing: '-0.01em' }}>{title}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
              <div style={{ fontWeight: 600 }}>{user?.fullName}</div>
              <div className="faint" style={{ fontSize: 12.5 }}>
                {ROLE_TITLES[user?.role ?? 'SALES']}
              </div>
            </div>
            <Avatar style={{ background: '#F6E3D6', color: '#9C4422', fontWeight: 700 }}>
              {user?.fullName.split(' ').slice(0, 2).map((p) => p[0]).join('')}
            </Avatar>
            <LogoutButton />
          </div>
        </Layout.Header>
        <Layout.Content className="panel-content">
          <AnimatedOutlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
