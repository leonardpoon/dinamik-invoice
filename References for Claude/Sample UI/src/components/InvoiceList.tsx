import { useState } from 'react';
import type { Invoice } from '../types';
import { generateInvoicePDF } from '../utils/generatePDF';

interface Props {
  invoices: Invoice[];
  onToggleFiled: (id: string) => void;
  onDelete: (id: string) => void;
  onView: (invoice: Invoice) => void;
}

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtAmt(n: number, currency: string) {
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#1a1d27', text: '#6b6760' },
  issued: { bg: '#1a2a3a', text: '#5aabda' },
  filed: { bg: '#1a3a2a', text: '#4caf7a' },
};

export default function InvoiceList({ invoices, onToggleFiled, onDelete, onView }: Props) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'filed'>('all');
  const [sortField, setSortField] = useState<'id' | 'issueDate' | 'total'>('issueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const getTotal = (inv: Invoice) => inv.totalRate;

  const filtered = invoices
    .filter(inv => {
      const q = search.toLowerCase();
      const matchSearch = !q || [inv.id, inv.firstVesselName, inv.buyersName, inv.destination]
        .some(v => (v ?? '').toLowerCase().includes(q));
      const matchStatus = filterStatus === 'all'
        || (filterStatus === 'filed' && inv.filed)
        || (filterStatus === 'pending' && !inv.filed);
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'id') cmp = a.id.localeCompare(b.id);
      else if (sortField === 'issueDate') cmp = a.issueDate.localeCompare(b.issueDate);
      else if (sortField === 'total') cmp = getTotal(a) - getTotal(b);
      return sortDir === 'desc' ? -cmp : cmp;
    });

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => (
    <span style={{ color: sortField === field ? 'var(--primary)' : 'var(--border)', fontSize: 10 }}>
      {sortField === field ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ' ⬍'}
    </span>
  );

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-xs tracking-widest uppercase mb-1" style={{ color: 'var(--primary)', fontFamily: 'var(--font-jetbrains)' }}>
            Filing Register
          </p>
          <h1 className="text-3xl font-serif font-light">Invoice Archive</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
            {invoices.length} total · {invoices.filter(i => i.filed).length} filed
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>Outstanding</div>
          <div className="text-xl font-semibold" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)' }}>
            {invoices.filter(i => !i.filed).length}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search vessel, buyer, invoice ID…"
          className="flex-1 min-w-48"
          style={{ maxWidth: 360 }}
        />
        <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {(['all', 'pending', 'filed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className="px-4 py-2 text-xs font-medium capitalize transition-colors"
              style={{
                background: filterStatus === f ? 'var(--primary)' : 'var(--secondary)',
                color: filterStatus === f ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--muted-foreground)' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4 opacity-30">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p className="text-sm">No invoices found</p>
        </div>
      ) : (
        <div className="rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {/* Table header */}
          <div
            className="grid text-xs font-semibold uppercase tracking-wider px-4 py-3"
            style={{
              background: 'var(--card)',
              color: 'var(--muted-foreground)',
              gridTemplateColumns: '32px 160px 1fr 1fr 120px 120px 110px 100px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span></span>
            <button className="text-left hover:text-foreground transition-colors" onClick={() => toggleSort('id')}>
              Invoice <SortIcon field="id" />
            </button>
            <span>Vessel</span>
            <span>Buyer</span>
            <span>Destination</span>
            <button className="text-left hover:text-foreground transition-colors" onClick={() => toggleSort('issueDate')}>
              Issued <SortIcon field="issueDate" />
            </button>
            <button className="text-left hover:text-foreground transition-colors" onClick={() => toggleSort('total')}>
              Total <SortIcon field="total" />
            </button>
            <span>Actions</span>
          </div>

          {/* Rows */}
          {filtered.map((inv, idx) => {
            const total = getTotal(inv);
            const statusColor = STATUS_COLORS[inv.status] ?? STATUS_COLORS.issued;
            return (
              <div
                key={inv.id}
                className="grid items-center px-4 py-3 transition-colors"
                style={{
                  gridTemplateColumns: '32px 160px 1fr 1fr 120px 120px 110px 100px',
                  background: idx % 2 === 0 ? 'var(--card)' : 'var(--secondary)',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                {/* Filed checkbox */}
                <label className="flex items-center cursor-pointer" title={inv.filed ? 'Mark as pending' : 'Mark as filed'}>
                  <input
                    type="checkbox"
                    checked={inv.filed}
                    onChange={() => onToggleFiled(inv.id)}
                    className="sr-only"
                  />
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center transition-all"
                    style={{
                      background: inv.filed ? 'var(--primary)' : 'transparent',
                      border: `2px solid ${inv.filed ? 'var(--primary)' : 'var(--border)'}`,
                    }}
                  >
                    {inv.filed && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="var(--primary-foreground)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="10 3 5 9 2 6" />
                      </svg>
                    )}
                  </div>
                </label>

                {/* Invoice ID */}
                <div>
                  <span
                    className="text-sm font-semibold"
                    style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)', fontSize: 12 }}
                  >
                    {inv.id}
                  </span>
                  <div className="mt-1">
                    <span
                      className="inline-block text-xs px-1.5 py-0.5 rounded"
                      style={{ background: statusColor.bg, color: statusColor.text, fontSize: 9, fontWeight: 600 }}
                    >
                      {inv.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Vessel */}
                <div className="text-sm truncate pr-2" style={{ color: 'var(--foreground)' }}>
                  {inv.firstVesselName}
                </div>

                {/* Buyer */}
                <div className="text-sm truncate pr-2" style={{ color: 'var(--foreground)' }}>
                  {inv.buyersName}
                </div>

                {/* Destination */}
                <div className="text-sm truncate pr-2" style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
                  {inv.destination || '—'}
                </div>

                {/* Date */}
                <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)' }}>
                  {fmtDate(inv.issueDate)}
                </div>

                {/* Total */}
                <div className="text-sm font-medium" style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 12 }}>
                  {fmtAmt(total, inv.currency)}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onView(inv)}
                    title="View"
                    className="w-7 h-7 rounded flex items-center justify-center transition-colors"
                    style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                  <button
                    onClick={() => generateInvoicePDF(inv)}
                    title="Download PDF"
                    className="w-7 h-7 rounded flex items-center justify-center transition-colors"
                    style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setConfirmDelete(inv.id)}
                    title="Delete"
                    className="w-7 h-7 rounded flex items-center justify-center transition-colors"
                    style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="rounded-lg p-6 w-80" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold mb-2">Delete Invoice</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--muted-foreground)' }}>
              Permanently delete <span style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)', fontSize: 12 }}>{confirmDelete}</span>? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 text-sm rounded"
                style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { onDelete(confirmDelete); setConfirmDelete(null); }}
                className="flex-1 py-2 text-sm font-semibold rounded"
                style={{ background: '#e05252', color: '#fff' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
