import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Pencil, Plus, Power, Search, Sparkles, Star, Trash2, TrendingUp } from 'lucide-react';
import type { Category, ProductSummary } from '@shared/types';
import { AdminAsyncState, AdminPageHeader } from '@/admin/AdminUI';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/lib/api';
import { formatINR } from '@/lib/format';

type FlagKey = 'featured' | 'newArrival' | 'bestSeller' | 'available';
type StockFilter = 'all' | 'low' | 'out';

const FLAGS: Array<{ key: FlagKey; label: string; icon: typeof Star }> = [
  { key: 'featured', label: 'Featured', icon: Star },
  { key: 'newArrival', label: 'New Arrival', icon: Sparkles },
  { key: 'bestSeller', label: 'Best Seller', icon: TrendingUp },
  { key: 'available', label: 'Available', icon: Power },
];

export default function AdminProducts() {
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>(() => {
    const initial = searchParams.get('stock');
    return initial === 'low' || initial === 'out' ? initial : 'all';
  });
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ products: ProductSummary[]; categories: Category[] }>('/api/admin/products', {
        search: appliedSearch || undefined,
        category: categoryFilter || undefined,
        stock: stockFilter,
        limit: 100,
      });
      setProducts(response.products);
      setCategories(response.categories);
    } catch (err) {
      setError(errorMessage(err, 'Unable to load products.'));
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, categoryFilter, stockFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setAppliedSearch(searchDraft.trim());
  }

  function clearFilters() {
    setSearchDraft('');
    setAppliedSearch('');
    setCategoryFilter('');
    setStockFilter('all');
  }

  async function toggleFlag(product: ProductSummary, key: FlagKey) {
    setBusyId(product.id);
    try {
      const next = !product[key];
      await api.patch(`/api/admin/products/${product.id}/flags`, { [key]: next });
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, [key]: next } : item));
      showToast(`${key === 'newArrival' ? 'New Arrival' : key === 'bestSeller' ? 'Best Seller' : key[0].toUpperCase() + key.slice(1)} updated.`, 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProduct(product: ProductSummary) {
    if (!window.confirm(`Remove "${product.name}" from the storefront? Order history will remain intact.`)) return;
    setBusyId(product.id);
    try {
      await api.delete(`/api/admin/products/${product.id}`);
      setProducts((current) => current.filter((item) => item.id !== product.id));
      showToast('Product removed from the active catalogue.', 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Product management"
        title="Products & inventory"
        description="Create products, upload colour-variant imagery, manage sizes, stock, availability and merchandising flags."
        action={<Link className="btn btn-gold btn-small" to="/admin/products/new"><Plus size={14} /> Add Product</Link>}
      />

      <form className="admin-toolbar" onSubmit={applyFilters}>
        <input className="input search-input" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search by name or slug" aria-label="Search products" />
        <select className="select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
        </select>
        <select className="select" value={stockFilter} onChange={(event) => setStockFilter(event.target.value as StockFilter)} aria-label="Filter by stock">
          <option value="all">All stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        <button className="btn btn-outline btn-small" type="submit"><Search size={14} /> Apply</button>
        <button className="btn btn-ghost btn-small" type="button" onClick={clearFilters}>Clear</button>
      </form>

      <AdminAsyncState loading={loading} error={error} empty={!products.length} emptyTitle="No products match these filters" emptyDescription="Adjust the filters or add a new product.">
        <div className="admin-card">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Merchandising</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <img className="admin-thumb" src={product.primaryThumb || product.primaryImage || '/media/seed/editorial/campaign.webp'} alt="" loading="lazy" />
                        <div><div style={{ color: 'var(--white)' }}>{product.name}</div><div className="muted" style={{ fontSize: '.66rem' }}>/{product.slug}</div></div>
                      </div>
                    </td>
                    <td>{product.categoryName}</td>
                    <td><div>{formatINR(product.pricePaise)}</div><div className="muted" style={{ fontSize: '.66rem' }}>{product.discountPercent}% off</div></td>
                    <td><span className={`badge ${product.totalStock <= 3 ? 'badge-danger' : ''}`}>{product.totalStock} units</span></td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {FLAGS.map(({ key, label, icon: Icon }) => (
                          <button
                            key={key}
                            type="button"
                            className={`admin-flag ${product[key] ? 'active' : ''}`}
                            disabled={busyId === product.id}
                            onClick={() => toggleFlag(product, key)}
                            title={`Toggle ${label}`}
                            aria-label={`Toggle ${label}`}
                            aria-pressed={product[key]}
                          >
                            <Icon size={13} />
                          </button>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <Link className="icon-btn" style={{ width: 36, height: 36 }} to={`/admin/products/${product.id}/edit`} aria-label={`Edit ${product.name}`}><Pencil size={15} /></Link>
                        <button className="icon-btn" style={{ width: 36, height: 36 }} type="button" onClick={() => deleteProduct(product)} disabled={busyId === product.id} aria-label={`Delete ${product.name}`}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AdminAsyncState>
    </div>
  );
}
