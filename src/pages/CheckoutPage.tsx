import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, LockKeyhole, MapPin, PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import type { Address, CheckoutPreview, OrderDetail } from '@shared/types';
import { Breadcrumb, EmptyState, LoadingBlock } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/lib/api';
import { clamp, formatINR, nextParam } from '@/lib/format';

interface CheckoutForm {
  customerName: string;
  mobile: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  saveAddress: boolean;
}

const EMPTY_FORM: CheckoutForm = {
  customerName: '',
  mobile: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  pincode: '',
  saveAddress: false,
};

export default function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { customer, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const productSlug = searchParams.get('product') || '';
  const variantId = Number(searchParams.get('variant') || 0);
  const sizeId = Number(searchParams.get('size') || 0);
  const urlQuantity = clamp(Number(searchParams.get('qty') || 1), 1, 5);
  const [quantity, setQuantity] = useState(urlQuantity);
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(true);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [form, setForm] = useState<CheckoutForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const selectionValid = Boolean(productSlug && variantId > 0 && sizeId > 0);
  const currentPath = `/checkout?${searchParams.toString()}`;
  const loginPath = `/login?next=${nextParam(currentPath)}`;
  const registerPath = `/register?next=${nextParam(currentPath)}`;
  const selection = useMemo(() => ({ productSlug, variantId, sizeId, quantity }), [productSlug, variantId, sizeId, quantity]);

  useEffect(() => {
    setQuantity(urlQuantity);
  }, [urlQuantity]);

  useEffect(() => {
    if (!selectionValid) {
      setPreviewError('This checkout link is incomplete. Please choose a product, colour and size again.');
      setPreviewLoading(false);
      return;
    }
    let active = true;
    setPreviewLoading(true);
    setPreviewError('');
    api.post<CheckoutPreview>('/api/checkout/preview', selection)
      .then((data) => { if (active) setPreview(data); })
      .catch((err) => { if (active) setPreviewError(errorMessage(err, 'This piece is no longer available.')); })
      .finally(() => { if (active) setPreviewLoading(false); });
    return () => { active = false; };
  }, [selection, selectionValid]);

  useEffect(() => {
    if (!customer) return;
    setForm((current) => ({
      ...current,
      customerName: current.customerName || customer.name || '',
      mobile: current.mobile || customer.mobile,
    }));
    let active = true;
    api.get<{ addresses: Address[] }>('/api/customer/addresses')
      .then((data) => {
        if (!active) return;
        setAddresses(data.addresses);
        const preferred = data.addresses.find((address) => address.isDefault) || data.addresses[0];
        if (preferred) {
          setSelectedAddressId(preferred.id);
          setForm((current) => ({
            ...current,
            customerName: preferred.fullName,
            mobile: preferred.mobile,
            line1: preferred.line1,
            line2: preferred.line2,
            city: preferred.city,
            state: preferred.state,
            pincode: preferred.pincode,
          }));
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [customer]);

  function updateField(event: ChangeEvent<HTMLInputElement>) {
    const target = event.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    setForm((current) => ({ ...current, [target.name]: value }));
    if (target.name !== 'saveAddress') setSelectedAddressId(null);
  }

  function chooseAddress(address: Address) {
    setSelectedAddressId(address.id);
    setForm((current) => ({
      ...current,
      customerName: address.fullName,
      mobile: address.mobile,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
    }));
  }

  function changeQuantity(next: number) {
    setQuantity(clamp(next, 1, 5));
  }

  async function placeOrder(event: FormEvent) {
    event.preventDefault();
    if (!customer || !preview || !selectionValid) return;
    setSubmitting(true);
    try {
      const response = await api.post<{ order: OrderDetail }>('/api/customer/orders', {
        ...selection,
        ...form,
      });
      showToast(`Order ${response.order.id} placed successfully.`, 'success');
      navigate(`/orders/${response.order.id}`, { replace: true });
    } catch (err) {
      const message = errorMessage(err, 'The order could not be placed.');
      showToast(message, 'error');
      if (message.toLowerCase().includes('stock') || message.toLowerCase().includes('unavailable')) {
        setPreviewError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!selectionValid) {
    return (
      <div className="container-luxe" style={{ paddingTop: 150, paddingBottom: 100 }}>
        <EmptyState title="Checkout needs a piece" description={previewError} action={<Link className="btn btn-gold" to="/shop">Choose a piece</Link>} />
      </div>
    );
  }
  if (authLoading || previewLoading) return <LoadingBlock label="Preparing secure checkout…" />;

  return (
    <div>
      <section className="page-top" style={{ paddingBottom: 36 }}>
        <div className="container-luxe">
          <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Shop', to: '/shop' }, { label: 'Checkout' }]} />
          <div className="eyebrow eyebrow-line" style={{ marginTop: 18 }}>Buy Now · Cash on Delivery</div>
          <h1 style={{ marginTop: 14 }}>Secure Checkout</h1>
          <p className="luxe-subtitle" style={{ marginTop: 14 }}>One piece. One considered decision. No cart, no online payment.</p>
        </div>
      </section>

      <section className="section-tight" style={{ paddingTop: 40 }}>
        <div className="container-luxe">
          {previewError ? (
            <div className="panel panel-pad" style={{ marginBottom: 24, borderColor: 'rgba(214,106,106,.45)' }}>
              <h2 className="luxe-title" style={{ fontSize: '2rem' }}>This selection needs attention</h2>
              <p className="muted" style={{ margin: '12px 0 20px' }}>{previewError}</p>
              <div className="flex flex-wrap gap-3">
                {quantity > 1 && <button className="btn btn-outline" type="button" onClick={() => changeQuantity(1)}>Set quantity to 1</button>}
                <Link className="btn btn-gold" to={`/product/${productSlug}`}>Choose another colour or size</Link>
              </div>
            </div>
          ) : null}

          <div className="checkout-grid">
            <div>
              {!customer && (
                <div className="notice" style={{ marginBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <span><LockKeyhole size={15} className="inline" /> Sign in to place this order. Your selected piece will remain here.</span>
                  <span className="flex gap-2">
                    <Link className="btn btn-gold btn-small" to={loginPath}>Sign In</Link>
                    <Link className="btn btn-outline btn-small" to={registerPath}>Create Account</Link>
                  </span>
                </div>
              )}

              <form onSubmit={placeOrder} className="panel panel-pad">
                <div className="flex items-center gap-2">
                  <MapPin size={17} className="gold-text" />
                  <h2 className="luxe-title" style={{ fontSize: '2rem' }}>Delivery details</h2>
                </div>

                {customer && addresses.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <div className="eyebrow">Saved addresses</div>
                    <div className="saved-addresses" style={{ marginTop: 12 }}>
                      {addresses.map((address) => (
                        <button
                          type="button"
                          key={address.id}
                          className={`saved-address ${selectedAddressId === address.id ? 'active' : ''}`}
                          onClick={() => chooseAddress(address)}
                        >
                          <strong style={{ color: 'var(--gold)' }}>{address.label}{address.isDefault ? ' · Default' : ''}</strong><br />
                          {address.fullName} · {address.mobile}<br />
                          {address.line1}{address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state} {address.pincode}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="form-grid" style={{ marginTop: 26 }}>
                  <label>
                    <span className="field-label">Full name</span>
                    <input className="input" name="customerName" value={form.customerName} onChange={updateField} required minLength={2} maxLength={80} autoComplete="name" placeholder="Recipient name" />
                  </label>
                  <label>
                    <span className="field-label">Mobile number</span>
                    <input className="input" name="mobile" value={form.mobile} onChange={updateField} required inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} autoComplete="tel" placeholder="10-digit mobile" />
                  </label>
                  <label className="span-2">
                    <span className="field-label">Complete street address</span>
                    <input className="input" name="line1" value={form.line1} onChange={updateField} required minLength={8} maxLength={180} autoComplete="address-line1" placeholder="House / building, street, area" />
                  </label>
                  <label className="span-2">
                    <span className="field-label">Landmark / additional address (optional)</span>
                    <input className="input" name="line2" value={form.line2} onChange={updateField} maxLength={180} autoComplete="address-line2" placeholder="Landmark, suite, floor" />
                  </label>
                  <label>
                    <span className="field-label">City</span>
                    <input className="input" name="city" value={form.city} onChange={updateField} required minLength={2} maxLength={60} autoComplete="address-level2" placeholder="City" />
                  </label>
                  <label>
                    <span className="field-label">State</span>
                    <input className="input" name="state" value={form.state} onChange={updateField} required minLength={2} maxLength={60} autoComplete="address-level1" placeholder="State" />
                  </label>
                  <label>
                    <span className="field-label">PIN code</span>
                    <input className="input" name="pincode" value={form.pincode} onChange={updateField} required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="postal-code" placeholder="6-digit PIN" />
                  </label>
                  <label style={{ display: 'grid', alignContent: 'end' }}>
                    <span className="field-label">Payment</span>
                    <div className="input flex items-center gap-2" style={{ color: 'var(--gold)' }}><ShieldCheck size={16} /> Cash on Delivery</div>
                  </label>
                  {customer && (
                    <label className="checkbox-row span-2">
                      <input type="checkbox" name="saveAddress" checked={form.saveAddress} onChange={updateField} />
                      Save this address to my profile for future orders
                    </label>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 26 }}>
                  <button className="btn btn-gold" type="submit" disabled={!customer || !preview || submitting || Boolean(previewError)}>
                    {submitting ? 'Placing order…' : `Place Order · ${preview ? formatINR(preview.totalPaise) : ''}`}
                  </button>
                  <Link className="btn btn-ghost" to={`/product/${productSlug}`}><ArrowLeft size={14} /> Back to piece</Link>
                </div>
                <p className="muted" style={{ fontSize: '.7rem', marginTop: 16, lineHeight: 1.6 }}>
                  The final amount is calculated securely on the server from current product pricing. Unavailable or out-of-stock selections are rejected automatically.
                </p>
              </form>
            </div>

            <aside className="panel summary-card">
              <div className="admin-card-header">
                <h3>Order summary</h3>
                <span className="badge">COD only</span>
              </div>
              <div className="admin-card-body">
                {preview ? (
                  <>
                    <div className="summary-product">
                      <img src={preview.product.image || '/media/seed/editorial/campaign.webp'} alt={preview.product.name} width="96" height="120" />
                      <div>
                        <div className="product-category">ZEN Z KA DUKAN</div>
                        <h3 className="product-name" style={{ marginTop: 6 }}>{preview.product.name}</h3>
                        <div className="price" style={{ marginTop: 10 }}>{formatINR(preview.product.pricePaise)}</div>
                      </div>
                    </div>
                    <hr className="divider" style={{ margin: '22px 0' }} />
                    <div className="summary-row"><span>Colour</span><span className="inline-flex items-center gap-2"><span style={{ width: 14, height: 14, background: preview.variant.colorHex, border: '1px solid rgba(255,255,255,.2)' }} />{preview.variant.name}</span></div>
                    <div className="summary-row"><span>Size</span><span>{preview.size.label}</span></div>
                    <div className="summary-row">
                      <span>Quantity</span>
                      <span className="quantity-stepper" style={{ minHeight: 36 }}>
                        <button type="button" style={{ width: 36, height: 36 }} onClick={() => changeQuantity(quantity - 1)} disabled={quantity <= 1} aria-label="Decrease quantity">−</button>
                        <span style={{ minWidth: 30 }}>{quantity}</span>
                        <button type="button" style={{ width: 36, height: 36 }} onClick={() => changeQuantity(quantity + 1)} disabled={quantity >= Math.max(1, preview.maxQuantity)} aria-label="Increase quantity">+</button>
                      </span>
                    </div>
                    <div className="summary-row"><span>Subtotal</span><span>{formatINR(preview.subtotalPaise)}</span></div>
                    <div className="summary-row"><span>Delivery charge</span><span className="amount-gold">₹0</span></div>
                    <div className="summary-row total"><span>Final amount</span><span className="amount-gold">{formatINR(preview.totalPaise)}</span></div>
                    <div className="notice" style={{ marginTop: 22 }}>
                      <PackageCheck size={15} className="inline" /> A unique order ID and visual tracking timeline are created after confirmation.
                    </div>
                    <div className="promo-points" style={{ justifyContent: 'flex-start', marginTop: 20, fontSize: '.58rem' }}>
                      <span className="inline-flex items-center gap-1"><Truck size={13} /> Free delivery</span>
                      <span className="inline-flex items-center gap-1"><ShieldCheck size={13} /> No online payment</span>
                    </div>
                  </>
                ) : (
                  <p className="muted">This selection is currently unavailable.</p>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
