import { useState } from 'react';
import type { Invoice } from '../types';
import InvoicePreview from './InvoicePreview';
import { generateInvoicePDF } from '../utils/generatePDF';
import { generateFilingReport } from '../utils/generateFilingReport';

interface Props {
  invoices: Invoice[];
  onNavigateNew: () => void;
}


export default function CurrentInvoices({ invoices, onNavigateNew }: Props) {
  const [selected, setSelected] = useState<Invoice | null>(null);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const prefix = `D${year}${String(month).padStart(2, '0')}-`;

  const current = invoices
    .filter(inv => inv.id.startsWith(prefix))
    .sort((a, b) => b.id.localeCompare(a.id));

  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left panel — invoice list */}
      <div
        className="flex flex-col shrink-0 overflow-hidden"
        style={{ width: 300, borderRight: '1px solid var(--border)', background: 'var(--card)' }}
      >
        {/* Panel header */}
        <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-xs tracking-widest uppercase mb-0.5" style={{ color: 'var(--primary)', fontFamily: 'var(--font-jetbrains)' }}>
            Current Period
          </p>
          <h2 className="text-base font-serif font-light">{monthLabel}</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
            {current.length} invoice{current.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Invoice list */}
        <div className="flex-1 overflow-auto">
          {current.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--border)' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>No invoices this month</p>
              <button
                onClick={onNavigateNew}
                className="text-xs px-3 py-1.5 rounded"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                Create Invoice
              </button>
            </div>
          ) : (
            current.map(inv => {
              const isSelected = selected?.id === inv.id;
              return (
                <div
                  key={inv.id}
                  onClick={() => setSelected(inv)}
                  className="w-full text-left px-4 py-3 flex flex-col gap-1 transition-colors cursor-pointer"
                  style={{
                    background: isSelected ? 'color-mix(in srgb, var(--primary) 10%, var(--card))' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                    borderLeft: `3px solid ${isSelected ? 'var(--primary)' : 'transparent'}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      {/* DN number */}
                      <span
                        className="text-xs font-semibold truncate"
                        style={{ fontFamily: 'var(--font-jetbrains)', color: isSelected ? 'var(--primary)' : 'var(--foreground)', fontSize: 11 }}
                      >
                        {inv.debitNumber || inv.id}
                      </span>
                      {/* Invoice number */}
                      {inv.invoiceNumber && (
                        <span className="text-xs truncate" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)', fontSize: 10 }}>
                          {inv.invoiceNumber}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); generateInvoicePDF(inv); }}
                      className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                      style={{ color: 'var(--muted-foreground)' }}
                      title="Export PDF"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                  </div>
                  {/* Buyer */}
                  <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{inv.buyersName}</p>
                  {/* Port */}
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{inv.destination || '—'}</p>
                </div>
              );
            })
          )}
        </div>

        {/* Filing report */}
        {current.length > 0 && (
          <div className="px-4 py-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => generateFilingReport(current, now.getFullYear(), now.getMonth() + 1)}
              className="w-full py-2 text-xs font-semibold rounded flex items-center justify-center gap-2"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Generate Filing Report
            </button>
          </div>
        )}
      </div>

      {/* Right — invoice preview */}
      <InvoicePreview invoice={selected} />
    </div>
  );
}
