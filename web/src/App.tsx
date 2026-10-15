import { Spin } from 'antd';
import { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { isStaff, useAuth } from './auth';
import ClientLayout from './pages/client/ClientLayout';
import CartPage from './pages/client/CartPage';
import CatalogPage from './pages/client/CatalogPage';
import CheckoutPage from './pages/client/CheckoutPage';
import OrderPage from './pages/client/OrderPage';
import OrdersPage from './pages/client/OrdersPage';
import PartPage from './pages/client/PartPage';
import ProfilePage from './pages/client/ProfilePage';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/panel/AdminPage';
import PanelLayout from './pages/panel/PanelLayout';
import ProcessOrderPage from './pages/panel/ProcessOrderPage';
import QueuePage from './pages/panel/QueuePage';
import StatsPage from './pages/panel/StatsPage';
import StockPage from './pages/panel/StockPage';

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
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
  );
}
