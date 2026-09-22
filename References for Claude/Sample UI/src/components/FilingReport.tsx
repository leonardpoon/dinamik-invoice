import { useState, useEffect, useRef } from 'react';
import type { Invoice } from '../types';
import { getFilingReportBlobUrl, generateFilingReport } from '../utils/generateFilingReport';

interface Props {
  invoices: Invoice[];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getAvailableMonths(invoices: Invoice[]): { year: number; month: number; count: number }[] {
  const map: Record<string, number> = {};
  invoices.forEach(inv => {
    const m = inv.id.match(/^D(\d{4})(\d{2})-/);
    if (m) {
      const key = m[1] + '-' + m[2];
      map[key] = (map[key] ?? 0) + 1;
    }
  });
  return Object.entries(map)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, count]) => ({
      year: parseInt(key.slice(0, 4)),
      month: parseInt(key.slice(5)),
      count,
    }));
}

export default function FilingReport({ invoices }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const prevUrlRef = useRef<string | null>(null);

  const available = getAvailableMonths(invoices);
  const yearOptions = Array.from(new Set(available.map(a => a.year))).sort((a, b) => b - a);

  const filtered = invoices.filter(inv => {
    const m = inv.id.match(/^D(\d{4})(\d{2})-/);
    return m && parseInt(m[1]) === year && parseInt(m[2]) === month;
  });

  // Auto-preview when year/month changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setBlobUrl(null);

    getFilingReportBlobUrl(filtered, year, month).then(url => {
      if (cancelled) { URL.revokeObjectURL(url); return; }
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = url;
      setBlobUrl(url);
      setLoading(false);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, invoices.length]);

  useEffect(() => {
    return () => { if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current); };
  }, []);

  function handleDownload() {
    generateFilingReport(filtered, year, month);
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left panel — controls */}
      <div
        className="flex flex-col shrink-0 overflow-hidden"
        style={{ width: 280, borderRight: '1px solid var(--border)', background: 'var(--card)' }}
      >
        <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-xs tracking-widest uppercase mb-0.5" style={{ color: 'var(--primary)', fontFamily: 'var(--font-jetbrains)' }}>
            Monthly Register
          </p>
          <h2 className="text-base font-serif font-light">Filing Report</h2>
        </div>

        <div className="flex flex-col gap-5 px-4 py-5">
          {/* Year */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs tracking-widest uppercase font-medium" style={{ color: 'var(--muted-foreground)' }}>Year</label>
            <select value={year} onChange={e => setYear(parseInt(e.target.value))}>
              {yearOptions.length > 0
                ? yearOptions.map(y => <option key={y} value={y}>{y}</option>)
                : <option value={now.getFullYear()}>{now.getFullYear()}</option>
              }
            </select>
          </div>

          {/* Month */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs tracking-widest uppercase font-medium" style={{ color: 'var(--muted-foreground)' }}>Month</label>
            <select value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>

          {/* Period summary */}
          <div className="rounded p-3" style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>
              {MONTH_NAMES[month - 1]} {year}
            </div>
            <div className="text-lg font-semibold" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)' }}>
              {filtered.length}
            </div>
            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              invoice{filtered.length !== 1 ? 's' : ''} in period
            </div>
          </div>

          {/* Quick-jump to available months */}
          {available.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-xs tracking-widest uppercase mb-1" style={{ color: 'var(--muted-foreground)' }}>Periods with data</div>
              <div className="flex flex-col gap-0.5 max-h-48 overflow-auto">
                {available.map(a => {
                  const active = a.year === year && a.month === month;
                  return (
                    <button
                      key={`${a.year}-${a.month}`}
                      onClick={() => { setYear(a.year); setMonth(a.month); }}
                      className="flex items-center justify-between px-3 py-2 rounded text-left text-xs transition-colors"
                      style={{
                        background: active ? 'color-mix(in srgb, var(--primary) 12%, var(--card))' : 'transparent',
                        color: active ? 'var(--primary)' : 'var(--foreground)',
                        borderLeft: `2px solid ${active ? 'var(--primary)' : 'transparent'}`,
                      }}
                    >
                      <span>{MONTH_NAMES[a.month - 1]} {a.year}</span>
                      <span style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)', fontSize: 10 }}>{a.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Download button */}
        <div className="mt-auto px-4 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleDownload}
            className="w-full py-2.5 text-xs font-semibold rounded flex items-center justify-center gap-2"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download PDF
          </button>
        </div>
      </div>

      {/* Centre — PDF preview */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#111' }}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-2.5 shrink-0" style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)', fontSize: 11 }}>
              Filing Register — {MONTH_NAMES[month - 1]} {year}
            </span>
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {filtered.length} invoice{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
          {blobUrl && (
            <button
              onClick={() => {
                const iframe = document.querySelector('iframe[data-filing]') as HTMLIFrameElement;
                iframe?.contentWindow?.print();
              }}
              className="flex items-center gap-2 px-4 py-1.5 rounded text-xs font-semibold"
              style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print
            </button>
          )}
        </div>

        {/* Preview */}
        <div className="flex-1 relative overflow-hidden p-4">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#111' }}>
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Generating report…</p>
              </div>
            </div>
          )}
          {blobUrl && (
            <iframe
              key={blobUrl}
              data-filing
              src={blobUrl}
              className="w-full h-full rounded border-0"
              style={{ outline: `2px solid color-mix(in srgb, var(--primary) 30%, transparent)` }}
              title="Filing Report Preview"
            />
          )}
        </div>
      </div>
    </div>
  );
}
