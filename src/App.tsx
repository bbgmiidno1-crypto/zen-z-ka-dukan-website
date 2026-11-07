import { lazy, Suspense, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Footer } from '@/components/Footer';
import { GoldenZLoader } from '@/components/GoldenZLoader';
import { Navbar } from '@/components/Navbar';
import { WaterDroplet } from '@/components/WaterDroplet';
import { WaterSurface } from '@/components/WaterSurface';
import { LoadingBlock } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { nextParam } from '@/lib/format';
import { useLuxuryInteractions } from '@/lib/interactions';
import { prefersReducedMotion, usePageTransition } from '@/lib/motion';

const HomePage = lazy(() => import('@/pages/HomePage'));
const ShopPage = lazy(() => import('@/pages/ShopPage'));
const ProductPage = lazy(() => import('@/pages/ProductPage'));
const CheckoutPage = lazy(() => import('@/pages/CheckoutPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'));
const AccountPage = lazy(() => import('@/pages/AccountPage'));
const OrdersPage = lazy(() => import('@/pages/OrdersPage'));
const OrderTrackingPage = lazy(() => import('@/pages/OrderTrackingPage'));
const PolicyPage = lazy(() => import('@/pages/PolicyPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const AdminApp = lazy(() => import('@/admin/AdminApp'));

function RequireCustomer({ children }: { children: ReactNode }) {
  const { customer, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingBlock label="Checking your session…" />;
  if (!customer) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${nextParam(next)}`} replace />;
  }
  return <>{children}</>;
}

function SiteLayout() {
  const location = useLocation();
  const contentRef = useRef<HTMLElement | null>(null);
  const curtainRef = useRef<HTMLDivElement | null>(null);
  usePageTransition(location.pathname, contentRef, curtainRef);

  useEffect(() => {
    if (location.hash) {
      const timer = window.setTimeout(() => {
        const element = document.getElementById(location.hash.slice(1));
        if (element) element.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      }, 120);
      return () => window.clearTimeout(timer);
    }
    window.scrollTo(0, 0);
    return undefined;
  }, [location.pathname, location.hash, location.search]);

  const introComplete = useCallback(() => {
    window.dispatchEvent(new CustomEvent('zzkd:intro-complete'));
  }, []);

  return (
    <div className="page-shell">
      <WaterSurface fixed opacity={0.9} />
      <GoldenZLoader onComplete={introComplete} />
      <div ref={curtainRef} className="route-curtain route-curtain-liquid" aria-hidden="true" />
      <WaterDroplet />
      <Navbar />
      <main ref={contentRef}>
        <Suspense fallback={<LoadingBlock />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/shop" element={<ShopPage />} />
            <Route path="/product/:slug" element={<ProductPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/account" element={<RequireCustomer><AccountPage /></RequireCustomer>} />
            <Route path="/orders" element={<RequireCustomer><OrdersPage /></RequireCustomer>} />
            <Route path="/orders/:id" element={<RequireCustomer><OrderTrackingPage /></RequireCustomer>} />
            <Route path="/policies/:slug" element={<PolicyPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  useLuxuryInteractions();
  return (
    <Routes>
      <Route path="/admin/*" element={<Suspense fallback={<LoadingBlock label="Opening secure console…" />}><AdminApp /></Suspense>} />
      <Route path="*" element={<SiteLayout />} />
    </Routes>
  );
}
