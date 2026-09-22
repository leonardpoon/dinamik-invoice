import type { Invoice } from '../types';
import { generateInvoicePDF } from '../utils/generatePDF';

interface Props {
  invoice: Invoice;
  onClose: () => void;
  onToggleFiled: (id: string) => void;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      <span className="text-sm" style={{ fontFamily: mono ? 'var(--font-jetbrains)' : undefined, fontSize: mono ? 12 : undefined }}>
        {value || '—'}
      </span>
    </div>
  );
}

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmt(n: number, currency: string) {
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export default function InvoiceDetail({ invoice, onClose, onToggleFiled }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="ml-auto w-full max-w-xl flex flex-col h-full overflow-auto" style={{ background: 'var(--card)', borderLeft: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 sticky top-0 z-10" style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
          <div>
            <span className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>Invoice</span>
            <div className="text-xl font-semibold" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)' }}>{invoice.debitNumber || invoice.id}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)', fontSize: 10 }}>Filing: {invoice.id}</div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded flex items-center justify-center"
            style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => generateInvoicePDF(invoice)}
            className="flex-1 py-2 text-sm font-semibold rounded flex items-center justify-center gap-2"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download PDF (2 copies)
          </button>
          <button
            onClick={() => onToggleFiled(invoice.id)}
            className="flex-1 py-2 text-sm font-semibold rounded flex items-center justify-center gap-2"
            style={{
              background: invoice.filed ? 'var(--secondary)' : '#1a3a2a',
              color: invoice.filed ? 'var(--muted-foreground)' : '#4caf7a',
              border: `1px solid ${invoice.filed ? 'var(--border)' : '#2a5a3a'}`,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {invoice.filed
                ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
                : <polyline points="20 6 9 17 4 12" />}
            </svg>
            {invoice.filed ? 'Unmark Filed' : 'Mark as Filed'}
          </button>
        </div>

        {/* Details */}
        <div className="px-6 flex-1">
          <div className="py-4">
            <p className="text-xs tracking-widest uppercase mb-3" style={{ color: 'var(--primary)' }}>Identity</p>
            <Row label="Debit Number" value={invoice.debitNumber} mono />
            <Row label="Invoice Number" value={invoice.invoiceNumber} mono />
            <Row label="SI Number" value={invoice.siNumber} mono />
            <Row label="Buyer" value={invoice.buyersName} />
            <Row label="Issue Date" value={fmtDate(invoice.issueDate)} mono />
          </div>
          <div className="py-4">
            <p className="text-xs tracking-widest uppercase mb-3" style={{ color: 'var(--primary)' }}>Cargo</p>
            <Row label="Grade" value={invoice.grade} />
            <Row label="Metric Tonnes" value={invoice.metricTonnes.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' MT'} mono />
            <Row label="Unit Conversion Factor" value={String(invoice.unitConversionFactor)} mono />
            <Row label="Units" value={invoice.units.toLocaleString('en-US', { minimumFractionDigits: 4 })} mono />
          </div>
          <div className="py-4">
            <p className="text-xs tracking-widest uppercase mb-3" style={{ color: 'var(--primary)' }}>First Carrier</p>
            <Row label="Vessel Name" value={invoice.firstVesselName} />
            <Row label="Voyage Number" value={invoice.firstVoyageNumber} mono />
            <Row label="Arrival Date" value={fmtDate(invoice.arrivalDate)} mono />
          </div>
          <div className="py-4">
            <p className="text-xs tracking-widest uppercase mb-3" style={{ color: 'var(--primary)' }}>Bill of Lading</p>
            <Row label="B/L Number" value={invoice.blNumber} mono />
            <Row label="B/L Dated" value={fmtDate(invoice.blDated)} mono />
          </div>
          <div className="py-4">
            <p className="text-xs tracking-widest uppercase mb-3" style={{ color: 'var(--primary)' }}>Outward Vessel</p>
            <Row label="Vessel Name" value={invoice.outwardVesselName} />
            <Row label="Voyage Number" value={invoice.outwardVoyageNumber} mono />
            <Row label="Destination" value={invoice.destination} />
          </div>
          <div className="py-4">
            <p className="text-xs tracking-widest uppercase mb-3" style={{ color: 'var(--primary)' }}>Financials</p>
            <Row label="Fixed Rate / MT" value={fmt(invoice.fixedRate, invoice.currency)} mono />
            <Row label="Metric Tonnes" value={invoice.metricTonnes.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' MT'} mono />
            <div className="flex items-center justify-between py-4">
              <span className="font-semibold">Total Rate</span>
              <span className="text-xl font-semibold" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)' }}>
                {fmt(invoice.totalRate, invoice.currency)}
              </span>
            </div>
          </div>
          {invoice.notes && (
            <div className="py-4 pb-8">
              <p className="text-xs tracking-widest uppercase mb-3" style={{ color: 'var(--primary)' }}>Notes</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{invoice.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
