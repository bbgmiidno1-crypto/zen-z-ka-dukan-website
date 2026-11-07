import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, Truck, X } from 'lucide-react';
import type { Category, PaginatedProducts, ProductSummary } from '@shared/types';
import { ProductCard } from '@/components/ProductCard';
import { Breadcrumb, EmptyState, LoadingBlock } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

const SORTS = [
  { value: 'editorial', label: 'Editorial selection' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price-low', label: 'Price: low to high' },
  { value: 'price-high', label: 'Price: high to low' },
  { value: 'discount', label: 'Greatest reduction' },
  { value: 'name', label: 'Name: A–Z' },
];

export default function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [result, setResult] = useState<PaginatedProducts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState(searchParams.get('search') || '');

  const category = searchParams.get('category') || '';
  const collection = searchParams.get('collection') || '';
  const search = searchParams.get('search') || '';
  const sort = searchParams.get('sort') || 'editorial';
  const page = Math.max(1, Number(searchParams.get('page') || 1));

  useEffect(() => {
    let active = true;
    api.get<{ categories: Category[] }>('/api/categories')
      .then((data) => { if (active) setCategories(data.categories); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.get<PaginatedProducts>('/api/products', {
      category: category || undefined,
      collection: collection || undefined,
      search: search || undefined,
      sort,
      page,
      limit: 12,
    })
      .then((data) => { if (active) setResult(data); })
      .catch((err) => { if (active) setError(errorMessage(err, 'Unable to load products.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [category, collection, search, sort, page]);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  const activeCategory = categories.find((item) => item.slug === category);
  const pageTitle = useMemo(() => {
    if (search) return `Search: ${search}`;
    if (activeCategory) return activeCategory.name;
    if (collection === 'new') return 'New Arrivals';
    if (collection === 'best') return 'Best Sellers';
    if (collection === 'featured') return 'Signature Pieces';
    return 'The Complete Edit';
  }, [search, activeCategory, collection]);

  function setParam(key: string, value?: string, resetPage = true) {
    const next = new URLSearchParams(searchParams);
    if (!value) next.delete(key);
    else next.set(key, value);
    if (resetPage) next.delete('page');
    if (key === 'category' && value) next.delete('collection');
    if (key === 'collection' && value) next.delete('category');
    setSearchParams(next);
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams());
    setSearchDraft('');
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setParam('search', searchDraft.trim() || undefined);
  }

  const chips = categories.map((item) => {
    const isSpecialNew = item.specialFilter === 'new_arrival';
    const isSpecialBest = item.specialFilter === 'best_seller';
    return {
      id: item.id,
      label: item.name,
      key: isSpecialNew ? 'collection' : isSpecialBest ? 'collection' : 'category',
      value: isSpecialNew ? 'new' : isSpecialBest ? 'best' : item.slug,
      active: isSpecialNew ? collection === 'new' : isSpecialBest ? collection === 'best' : category === item.slug,
    };
  });

  return (
    <div>
      <section className="page-top">
        <div className="container-luxe">
          <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Shop' }, ...(activeCategory ? [{ label: activeCategory.name }] : [])]} />
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8" style={{ marginTop: 18 }}>
            <div>
              <div className="eyebrow eyebrow-line">ZEN Z KA DUKAN · Collections</div>
              <h1 style={{ marginTop: 14 }}>{pageTitle}</h1>
              <p className="luxe-subtitle" style={{ marginTop: 16, maxWidth: 560 }}>
                One considered piece at a time. Choose your colour and size, then buy directly with Cash on Delivery.
              </p>
            </div>
            <form className="flex gap-2 w-full lg:w-[380px]" onSubmit={submitSearch} role="search">
              <input className="input" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search the collection" aria-label="Search products" />
              <button className="btn btn-gold" type="submit" aria-label="Search"><Search size={16} /></button>
            </form>
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="container-luxe">
          <div className="grid lg:grid-cols-[230px_1fr] gap-8 items-start">
            <aside className="hidden lg:block panel panel-pad" style={{ position: 'sticky', top: 100 }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 20 }}>
                <SlidersHorizontal size={16} className="gold-text" />
                <span className="eyebrow">Refine</span>
              </div>
              <div className="eyebrow" style={{ color: '#77716a' }}>Collections</div>
              <div className="grid gap-2" style={{ marginTop: 12 }}>
                <button type="button" onClick={clearFilters} className={`filter-side-link ${!category && !collection ? 'active' : ''}`}>All pieces</button>
                {categories.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`filter-side-link ${chips.find((chip) => chip.id === item.id)?.active ? 'active' : ''}`}
                    onClick={() => {
                      const chip = chips.find((entry) => entry.id === item.id)!;
                      setParam(chip.key, chip.value);
                    }}
                  >
                    {item.name}
                    <span>{item.productCount ?? 0}</span>
                  </button>
                ))}
              </div>
              <hr className="divider" style={{ margin: '24px 0' }} />
              <div className="notice"><Truck size={15} className="inline" /> Cash on Delivery only.<br />Delivery charge: ₹0.</div>
            </aside>

            <div className="min-w-0">
              <div className="filter-chips lg:hidden" aria-label="Category filters">
                <button className={`filter-chip ${!category && !collection ? 'active' : ''}`} onClick={clearFilters}>All</button>
                {chips.map((chip) => (
                  <button key={chip.id} className={`filter-chip ${chip.active ? 'active' : ''}`} onClick={() => setParam(chip.key, chip.value)}>{chip.label}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: 22 }}>
                <div className="muted" style={{ fontSize: '.78rem' }}>
                  {loading ? 'Curating…' : `${result?.total ?? 0} pieces`}
                  {(category || collection || search) && <button className="btn btn-ghost btn-small" onClick={clearFilters} type="button"><X size={13} /> Clear</button>}
                </div>
                <label className="flex items-center gap-2">
                  <span className="eyebrow">Sort</span>
                  <select className="select" style={{ minWidth: 210 }} value={sort} onChange={(event) => setParam('sort', event.target.value)} aria-label="Sort products">
                    {SORTS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>

              {error ? (
                <EmptyState title="Could not load the edit" description={error} action={<button className="btn btn-gold" onClick={() => setParam('page', String(page))}>Retry</button>} />
              ) : loading && !result ? (
                <LoadingBlock label="Curating pieces…" />
              ) : result && result.products.length ? (
                <>
                  <div className="product-grid">
                    {result.products.map((product: ProductSummary) => <ProductCard product={product} key={product.id} />)}
                  </div>
                  <div className="flex items-center justify-center gap-3" style={{ marginTop: 36 }}>
                    <button className="icon-btn" type="button" disabled={result.page <= 1} onClick={() => setParam('page', String(result.page - 1), false)} aria-label="Previous page"><ChevronLeft size={18} /></button>
                    <span className="muted" style={{ fontSize: '.76rem' }}>Page {result.page} of {result.pages}</span>
                    <button className="icon-btn" type="button" disabled={result.page >= result.pages} onClick={() => setParam('page', String(result.page + 1), false)} aria-label="Next page"><ChevronRight size={18} /></button>
                  </div>
                </>
              ) : (
                <EmptyState
                  title="No pieces found"
                  description="Try another category, a different search term, or clear the filters."
                  action={<button className="btn btn-gold" type="button" onClick={clearFilters}>Clear filters</button>}
                />
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
