import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShieldCheck,
  Store,
  Tags,
  Users,
  X,
} from 'lucide-react';
import { Brand } from '@/components/Brand';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { errorMessage } from '@/lib/api';

const NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/categories', label: 'Categories', icon: Tags },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { to: '/admin/customers', label: 'Customers', icon: Users },
];

function titleFor(pathname: string): string {
  if (pathname.includes('/products/new')) return 'Add Product';
  if (pathname.includes('/products/') && pathname.includes('/edit')) return 'Edit Product';
  const match = NAV.find((item) => item.to !== '/admin' && pathname.startsWith(item.to));
  return match?.label || 'Dashboard Overview';
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { admin, logoutAdmin } = useAuth();
  const { showToast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  async function logout() {
    try {
      await logoutAdmin();
      showToast('Administrator session closed.', 'success');
      navigate('/admin/login', { replace: true });
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  return (
    <div className="admin-app">
      <div className={`admin-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      <div className="admin-shell">
        <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <Brand compact to="/admin" />
          <div className="admin-caption">Secure console</div>
          <nav className="admin-nav" aria-label="Admin navigation">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}>
                <Icon size={17} /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="admin-caption">Shortcuts</div>
          <nav className="admin-nav">
            <Link className="admin-nav-link" to="/admin/products/new"><Package size={17} /> Add Product</Link>
            <Link className="admin-nav-link" to="/admin/orders"><ClipboardList size={17} /> Recent Orders</Link>
            <Link className="admin-nav-link" to="/"><Store size={17} /> View Storefront</Link>
          </nav>
          <div className="admin-sidebar-bottom">
            <div className="notice" style={{ fontSize: '.7rem', marginBottom: 14 }}>
              <ShieldCheck size={14} className="inline" /> Server-side admin session active.
            </div>
            <button className="btn btn-outline btn-full btn-small" type="button" onClick={logout}><LogOut size={14} /> Sign out</button>
          </div>
        </aside>

        <div className="admin-main">
          <header className="admin-topbar">
            <div className="flex items-center gap-3">
              <button className="icon-btn admin-mobile-toggle" type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}>
                {sidebarOpen ? <X size={19} /> : <Menu size={19} />}
              </button>
              <div>
                <div className="eyebrow" style={{ fontSize: '.55rem' }}>ZEN Z KA DUKAN / ADMIN</div>
                <h2>{titleFor(location.pathname)}</h2>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="muted hidden sm:inline" style={{ fontSize: '.72rem' }}>{admin?.username}</span>
              <Link className="icon-btn" to="/" aria-label="View storefront"><Store size={17} /></Link>
              <button className="icon-btn" type="button" onClick={logout} aria-label="Sign out"><LogOut size={17} /></button>
            </div>
          </header>
          <main className="admin-content">{children}</main>
        </div>
      </div>
    </div>
  );
}
