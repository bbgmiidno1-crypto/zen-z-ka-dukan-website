import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import type { OrderDetail } from '@shared/types';
import { OrderTimeline } from '@/components/OrderTimeline';
import { Breadcrumb, EmptyState, LoadingBlock, StatusPill } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatINR, isTerminalStatus } from '@/lib/format';

export default function OrderTrackingPage() {
  const { id = '' } = useParams();
  const { showToast } = useToast();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let active = true;
    api.get<{ order: OrderDetail }>(`/api/customer/orders/${id}`)
      .then((data) => { if (active) setOrder(data.order); })
      .catch((err) => { if (active) setError(errorMessage(err, 'This order could not be found.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  async function cancelOrder() {
    if (!window.confirm('Cancel this order? Reserved stock will be restored.')) return;
    setCancelling(true);
    try {
      const response = await api.post<{ order: OrderDetail }>(`/api/customer/orders/${id}/cancel`);
      setOrder(response.order);
      showToast('Order cancelled. Reserved stock has been restored.', 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <LoadingBlock label="Opening order timeline…" />;
  if (error || !order) {
    return (
      <div className="container-luxe" style={{ paddingTop: 150, paddingBottom: 100 }}>
        <EmptyState title="Order not found" description={error} action={<Link className="btn btn-gold" to="/orders">Back to orders</Link>} />
      </div>
    );
  }

  const canCancel = !isTerminalStatus(order.status) && !['Shipped', 'Out for Delivery'].includes(order.status);

  return (
    <div>
      <section className="page-top" style={{ paddingBottom: 36 }}>
        <div className="container-luxe">
          <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Orders', to: '/orders' }, { label: order.id }]} />
          <div className="flex flex-wrap items-center justify-between gap-4" style={{ marginTop: 18 }}>
            <div>
              <div className="eyebrow eyebrow-line">Live order tracking</div>
              <h1 style={{ marginTop: 14, fontSize: 'clamp(2.6rem,6vw,5.5rem)' }}>{order.id}</h1>
              <p className="muted" style={{ marginTop: 12, fontSize: '.8rem' }}>Placed {formatDateTime(order.createdAt)} · Cash on Delivery</p>
            </div>
            <StatusPill status={order.status} />
          </div>
        </div>
      </section>

      <section className="section-tight" style={{ paddingTop: 40 }}>
        <div className="container-luxe">
          <div className="panel panel-pad" style={{ marginBottom: 24 }}>
            <div className="section-head" style={{ marginBottom: 8 }}>
              <div>
                <div className="eyebrow eyebrow-line">Delivery progress</div>
                <h2 className="luxe-title" style={{ fontSize: '2.4rem', marginTop: 10 }}>From atelier to door</h2>
              </div>
              {canCancel && <button className="btn btn-outline btn-small" type="button" onClick={cancelOrder} disabled={cancelling}>{cancelling ? 'Cancelling…' : 'Cancel order'}</button>}
            </div>
            <OrderTimeline status={order.status} history={order.history} />
          </div>

          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6 items-start">
            <div className="panel">
              <div className="admin-card-header"><h3>Order pieces</h3><span className="badge">{order.items.reduce((sum, item) => sum + item.quantity, 0)} item(s)</span></div>
              <div className="admin-card-body grid gap-4">
                {order.items.map((item) => (
                  <div className="summary-product" key={item.id} style={{ gridTemplateColumns: '96px 1fr auto', alignItems: 'center' }}>
                    <img src={item.imagePath || '/media/seed/editorial/campaign.webp'} alt={item.productName} width="96" height="120" loading="lazy" />
                    <div>
                      <div className="product-category">ZEN Z KA DUKAN</div>
                      <h4 className="product-name" style={{ marginTop: 5 }}>{item.productName}</h4>
                      <p className="muted" style={{ fontSize: '.74rem', marginTop: 8 }}>{item.variantName} · {item.sizeLabel} · Qty {item.quantity}</p>
                    </div>
                    <div className="price">{formatINR(item.lineTotalPaise)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-6">
              <div className="panel panel-pad">
                <div className="flex items-center gap-2"><MapPin size={17} className="gold-text" /><h3 className="luxe-title" style={{ fontSize: '1.8rem' }}>Delivery address</h3></div>
                <p className="muted" style={{ marginTop: 16, lineHeight: 1.7, fontSize: '.84rem' }}>
                  <strong style={{ color: 'var(--white)' }}>{order.customerName}</strong><br />
                  {order.mobile}<br />
                  {order.line1}{order.line2 ? `, ${order.line2}` : ''}<br />
                  {order.city}, {order.state} {order.pincode}
                </p>
              </div>

              <div className="panel panel-pad">
                <div className="flex items-center gap-2"><ShieldCheck size={17} className="gold-text" /><h3 className="luxe-title" style={{ fontSize: '1.8rem' }}>Payment summary</h3></div>
                <div className="summary-row"><span>Subtotal</span><span>{formatINR(order.subtotalPaise)}</span></div>
                <div className="summary-row"><span>Delivery</span><span className="amount-gold">₹0</span></div>
                <div className="summary-row total"><span>Final amount</span><span className="amount-gold">{formatINR(order.totalPaise)}</span></div>
                <div className="promo-points" style={{ justifyContent: 'flex-start', marginTop: 18, fontSize: '.58rem' }}>
                  <span className="inline-flex items-center gap-1"><PackageCheck size={13} /> COD only</span>
                  <span className="inline-flex items-center gap-1"><Truck size={13} /> Free delivery</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3" style={{ marginTop: 28 }}>
            <Link className="btn btn-outline" to="/orders"><ArrowLeft size={15} /> All orders</Link>
            <Link className="btn btn-gold" to="/shop">Discover another piece</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
