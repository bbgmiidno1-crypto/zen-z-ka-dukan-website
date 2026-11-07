import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Search } from 'lucide-react';
import type { AdminCustomerSummary } from '@shared/types';
import { AdminAsyncState, AdminPageHeader } from '@/admin/AdminUI';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/format';

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<AdminCustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ customers: AdminCustomerSummary[] }>('/api/admin/customers', { search: search || undefined, limit: 100 });
      setCustomers(response.customers);
    } catch (err) {
      setError(errorMessage(err, 'Unable to load customers.'));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { void load(); }, [load]);

  function apply(event: FormEvent) {
    event.preventDefault();
    setSearch(searchDraft.trim());
  }

  return (
    <div>
      <AdminPageHeader eyebrow="Client records" title="Customers" description="View registered customer information, saved address counts, order totals and complete histories." />
      <form className="admin-toolbar" onSubmit={apply}>
        <input className="input search-input" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search by mobile number or name" aria-label="Search customers" />
        <button className="btn btn-outline btn-small" type="submit"><Search size={14} /> Search</button>
        <button className="btn btn-ghost btn-small" type="button" onClick={() => { setSearchDraft(''); setSearch(''); }}>Clear</button>
      </form>
      <AdminAsyncState loading={loading} error={error} empty={!customers.length} emptyTitle="No customers found" emptyDescription="Customer accounts will appear here after registration.">
        <div className="admin-card">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Customer</th><th>Mobile</th><th>Member since</th><th>Addresses</th><th>Orders</th><th>Total spent</th><th /></tr></thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td style={{ color: 'var(--white)' }}>{customer.name || '—'}</td>
                    <td>{customer.mobile}</td>
                    <td>{formatDate(customer.createdAt)}</td>
                    <td>{customer.addressCount}</td>
                    <td>{customer.orderCount}</td>
                    <td>{formatINR(customer.totalSpentPaise)}</td>
                    <td><Link className="text-link inline-flex items-center gap-1" to={`/admin/customers/${customer.id}`}>Open <ArrowUpRight size={12} /></Link></td>
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
