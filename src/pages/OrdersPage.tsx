import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, PackageSearch } from 'lucide-react';
import type { Order } from '@shared/types';
import { Breadcrumb, EmptyState, LoadingBlock, StatusPill } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/format';

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get<{ orders: Order[] }>('/api/customer/orders')
      .then((data) => { if (active) setOrders(data.orders); })
      .catch((err) => { if (active) setError(errorMessage(err, 'Unable to load your orders.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <div>
      <section className="page-top" style={{ paddingBottom: 36 }}>
        <div className="container-luxe">
          <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Account', to: '/account' }, { label: 'Orders' }]} />
          <div className="eyebrow eyebrow-line" style={{ marginTop: 18 }}>Client order archive</div>
          <h1 style={{ marginTop: 14 }}>Your Orders.</h1>
          <p className="luxe-subtitle" style={{ marginTop: 14 }}>Every order, its current status and its visual delivery timeline.</p>
        </div>
      </section>

      <section className="section-tight" style={{ paddingTop: 40 }}>
        <div className="container-luxe">
          {loading ? <LoadingBlock label="Retrieving your orders…" /> : error ? (
            <EmptyState title="Orders unavailable" description={error} action={<Link className="btn btn-gold" to="/account">Back to account</Link>} />
          ) : orders.length ? (
            <div className="orders-grid">
              {orders.map((order) => (
                <article className="order-card" key={order.id}>
                  <div>
                    <div className="eyebrow">{formatDate(order.createdAt)} · Cash on Delivery</div>
                    <h3 style={{ marginTop: 8 }}>{order.id}</h3>
                    <p className="muted" style={{ fontSize: '.76rem', marginTop: 8 }}>
                      {order.city}, {order.state} {order.pincode} · {formatINR(order.totalPaise)}
                    </p>
                    <Link className="text-link inline-flex items-center gap-1" style={{ marginTop: 16 }} to={`/orders/${order.id}`}>
                      Track order <ArrowUpRight size={13} />
                    </Link>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <StatusPill status={order.status} />
                    <span className="muted" style={{ fontSize: '.7rem' }}>₹0 delivery</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No orders yet"
              description="When you buy a piece, its unique order ID and tracking timeline will appear here."
              action={<div className="flex justify-center gap-3 flex-wrap"><Link className="btn btn-gold" to="/shop">Explore pieces</Link><Link className="btn btn-outline" to="/account"><PackageSearch size={15} /> Account</Link></div>}
            />
          )}
        </div>
      </section>
    </div>
  );
}
