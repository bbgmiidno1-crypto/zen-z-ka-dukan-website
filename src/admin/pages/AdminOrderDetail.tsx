import { FALLBACK_IMAGE } from '@/lib/urls';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, PackageCheck, ShieldCheck, Truck, UserRound } from 'lucide-react';
import { ORDER_STATUSES, type AdminOrderDetail as AdminOrderDetailData, type OrderStatus } from '@shared/types';
import { AdminAsyncState, AdminPageHeader } from '@/admin/AdminUI';
import { OrderTimeline } from '@/components/OrderTimeline';
import { StatusPill } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatINR, isTerminalStatus } from '@/lib/format';

export default function AdminOrderDetail() {
  const { id = '' } = useParams();
  const { showToast } = useToast();
  const [order, setOrder] = useState<AdminOrderDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<OrderStatus>('Order Placed');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.get<{ order: AdminOrderDetailData }>(`/api/admin/orders/${id}`)
      .then((data) => {
        if (!active) return;
        setOrder(data.order);
        setStatus(data.order.status);
      })
      .catch((err) => { if (active) setError(errorMessage(err, 'Unable to load this order.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  async function updateStatus(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.patch<{ order: AdminOrderDetailData }>(`/api/admin/orders/${id}/status`, { status, note });
      setOrder(response.order);
      setStatus(response.order.status);
      setNote('');
      showToast(`Order status updated to ${response.order.status}.`, 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <AdminPageHeader eyebrow="Order management" title="Order detail" action={<Link className="btn btn-outline btn-small" to="/admin/orders"><ArrowLeft size={14} /> All orders</Link>} />
      <AdminAsyncState loading={loading} error={error}>
        {order && (
          <div className="admin-grid">
            <div className="panel panel-pad">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="eyebrow eyebrow-line">Cash on Delivery</div>
                  <h2 className="luxe-title" style={{ fontSize: 'clamp(2rem,4vw,3.2rem)', marginTop: 10 }}>{order.id}</h2>
                  <p className="muted" style={{ marginTop: 10, fontSize: '.76rem' }}>Placed {formatDateTime(order.createdAt)} · Last updated {formatDateTime(order.updatedAt)}</p>
                </div>
                <StatusPill status={order.status} />
              </div>
              <div style={{ marginTop: 20 }}><OrderTimeline status={order.status} history={order.history} /></div>
            </div>

            <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
              <form className="panel panel-pad" onSubmit={updateStatus}>
                <div className="flex items-center gap-2"><PackageCheck size={17} className="gold-text" /><h3 className="luxe-title" style={{ fontSize: '1.7rem' }}>Update status</h3></div>
                <div className="auth-stack" style={{ marginTop: 18 }}>
                  <label>
                    <span className="field-label">New status</span>
                    <select className="select" value={status} onChange={(event) => setStatus(event.target.value as OrderStatus)} disabled={isTerminalStatus(order.status)}>
                      {ORDER_STATUSES.map((option) => <option value={option} key={option}>{option}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="field-label">Internal note (optional)</span>
                    <input className="input" value={note} onChange={(event) => setNote(event.target.value)} maxLength={180} disabled={isTerminalStatus(order.status)} placeholder="Packed at the atelier" />
                  </label>
                  {isTerminalStatus(order.status) ? (
                    <div className="notice">This order is {order.status.toLowerCase()} and no longer accepts status changes.</div>
                  ) : (
                    <button className="btn btn-gold" type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update status'}</button>
                  )}
                  <p className="muted" style={{ fontSize: '.68rem', lineHeight: 1.6 }}>Selecting Cancelled restores reserved stock through a database transaction.</p>
                </div>
              </form>

              <div className="grid gap-4">
                <div className="panel panel-pad">
                  <div className="flex items-center gap-2"><UserRound size={17} className="gold-text" /><h3 className="luxe-title" style={{ fontSize: '1.7rem' }}>Customer</h3></div>
                  <div className="summary-row"><span>Name</span><span>{order.customerName}</span></div>
                  <div className="summary-row"><span>Mobile</span><span>{order.mobile}</span></div>
                  <div className="summary-row"><span>Account</span><span>{order.customerId ? <Link className="text-link" to={`/admin/customers/${order.customerId}`}>Open profile</Link> : '—'}</span></div>
                </div>
                <div className="panel panel-pad">
                  <div className="flex items-center gap-2"><MapPin size={17} className="gold-text" /><h3 className="luxe-title" style={{ fontSize: '1.7rem' }}>Complete delivery address</h3></div>
                  <p className="muted" style={{ marginTop: 16, lineHeight: 1.7, fontSize: '.82rem' }}>
                    {order.line1}{order.line2 ? `, ${order.line2}` : ''}<br />
                    {order.city}, {order.state} {order.pincode}<br />
                    {order.mobile}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
              <div className="admin-card">
                <div className="admin-card-header"><h3>Order items</h3><span className="badge">COD only</span></div>
                <div className="admin-card-body grid gap-4">
                  {order.items.map((item) => (
                    <div className="summary-product" key={item.id} style={{ gridTemplateColumns: '76px 1fr auto', alignItems: 'center' }}>
                      <img src={item.imagePath || FALLBACK_IMAGE} alt="" style={{ width: 76, height: 96 }} loading="lazy" />
                      <div>
                        <div style={{ color: 'var(--white)', fontSize: '.88rem' }}>{item.productName}</div>
                        <div className="muted" style={{ fontSize: '.7rem', marginTop: 6 }}>{item.variantName} · {item.sizeLabel} · Qty {item.quantity}</div>
                      </div>
                      <div className="price">{formatINR(item.lineTotalPaise)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel panel-pad">
                <div className="flex items-center gap-2"><ShieldCheck size={17} className="gold-text" /><h3 className="luxe-title" style={{ fontSize: '1.7rem' }}>Payment</h3></div>
                <div className="summary-row"><span>Subtotal</span><span>{formatINR(order.subtotalPaise)}</span></div>
                <div className="summary-row"><span>Delivery</span><span className="amount-gold">₹0</span></div>
                <div className="summary-row total"><span>Final amount</span><span className="amount-gold">{formatINR(order.totalPaise)}</span></div>
                <div className="promo-points" style={{ justifyContent: 'flex-start', marginTop: 18, fontSize: '.58rem' }}>
                  <span className="inline-flex items-center gap-1"><Truck size={13} /> Free delivery</span>
                  <span className="inline-flex items-center gap-1"><ShieldCheck size={13} /> Secure server total</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </AdminAsyncState>
    </div>
  );
}
