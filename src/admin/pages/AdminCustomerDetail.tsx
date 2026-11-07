import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, UserRound } from 'lucide-react';
import type { AdminCustomerDetail as CustomerDetailData } from '@shared/types';
import { AdminAsyncState, AdminPageHeader } from '@/admin/AdminUI';
import { EmptyState, StatusPill } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/format';

export default function AdminCustomerDetail() {
  const { id = '' } = useParams();
  const [detail, setDetail] = useState<CustomerDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get<CustomerDetailData>(`/api/admin/customers/${id}`)
      .then((data) => { if (active) setDetail(data); })
      .catch((err) => { if (active) setError(errorMessage(err, 'Unable to load this customer.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  return (
    <div>
      <AdminPageHeader eyebrow="Client record" title="Customer profile" action={<Link className="btn btn-outline btn-small" to="/admin/customers"><ArrowLeft size={14} /> All customers</Link>} />
      <AdminAsyncState loading={loading} error={error}>
        {detail ? (
          <div className="admin-grid">
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="panel panel-pad">
                <div className="flex items-center gap-2"><UserRound size={17} className="gold-text" /><h3 className="luxe-title" style={{ fontSize: '1.7rem' }}>Account</h3></div>
                <div className="summary-row"><span>Name</span><span>{detail.customer.name || '—'}</span></div>
                <div className="summary-row"><span>Mobile</span><span>{detail.customer.mobile}</span></div>
                <div className="summary-row"><span>Customer ID</span><span>{detail.customer.id}</span></div>
                <div className="summary-row"><span>Member since</span><span>{formatDate(detail.customer.createdAt)}</span></div>
                <div className="notice" style={{ marginTop: 18, fontSize: '.72rem' }}>Passwords and recovery codes are stored only as secure hashes and are never displayed.</div>
              </div>
              <div className="panel panel-pad">
                <div className="flex items-center gap-2"><MapPin size={17} className="gold-text" /><h3 className="luxe-title" style={{ fontSize: '1.7rem' }}>Saved addresses</h3></div>
                {detail.addresses.length ? (
                  <div className="grid gap-3" style={{ marginTop: 18 }}>
                    {detail.addresses.map((address) => (
                      <div className="saved-address" key={address.id}>
                        <strong style={{ color: 'var(--gold)' }}>{address.label}{address.isDefault ? ' · Default' : ''}</strong><br />
                        {address.fullName} · {address.mobile}<br />
                        {address.line1}{address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state} {address.pincode}
                      </div>
                    ))}
                  </div>
                ) : <p className="muted" style={{ marginTop: 18, fontSize: '.8rem' }}>No saved addresses.</p>}
              </div>
            </div>
            <div className="admin-card">
              <div className="admin-card-header"><h3>Customer order history</h3><span className="badge">{detail.orders.length} orders</span></div>
              <div className="admin-card-body">
                {detail.orders.length ? (
                  <div className="orders-grid">
                    {detail.orders.map((order) => (
                      <Link className="order-card" to={`/admin/orders/${order.id}`} key={order.id}>
                        <div>
                          <h3>{order.id}</h3>
                          <div className="muted" style={{ fontSize: '.72rem', marginTop: 6 }}>{formatDate(order.createdAt)} · {formatINR(order.totalPaise)} · {order.city}, {order.state}</div>
                        </div>
                        <StatusPill status={order.status} />
                      </Link>
                    ))}
                  </div>
                ) : <EmptyState title="No orders" description="This customer has not placed an order yet." />}
              </div>
            </div>
          </div>
        ) : null}
      </AdminAsyncState>
    </div>
  );
}
