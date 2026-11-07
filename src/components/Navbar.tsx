import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Heart, Menu, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import type { Category } from '@shared/types';
import { Brand } from '@/components/Brand';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useWishlist } from '@/context/WishlistContext';

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { customer } = useAuth();
  const wishlist = useWishlist();
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    api.get<{ categories: Category[] }>('/api/categories')
      .then((data) => {
        if (active) setCategories(data.categories.filter((category) => !category.specialFilter).slice(0, 4));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    navigate(`/shop?search=${encodeURIComponent(search.trim())}`);
    setMenuOpen(false);
  }

  const navItems = [
    { label: 'The House', to: '/#house', match: '/' },
    ...categories.map((category) => ({ label: category.name, to: `/shop?category=${category.slug}`, match: `/shop?category=${category.slug}` })),
    { label: 'New Arrivals', to: '/shop?collection=new', match: '/shop?collection=new' },
    { label: 'All Pieces', to: '/shop', match: '/shop' },
  ];
  const current = `${location.pathname}${location.search}`;

  return (
    <>
      <header className="nav-shell">
        <div className="nav-inner">
          <Brand />
          <nav className="nav-links" aria-label="Primary navigation">
            {navItems.map((item) => (
              <Link key={item.label} to={item.to} className={`nav-link ${current === item.match ? 'active' : ''}`}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="nav-actions">
            <form className="nav-search" onSubmit={submitSearch} role="search">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pieces" aria-label="Search products" />
              <button type="submit" aria-label="Submit search"><Search size={16} /></button>
            </form>
            <Link to="/account?tab=wishlist" className="icon-btn nav-wish" aria-label={`Wishlist${wishlist.count ? `, ${wishlist.count} saved` : ''}`}>
              <Heart size={18} strokeWidth={1.7} />
              {wishlist.count > 0 && <span className="wish-count">{wishlist.count > 9 ? '9+' : wishlist.count}</span>}
            </Link>
            <Link to={customer ? '/account' : '/login'} className="icon-btn" aria-label={customer ? 'My account' : 'Sign in'}>
              <UserRound size={18} />
            </Link>
            <Link to="/admin" className="icon-btn" aria-label="Admin console">
              <ShieldCheck size={18} />
            </Link>
            <button type="button" className="icon-btn nav-toggle" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Close menu' : 'Open menu'}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>
      {menuOpen && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <Link to="/">The House</Link>
          <Link to="/shop">All Pieces</Link>
          {categories.map((category) => <Link key={category.id} to={`/shop?category=${category.slug}`}>{category.name}</Link>)}
          <Link to="/shop?collection=new">New Arrivals</Link>
          <Link to="/shop?collection=best">Best Sellers</Link>
          <Link to="/account?tab=wishlist">Wishlist{wishlist.count ? ` (${wishlist.count})` : ''}</Link>
          <Link to={customer ? '/orders' : '/login'}>{customer ? 'Track Orders' : 'Sign In'}</Link>
          <Link to="/admin">Admin Console</Link>
        </nav>
      )}
    </>
  );
}
