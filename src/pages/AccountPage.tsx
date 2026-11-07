import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Heart, LogOut, MapPin, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import type { Address, Order, ProductSummary } from '@shared/types';
import { RecoveryCodeOverlay } from '@/components/RecoveryCodeOverlay';
import { Breadcrumb, EmptyState, LoadingBlock, StatusPill } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/lib/api';
import { useWishlist } from '@/context/WishlistContext';
import { formatDate, formatINR } from '@/lib/format';

interface AddressDraft {
  label: string;
  fullName: string;
  mobile: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

function draftFor(customerName: string, mobile: string): AddressDraft {
  return { label: 'Home', fullName: customerName, mobile, line1: '', line2: '', city: '', state: '', pincode: '', isDefault: false };
}

export default function AccountPage() {
  const { customer, refresh, logoutCustomer } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const wishlist = useWishlist();
  const [wishProducts, setWishProducts] = useState<ProductSummary[]>([]);
  const [wishBusy, setWishBusy] = useState<number | null>(null);
  const wishlistOpen = searchParams.get('tab') === 'wishlist';
  const [profileName, setProfileName] = useState(customer?.name || '');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileBusy, setProfileBusy] = useState(false);
  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [addressDraft, setAddressDraft] = useState<AddressDraft>(() => draftFor(customer?.name || '', customer?.mobile || ''));
  const [addressBusy, setAddressBusy] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [newRecoveryCode, setNewRecoveryCode] = useState('');

