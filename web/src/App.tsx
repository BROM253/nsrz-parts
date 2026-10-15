import { Spin } from 'antd';
import { lazy, ReactNode, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { isStaff, useAuth } from './auth';
import LoginPage from './pages/LoginPage';

// Страницы грузятся по требованию: на узком канале первая загрузка — только вход и каркас.
const ClientLayout = lazy(() => import('./pages/client/ClientLayout'));
const CartPage = lazy(() => import('./pages/client/CartPage'));
const CatalogPage = lazy(() => import('./pages/client/CatalogPage'));
const CheckoutPage = lazy(() => import('./pages/client/CheckoutPage'));
const OrderPage = lazy(() => import('./pages/client/OrderPage'));
const OrdersPage = lazy(() => import('./pages/client/OrdersPage'));
const PartPage = lazy(() => import('./pages/client/PartPage'));
const ProfilePage = lazy(() => import('./pages/client/ProfilePage'));
const AppPage = lazy(() => import('./pages/AppPage'));
const AdminPage = lazy(() => import('./pages/panel/AdminPage'));
const PanelLayout = lazy(() => import('./pages/panel/PanelLayout'));
const ProcessOrderPage = lazy(() => import('./pages/panel/ProcessOrderPage'));
const QueuePage = lazy(() => import('./pages/panel/QueuePage'));
const StatsPage = lazy(() => import('./pages/panel/StatsPage'));
const StockPage = lazy(() => import('./pages/panel/StockPage'));

export const PageSpinner = () => (
  <div style={{ minHeight: '50vh', display: 'grid', placeItems: 'center' }}>
    <Spin size="large" />
  </div>
);

function Guard({ staff, children }: { staff: boolean; children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // судовладелец не попадает в панель, сотрудник — в кабинет судовладельца
  if (staff !== isStaff(user)) return <Navigate to={isStaff(user) ? '/panel' : '/'} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<PageSpinner />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/app" element={<AppPage />} />
      <Route
        path="/panel"
        element={
          <Guard staff>
            <PanelLayout />
          </Guard>
        }
      >
        <Route index element={<QueuePage />} />
        <Route path="orders/:id" element={<ProcessOrderPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
      <Route
        path="/"
        element={
          <Guard staff={false}>
            <ClientLayout />
          </Guard>
        }
      >
        <Route index element={<CatalogPage />} />
        <Route path="parts/:id" element={<PartPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:id" element={<OrderPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
