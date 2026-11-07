import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Boxes, ClipboardList, IndianRupee, PackagePlus, ShoppingBag, Users } from 'lucide-react';
import type { AdminOverview as OverviewData } from '@shared/types';
import { AdminAsyncState, AdminPageHeader } from '@/admin/AdminUI';
import { StatusPill } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/format';

export default function AdminOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get<OverviewData>('/api/admin/overview')
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(errorMessage(err, 'Unable to load dashboard overview.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const stats = data ? [
    { label: 'Total orders', value: String(data.totals.orders), icon: ShoppingBag, foot: `${data.totals.pendingOrders} in progress` },
    { label: 'Total products', value: String(data.totals.products), icon: Boxes, foot: `${data.totals.lowStockSkus} low-stock SKUs` },
    { label: 'Total customers', value: String(data.totals.customers), icon: Users, foot: 'Persistent accounts' },
    { label: 'Total sales', value: formatINR(data.totals.salesPaise), icon: IndianRupee, foot: 'Excludes cancelled orders' },
  ] : [];

  return (
    <div>
      <AdminPageHeader
        eyebrow="Dashboard overview"
        title="The house at a glance"
        description="Live figures from the persistent orders, products, customers and inventory tables."
        action={<div className="flex flex-wrap gap-2"><Link className="btn btn-gold btn-small" to="/admin/products/new"><PackagePlus size={14} /> Add Product</Link><Link className="btn btn-outline btn-small" to="/admin/orders"><ClipboardList size={14} /> Manage Orders</Link></div>}
      />
      <AdminAsyncState loading={loading} error={error}>
        {data && (
          <div className="admin-grid">
            <div className="stats-grid admin-grid">
              {stats.map(({ label, value, icon: Icon, foot }) => (
                <div className="stat-card" key={label}>
                  <div className="flex items-start justify-between gap-4"><span>{label}</span><Icon size={18} className="gold-text" /></div>
                  <strong>{value}</strong>
                  <div className="muted" style={{ fontSize: '.68rem', marginTop: 10 }}>{foot}</div>
                </div>
              ))}
            </div>

            <div className="admin-grid admin-two-col">
              <div className="admin-card">
                <div className="admin-card-header"><h3>Recent orders</h3><Link className="text-link" to="/admin/orders">View all <ArrowUpRight size={12} className="inline" /></Link></div>
                <div className="admin-table-wrap">
                  {data.recentOrders.length ? (
                    <table className="admin-table">
                      <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Amount</th><th>Status</th><th /></tr></thead>
                      <tbody>
                        {data.recentOrders.map((order) => (
                          <tr key={order.id}>
                            <td style={{ color: 'var(--gold-soft)' }}>{order.id}</td>
                            <td>{order.customerName}</td>
                            <td>{formatDate(order.createdAt)}</td>
                            <td>{formatINR(order.totalPaise)}</td>
                            <td><StatusPill status={order.status} /></td>
                            <td><Link className="text-link" to={`/admin/orders/${order.id}`}>Open</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <div className="admin-empty">No orders yet.</div>}
                </div>
              </div>

              <div className="admin-card">
                <div className="admin-card-header"><h3>Stock alerts</h3><Link className="text-link" to="/admin/products?stock=low">Products</Link></div>
                <div className="admin-card-body">
                  {data.stockAlerts.length ? (
                    <div className="grid gap-3">
                      {data.stockAlerts.map((alert) => (
                        <Link className="flex items-center gap-3" style={{ borderBottom: '1px solid rgba(212,175,55,.1)', paddingBottom: 10 }} to={`/admin/products/${alert.productId}/edit`} key={alert.productId}>
                          <img className="admin-thumb" src={alert.imagePath || '/media/seed/editorial/campaign.webp'} alt="" loading="lazy" />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '.8rem' }}>{alert.productName}</div>
                            <div className="muted" style={{ fontSize: '.68rem' }}>Lowest SKU stock: {alert.lowestStock}</div>
                          </div>
                          <span className="badge badge-danger">{alert.lowestStock}</span>
                        </Link>
                      ))}
                    </div>
                  ) : <div className="notice">All active SKUs are above the low-stock threshold.</div>}
                </div>
              </div>
            </div>
          </div>
        )}
      </AdminAsyncState>
    </div>
  );
}