  const load = useCallback(async () => {
    try {
      const [addressData, orderData] = await Promise.all([
        api.get<{ addresses: Address[] }>('/api/customer/addresses'),
        api.get<{ orders: Order[] }>('/api/customer/orders'),
      ]);
      setAddresses(addressData.addresses);
      setOrders(orderData.orders);
    } catch (err) {
      showToast(errorMessage(err, 'Unable to load your account.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setProfileName(customer?.name || '');
    setAddressDraft((current) => ({ ...current, fullName: current.fullName || customer?.name || '', mobile: current.mobile || customer?.mobile || '' }));
  }, [customer]);

  async function updateProfile(event: FormEvent) {
    event.preventDefault();
    setProfileBusy(true);
    try {
      await api.put('/api/auth/profile', { name: profileName });
      await refresh();
      showToast('Profile updated.', 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setProfileBusy(false);
    }
  }

  function updateAddressField(event: ChangeEvent<HTMLInputElement>) {
    const target = event.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    setAddressDraft((current) => ({ ...current, [target.name]: value } as AddressDraft));
  }

  async function addAddress(event: FormEvent) {
    event.preventDefault();
    setAddressBusy(true);
    try {
      await api.post('/api/customer/addresses', addressDraft);
      setAddressFormOpen(false);
      setAddressDraft(draftFor(customer?.name || '', customer?.mobile || ''));
      await load();
      showToast('Address saved.', 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setAddressBusy(false);
    }
  }

  async function makeDefault(id: number) {
    try {
      const response = await api.put<{ addresses: Address[] }>(`/api/customer/addresses/${id}/default`);
      setAddresses(response.addresses);
      showToast('Default address updated.', 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function removeAddress(id: number) {
    if (!window.confirm('Remove this saved address?')) return;
    try {
      await api.delete(`/api/customer/addresses/${id}`);
      await load();
      showToast('Address removed.', 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function regenerateRecovery(event: FormEvent) {
    event.preventDefault();
    setRecoveryBusy(true);
    try {
      const response = await api.post<{ recoveryCode: string }>('/api/auth/recovery/regenerate', { password: recoveryPassword });
      setNewRecoveryCode(response.recoveryCode);
      setRecoveryPassword('');
      showToast('A new recovery code has been generated.', 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function logout() {
    try {
      await logoutCustomer();
      showToast('Signed out securely.', 'success');
      navigate('/', { replace: true });
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  const wishlistKey = [...wishlist.ids].sort((a, b) => a - b).join(',');

  useEffect(() => {
    if (!customer) {
      setWishProducts([]);
      return;
    }
    let active = true;
    const ids = wishlistKey ? wishlistKey.split(',').map(Number) : [];
    if (!ids.length) {
      setWishProducts([]);
      return undefined;
    }
    api.get<{ products: ProductSummary[] }>('/api/customer/wishlist')
      .then((data) => { if (active) setWishProducts(data.products); })
      .catch(() => { if (active) setWishProducts([]); });
    return () => { active = false; };
  }, [customer, wishlistKey]);

  async function removeWish(product: ProductSummary): Promise<void> {
    setWishBusy(product.id);
    await wishlist.toggle(product.id);
    setWishBusy(null);
  }

  if (loading) return <LoadingBlock label="Opening your private account…" />;

  return (
    <div>
      <section className="page-top" style={{ paddingBottom: 36 }}>
        <div className="container-luxe">
          <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Account' }]} />
          <div className="eyebrow eyebrow-line" style={{ marginTop: 18 }}>Private client space</div>
          <h1 style={{ marginTop: 14 }}>Hello, {customer?.name || 'Patron'}.</h1>
          <p className="luxe-subtitle" style={{ marginTop: 14 }}>Profile, saved addresses, order history and recovery security in one place.</p>
        </div>
      </section>

      <section className="section-tight" style={{ paddingTop: 40 }}>
        <div className="container-luxe grid lg:grid-cols-[0.9fr_1.1fr] gap-6 items-start">
          <div className="grid gap-6">
            <div className="panel panel-pad">
              <div className="flex items-center gap-2"><UserRound size={17} className="gold-text" /><h2 className="luxe-title" style={{ fontSize: '2rem' }}>Profile</h2></div>
              <form className="auth-stack" style={{ marginTop: 22 }} onSubmit={updateProfile}>
                <label>
                  <span className="field-label">Full name</span>
                  <input className="input" value={profileName} onChange={(event) => setProfileName(event.target.value)} required minLength={2} maxLength={80} autoComplete="name" />
                </label>
                <label>
                  <span className="field-label">Registered mobile</span>
                  <input className="input" value={customer?.mobile || ''} readOnly aria-label="Registered mobile number" />
                </label>
                <div className="muted" style={{ fontSize: '.7rem' }}>Client since {customer ? formatDate(customer.createdAt) : '—'}</div>
                <button className="btn btn-gold" type="submit" disabled={profileBusy}>{profileBusy ? 'Saving…' : 'Save profile'}</button>
              </form>
              <hr className="divider" style={{ margin: '24px 0' }} />
              <button className="btn btn-outline btn-full" type="button" onClick={logout}><LogOut size={15} /> Sign out</button>
            </div>

            <div className="panel panel-pad">
              <div className="flex items-center gap-2"><ShieldCheck size={17} className="gold-text" /><h2 className="luxe-title" style={{ fontSize: '2rem' }}>Recovery secret</h2></div>
              <p className="muted" style={{ marginTop: 14, lineHeight: 1.7, fontSize: '.82rem' }}>
                Generate a new recovery code if you no longer have the original. The old code is retired immediately and only a secure hash is stored.
              </p>
              <form className="auth-stack" style={{ marginTop: 18 }} onSubmit={regenerateRecovery}>
                <label>
                  <span className="field-label">Current password</span>
                  <input className="input" type="password" value={recoveryPassword} onChange={(event) => setRecoveryPassword(event.target.value)} required autoComplete="current-password" />
                </label>
                <button className="btn btn-outline" type="submit" disabled={recoveryBusy}>{recoveryBusy ? 'Generating…' : 'Generate new code'}</button>
              </form>
              <p className="muted" style={{ marginTop: 14, fontSize: '.7rem' }}>No OTP. No SMS. No email reset link.</p>
            </div>
          </div>

          <div className="grid gap-6">
            <div className="panel">
              <div className="admin-card-header">
                <div className="flex items-center gap-2"><MapPin size={17} className="gold-text" /><h3>Saved addresses</h3></div>
                <button className="btn btn-outline btn-small" type="button" onClick={() => setAddressFormOpen((open) => !open)}><Plus size={14} /> {addressFormOpen ? 'Close' : 'Add'}</button>
              </div>
              <div className="admin-card-body">
                {addressFormOpen && (
                  <form className="form-grid" style={{ marginBottom: 22 }} onSubmit={addAddress}>
                    <label><span className="field-label">Label</span><input className="input" name="label" value={addressDraft.label} onChange={updateAddressField} required maxLength={40} /></label>
                    <label><span className="field-label">Full name</span><input className="input" name="fullName" value={addressDraft.fullName} onChange={updateAddressField} required minLength={2} maxLength={80} /></label>
                    <label><span className="field-label">Mobile</span><input className="input" name="mobile" value={addressDraft.mobile} onChange={updateAddressField} required inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} /></label>
                    <label><span className="field-label">PIN code</span><input className="input" name="pincode" value={addressDraft.pincode} onChange={updateAddressField} required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} /></label>
                    <label className="span-2"><span className="field-label">Complete street address</span><input className="input" name="line1" value={addressDraft.line1} onChange={updateAddressField} required minLength={8} maxLength={180} /></label>
                    <label className="span-2"><span className="field-label">Landmark / additional address</span><input className="input" name="line2" value={addressDraft.line2} onChange={updateAddressField} maxLength={180} /></label>
                    <label><span className="field-label">City</span><input className="input" name="city" value={addressDraft.city} onChange={updateAddressField} required minLength={2} /></label>
                    <label><span className="field-label">State</span><input className="input" name="state" value={addressDraft.state} onChange={updateAddressField} required minLength={2} /></label>
                    <label className="checkbox-row span-2"><input type="checkbox" name="isDefault" checked={addressDraft.isDefault} onChange={updateAddressField} /> Make this my default address</label>
                    <div className="span-2"><button className="btn btn-gold" type="submit" disabled={addressBusy}>{addressBusy ? 'Saving…' : 'Save address'}</button></div>
                  </form>
                )}
                {addresses.length ? (
                  <div className="grid gap-3">
                    {addresses.map((address) => (
                      <div className="saved-address" key={address.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'start' }}>
                        <div>
                          <strong style={{ color: 'var(--gold)' }}>{address.label}{address.isDefault ? ' · Default' : ''}</strong><br />
                          {address.fullName} · {address.mobile}<br />
                          {address.line1}{address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state} {address.pincode}
                        </div>
                        <div className="flex gap-2" style={{ flex: 'none' }}>
                          {!address.isDefault && <button className="icon-btn" style={{ width: 36, height: 36 }} type="button" onClick={() => makeDefault(address.id)} aria-label="Make default">★</button>}
                          <button className="icon-btn" style={{ width: 36, height: 36 }} type="button" onClick={() => removeAddress(address.id)} aria-label="Remove address"><Trash2 size={15} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="muted" style={{ fontSize: '.82rem' }}>No saved addresses yet. Add one to make checkout faster.</p>}
              </div>
            </div>

            <div className="panel" id="wishlist" ref={(node) => { if (node && wishlistOpen) node.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}>
              <div className="admin-card-header">
                <div className="flex items-center gap-2"><Heart size={17} className="gold-text" /><h3>Wishlist</h3></div>
                <span className="muted" style={{ fontSize: '.72rem' }}>{wishlist.count} saved</span>
              </div>
              <div className="admin-card-body">
                {wishProducts.length ? (
                  <div className="wish-grid">
                    {wishProducts.map((product) => (
                      <div className="wish-row" key={product.id}>
                        <Link className="wish-thumb" to={`/product/${product.slug}`} aria-label={`View ${product.name}`}>
                          <img src={product.primaryThumb || product.primaryImage || '/media/seed/editorial/campaign.webp'} alt={product.name} loading="lazy" width="120" height="150" />
                        </Link>
                        <div className="wish-copy">
                          <Link to={`/product/${product.slug}`} className="wish-name">{product.name}</Link>
                          <span className="muted" style={{ fontSize: '.72rem' }}>{product.categoryName}</span>
                          <strong className="price" style={{ fontSize: '.86rem' }}>₹{(product.pricePaise / 100).toLocaleString('en-IN')}</strong>
                        </div>
                        <div className="wish-actions">
                          <Link className="btn btn-outline btn-small" to={`/product/${product.slug}`}>View</Link>
                          <button className="icon-btn" style={{ width: 38, height: 38 }} type="button" disabled={wishBusy === product.id} onClick={() => void removeWish(product)} aria-label={`Remove ${product.name} from wishlist`}><Trash2 size={15} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="muted" style={{ fontSize: '.82rem' }}>Nothing saved yet. Tap the heart on any piece to keep it here.</p>}
                {!customer && wishlist.count > 0 && <p className="muted" style={{ fontSize: '.7rem', marginTop: 10 }}>Hearts raised while signed out are stored on this device and will merge into your account when you sign in.</p>}
              </div>
            </div>

            <div className="panel">
              <div className="admin-card-header">
                <h3>Order history</h3>
                <Link className="text-link" to="/orders">View all</Link>
              </div>
              <div className="admin-card-body">
                {orders.length ? (
                  <div className="orders-grid">
                    {orders.slice(0, 3).map((order) => (
                      <Link className="order-card" to={`/orders/${order.id}`} key={order.id}>
                        <div><h3>{order.id}</h3><div className="muted" style={{ fontSize: '.72rem', marginTop: 5 }}>{formatDate(order.createdAt)} · {formatINR(order.totalPaise)} · COD</div></div>
                        <StatusPill status={order.status} />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No orders yet" description="Your future purchases and their live status will appear here." action={<Link className="btn btn-gold" to="/shop">Explore the edit</Link>} />
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {newRecoveryCode && (
        <RecoveryCodeOverlay
          code={newRecoveryCode}
          title="Save your new recovery code"
          description="Your previous code has been retired. This new code is shown once and stored only as a secure hash."
          onContinue={() => setNewRecoveryCode('')}
        />
      )}
    </div>
  );
}
