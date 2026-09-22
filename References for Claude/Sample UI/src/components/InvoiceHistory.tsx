import { useState, useMemo } from 'react';
import type { Invoice } from '../types';
import InvoicePreview from './InvoicePreview';
import { generateInvoicePDF } from '../utils/generatePDF';

interface Props {
  invoices: Invoice[];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface MonthGroup {
  month: number;
  invoices: Invoice[];
  total: number;
}

interface YearGroup {
  year: number;
  months: MonthGroup[];
  total: number;
  count: number;
}

function getTotal(inv: Invoice): number {
  return inv.totalRate;
}

function fmtAmt(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

function parseYearMonth(id: string): { year: number; month: number } | null {
  const m = id.match(/^D(\d{4})(\d{2})-/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

function buildGroups(invoices: Invoice[]): YearGroup[] {
  const yearMap: Record<number, Record<number, Invoice[]>> = {};
  for (const inv of invoices) {
    const parsed = parseYearMonth(inv.id);
    if (!parsed) continue;
    const { year, month } = parsed;
    if (!yearMap[year]) yearMap[year] = {};
    if (!yearMap[year][month]) yearMap[year][month] = [];
    yearMap[year][month].push(inv);
  }
  return Object.keys(yearMap)
    .map(Number)
    .sort((a, b) => b - a)
    .map(year => {
      const months = Object.keys(yearMap[year])
        .map(Number)
        .sort((a, b) => b - a)
        .map(month => {
          const list = yearMap[year][month].slice().sort((a, b) => b.id.localeCompare(a.id));
          return { month, invoices: list, total: list.reduce((s, i) => s + getTotal(i), 0) };
        });
      return {
        year,
        months,
        count: months.reduce((s, mg) => s + mg.invoices.length, 0),
        total: months.reduce((s, mg) => s + mg.total, 0),
      };
    });
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="9" height="9" viewBox="0 0 10 10" fill="none"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', color: 'var(--muted-foreground)', flexShrink: 0 }}
    >
      <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function matchesQuery(inv: Invoice, q: string): boolean {
  if (!q) return true;
  const lq = q.toLowerCase();
  const ym = inv.id.match(/^D(\d{4})(\d{2})-/);
  const monthName = ym ? MONTH_NAMES[parseInt(ym[2], 10) - 1].toLowerCase() : '';
  return [
    inv.id,
    inv.debitNumber,
    inv.invoiceNumber,
    inv.buyersName,
    inv.siNumber,
    inv.firstVesselName,
    inv.outwardVesselName,
    inv.destination,
    inv.blNumber,
    monthName,
    ym ? ym[1] : '',
  ].some(v => (v ?? '').toLowerCase().includes(lq));
}

export default function InvoiceHistory({ invoices }: Props) {
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [openYears, setOpenYears] = useState<string[]>([]);
  const [openMonths, setOpenMonths] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const filteredInvoices = useMemo(
    () => query ? invoices.filter(inv => matchesQuery(inv, query)) : invoices,
    [invoices, query]
  );
  const groups = useMemo(() => buildGroups(filteredInvoices), [filteredInvoices]);

  // Auto-expand all groups when a search is active
  const displayOpenYears = query ? groups.map(g => String(g.year)) : openYears;
  const displayOpenMonths = query
    ? groups.flatMap(g => g.months.map(m => g.year + '-' + m.month))
    : openMonths;

  function toggleYear(year: number) {
    const key = String(year);
    setOpenYears(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  function toggleMonth(key: string) {
    setOpenMonths(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left panel */}
      <div
        className="flex flex-col shrink-0 overflow-hidden"
        style={{ width: 300, borderRight: '1px solid var(--border)', background: 'var(--card)' }}
      >
        <div className="px-4 py-4 shrink-0 flex flex-col gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="text-xs tracking-widest uppercase mb-0.5" style={{ color: 'var(--primary)', fontFamily: 'var(--font-jetbrains)' }}>
              Archive
            </p>
            <h2 className="text-base font-serif font-light">Invoice History</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
              {invoices.length} total &middot; {groups.length} year{groups.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 px-2 rounded" style={{ border: '1px solid var(--border)', background: 'var(--secondary)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted-foreground)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Vessel, buyer, port, month…"
              style={{ border: 'none', background: 'transparent', flex: 1, fontSize: 12, padding: '6px 0' }}
            />
            {query && (
              <button onClick={() => setQuery('')} style={{ color: 'var(--muted-foreground)', lineHeight: 1 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          {query && (
            <p className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)', fontSize: 10 }}>
              {filteredInvoices.length} result{filteredInvoices.length !== 1 ? 's' : ''} for "{query}"
            </p>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {groups.length === 0 ? (
            <div className="flex items-center justify-center h-full px-6 text-center">
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>No invoice history yet</p>
            </div>
          ) : groups.map(yg => {
            const isYearOpen = displayOpenYears.includes(String(yg.year));
            const isCurrent = yg.year === currentYear;

            return (
              <div key={yg.year}>
                {/* Year row */}
                <button
                  onClick={() => toggleYear(yg.year)}
                  className="w-full flex items-center justify-between px-4 py-3 transition-colors"
                  style={{
                    background: isYearOpen ? 'color-mix(in srgb, var(--primary) 8%, var(--card))' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <ChevronIcon open={isYearOpen} />
                    <span className="font-semibold text-sm" style={{ fontFamily: 'var(--font-jetbrains)' }}>
                      {yg.year}
                    </span>
                    {isCurrent && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)', fontSize: 9 }}>
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', fontSize: 10 }}>
                      {fmtAmt(yg.total)}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontSize: 9 }}>
                      {yg.count} inv
                    </div>
                  </div>
                </button>

                {/* Month rows */}
                {isYearOpen && yg.months.map(mg => {
                  const monthKey = yg.year + '-' + mg.month;
                  const isMonthOpen = displayOpenMonths.includes(monthKey);
                  const isCurrentMonth = isCurrent && mg.month === currentMonth;

                  return (
                    <div key={monthKey}>
                      {/* Month header row */}
                      <div
                        className="flex items-center"
                        style={{
                          paddingLeft: 28,
                          paddingRight: 8,
                          background: isMonthOpen ? 'color-mix(in srgb, var(--primary) 6%, var(--card))' : 'var(--secondary)',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        {/* Expand/collapse button (takes remaining space) */}
                        <div
                          onClick={() => toggleMonth(monthKey)}
                          className="flex-1 flex items-center justify-between py-2.5 cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <ChevronIcon open={isMonthOpen} />
                            <span className="text-sm" style={{ color: isCurrentMonth ? 'var(--primary)' : 'var(--foreground)' }}>
                              {MONTH_NAMES[mg.month - 1]}
                            </span>
                            {isCurrentMonth && (
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#4caf7a' }} />
                            )}
                          </div>
                          <div className="text-right mr-2">
                            <div className="text-xs" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', fontSize: 10 }}>
                              {fmtAmt(mg.total)}
                            </div>
                            <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontSize: 9 }}>
                              {mg.invoices.length}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Invoice rows */}
                      {isMonthOpen && mg.invoices.map(inv => {
                        const isSelected = selected?.id === inv.id;
                        return (
                          <div
                            key={inv.id}
                            onClick={() => setSelected(inv)}
                            className="flex flex-col gap-0.5 py-2.5 cursor-pointer transition-colors"
                            style={{
                              paddingLeft: 44,
                              paddingRight: 12,
                              background: isSelected ? 'color-mix(in srgb, var(--primary) 12%, var(--card))' : 'var(--card)',
                              borderBottom: '1px solid var(--border)',
                              borderLeft: '3px solid ' + (isSelected ? 'var(--primary)' : 'transparent'),
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-jetbrains)', color: isSelected ? 'var(--primary)' : 'var(--foreground)', fontSize: 11 }}>
                                {inv.id}
                              </span>
                              <button
                                onClick={e => { e.stopPropagation(); generateInvoicePDF(inv); }}
                                className="w-5 h-5 rounded flex items-center justify-center"
                                style={{ color: 'var(--muted-foreground)' }}
                                title="Export PDF"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                              </button>
                            </div>
                            <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)', fontSize: 10 }}>{inv.debitNumber || inv.id}</p>
                            {inv.invoiceNumber && (
                              <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{inv.invoiceNumber}</p>
                            )}
                            <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{inv.buyersName}</p>
                            <p className="text-xs" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--foreground)', fontSize: 10, marginTop: 2 }}>
                              {inv.currency} {getTotal(inv).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right — PDF preview */}
      <InvoicePreview invoice={selected} />
    </div>
  );
}
