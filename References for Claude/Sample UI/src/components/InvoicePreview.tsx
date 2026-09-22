import { useState, useEffect, useRef } from 'react';
import type { Invoice } from '../types';
import { generateInvoicePDF, getInvoicePDFBlobUrlsBySide } from '../utils/generatePDF';

interface Props {
  invoice: Invoice | null;
}

interface BlobPair {
  customer: string;
  accountant: string;
}

export default function InvoicePreview({ invoice }: Props) {
  const [blobs, setBlobs] = useState<BlobPair | null>(null);
  const [loading, setLoading] = useState(false);
  const prevBlobsRef = useRef<BlobPair | null>(null);

  useEffect(() => {
    if (!invoice) {
      setBlobs(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setBlobs(null);

    getInvoicePDFBlobUrlsBySide(invoice).then(pair => {
      if (cancelled) {
        URL.revokeObjectURL(pair.customer);
        URL.revokeObjectURL(pair.accountant);
        return;
      }
      if (prevBlobsRef.current) {
        URL.revokeObjectURL(prevBlobsRef.current.customer);
        URL.revokeObjectURL(prevBlobsRef.current.accountant);
      }
      prevBlobsRef.current = pair;
      setBlobs(pair);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [invoice?.id]);

  useEffect(() => {
    return () => {
      if (prevBlobsRef.current) {
        URL.revokeObjectURL(prevBlobsRef.current.customer);
        URL.revokeObjectURL(prevBlobsRef.current.accountant);
      }
    };
  }, []);

  if (!invoice) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="flex flex-col items-center gap-3 opacity-20">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <p className="text-sm font-serif tracking-wide">Select an invoice to preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#111' }}>
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-5 py-2.5 shrink-0"
        style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <span
            className="font-semibold"
            style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)', fontSize: 13 }}
          >
            {invoice.id}
          </span>
          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            {invoice.firstVesselName} · {invoice.buyersName}
          </span>
        </div>
        <button
          onClick={() => generateInvoicePDF(invoice)}
          className="flex items-center gap-2 px-4 py-1.5 rounded text-sm font-semibold"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download PDF
        </button>
      </div>

      {/* Copy labels */}
      {blobs && (
        <div
          className="grid shrink-0 px-4 pt-3 pb-1"
          style={{ gridTemplateColumns: '1fr 1fr', gap: '12px' }}
        >
          {[
            { label: 'Customer Copy', accent: '#4caf7a' },
            { label: 'Accountant Copy', accent: 'var(--primary)' },
          ].map(({ label, accent }) => (
            <div key={label} className="flex items-center gap-2 px-1">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
              <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: accent, fontSize: 9 }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Side-by-side iframes */}
      <div className="flex-1 relative overflow-hidden px-4 pb-4 pt-2">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#111' }}>
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-8 h-8 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }}
              />
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Rendering copies…</p>
            </div>
          </div>
        )}

        {blobs && (
          <div className="grid h-full" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <iframe
              key={`customer-${blobs.customer}`}
              src={blobs.customer}
              className="w-full h-full rounded border-0"
              style={{ outline: '2px solid #2a5a3a' }}
              title={`${invoice.id} — Customer Copy`}
            />
            <iframe
              key={`accountant-${blobs.accountant}`}
              src={blobs.accountant}
              className="w-full h-full rounded border-0"
              style={{ outline: `2px solid color-mix(in srgb, var(--primary) 40%, transparent)` }}
            title={`${invoice.id} — Accountant Copy`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
