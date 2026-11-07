import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Search } from 'lucide-react';
import { ORDER_STATUSES, type AdminOrder, type OrderStatus } from '@shared/types';
import { AdminAsyncState, AdminPageHeader } from '@/admin/AdminUI';
import { StatusPill } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/format';

export default function AdminOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ orders: AdminOrder[] }>('/api/admin/orders', {
        search: search || undefined,
        status: status || undefined,
        limit: 100,
      });
      setOrders(response.orders);
    } catch (err) {
      setError(errorMessage(err, 'Unable to load orders.'));
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => { void load(); }, [load]);

  function apply(event: FormEvent) {
    event.preventDefault();
    setSearch(searchDraft.trim());
  }

  return (
    <div>
      <AdminPageHeader eyebrow="Order management" title="Orders" description="Search and filter orders, inspect delivery information and update fulfilment status." />
      <form className="admin-toolbar" onSubmit={apply}>
        <input className="input search-input" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search order ID, customer or mobile" aria-label="Search orders" />
        <select className="select" value={status} onChange={(event) => setStatus(event.target.value as OrderStatus | '')} aria-label="Filter by status">
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((option) => <option value={option} key={option}>{option}</option>)}
        </select>
        <button className="btn btn-outline btn-small" type="submit"><Search size={14} /> Search</button>
        <button className="btn btn-ghost btn-small" type="button" onClick={() => { setSearchDraft(''); setSearch(''); setStatus(''); }}>Clear</button>
      </form>
      <AdminAsyncState loading={loading} error={error} empty={!orders.length} emptyTitle="No orders found" emptyDescription="Orders will appear here as customers complete COD checkout.">
        <div className="admin-card">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Order ID</th><th>Customer</th><th>Mobile</th><th>Date</th><th>Items</th><th>Amount</th><th>Status</th><th /></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td style={{ color: 'var(--gold-soft)' }}>{order.id}</td>
                    <td>{order.customerName}</td>
                    <td>{order.customerMobile || order.mobile}</td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>{order.itemCount}</td>
                    <td>{formatINR(order.totalPaise)}</td>
                    <td><StatusPill status={order.status} /></td>
                    <td><Link className="text-link inline-flex items-center gap-1" to={`/admin/orders/${order.id}`}>Open <ArrowUpRight size={12} /></Link></td>
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
