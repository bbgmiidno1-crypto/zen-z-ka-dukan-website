import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from '@/admin/AdminLayout';
import { AdminLogin, AdminSetup } from '@/admin/AdminAuth';
import { LoadingBlock } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

const AdminOverview = lazy(() => import('@/admin/pages/AdminOverview'));
const AdminProducts = lazy(() => import('@/admin/pages/AdminProducts'));
const AdminProductForm = lazy(() => import('@/admin/pages/AdminProductForm'));
const AdminCategories = lazy(() => import('@/admin/pages/AdminCategories'));
const AdminCustomers = lazy(() => import('@/admin/pages/AdminCustomers'));
const AdminCustomerDetail = lazy(() => import('@/admin/pages/AdminCustomerDetail'));
const AdminOrders = lazy(() => import('@/admin/pages/AdminOrders'));
const AdminOrderDetail = lazy(() => import('@/admin/pages/AdminOrderDetail'));

function Workspace() {
  return (
    <AdminLayout>
      <Suspense fallback={<LoadingBlock label="Loading secure console…" />}>
        <Routes>
          <Route path="/" element={<AdminOverview />} />
          <Route path="/products" element={<AdminProducts />} />
          <Route path="/products/new" element={<AdminProductForm />} />
          <Route path="/products/:id/edit" element={<AdminProductForm />} />
          <Route path="/categories" element={<AdminCategories />} />
          <Route path="/customers" element={<AdminCustomers />} />
          <Route path="/customers/:id" element={<AdminCustomerDetail />} />
          <Route path="/orders" element={<AdminOrders />} />
          <Route path="/orders/:id" element={<AdminOrderDetail />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>
    </AdminLayout>
  );
}

export default function AdminApp() {
  const { admin, adminConfigured, loading } = useAuth();
  if (loading) return <div className="admin-app"><LoadingBlock label="Verifying administrator session…" /></div>;
  return (
    <Routes>
      <Route path="/setup" element={admin ? <Navigate to="/admin" replace /> : <AdminSetup />} />
      <Route path="/login" element={admin ? <Navigate to="/admin" replace /> : <AdminLogin />} />
      <Route
        path="/*"
        element={admin
          ? <Workspace />
          : <Navigate to={adminConfigured ? '/admin/login' : '/admin/setup'} replace />}
      />
    </Routes>
  );
}
