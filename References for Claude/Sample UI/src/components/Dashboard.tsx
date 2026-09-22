import { useState } from 'react';
import type { Invoice } from '../types';
import { generateInvoicePDF } from '../utils/generatePDF';

interface Props {
  invoices: Invoice[];
  onNavigate: (tab: string) => void;
}

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMT(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MT';
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="p-5 rounded flex flex-col gap-1" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)' }}>
        {label}
      </div>
      <div className="text-2xl font-semibold leading-tight" style={{ fontFamily: 'var(--font-jetbrains)', color: accent ? 'var(--primary)' : 'var(--foreground)' }}>
        {value}
      </div>
      {sub && <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{sub}</div>}
    </div>
  );
}

function MiniBar({ pct, color = 'var(--primary)' }: { pct: number; color?: string }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--border)' }}>
      <div className="h-full rounded-full" style={{ width: Math.min(100, pct) + '%', background: color }} />
    </div>
  );
}

// Build list of all YYYYMM keys present in invoices, sorted descending
function getMonthOptions(invoices: Invoice[]): { key: string; label: string }[] {
  const seen = new Set<string>();
  invoices.forEach(inv => {
    const m = inv.id.match(/^D(\d{4})(\d{2})-/);
    if (m) seen.add(m[1] + m[2]);
  });
  return Array.from(seen)
    .sort((a, b) => b.localeCompare(a))
    .map(key => {
      const d = new Date(parseInt(key.slice(0, 4)), parseInt(key.slice(4)) - 1, 1);
      return { key, label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
    });
}

export default function Dashboard({ invoices, onNavigate }: Props) {
  const totalMT = invoices.reduce((s, i) => s + i.metricTonnes, 0);

  // Top buyer by MT over last 30 days
  const now30 = new Date();
  const cutoff30 = new Date(now30.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const buyerMTMap: Record<string, number> = {};
  invoices.forEach(inv => {
    const b = inv.buyersName || '—';
    buyerMTMap[b] = (buyerMTMap[b] ?? 0) + inv.metricTonnes;
  });
  const buyer30Map: Record<string, number> = {};
  invoices.filter(inv => inv.issueDate >= cutoff30).forEach(inv => {
    const b = inv.buyersName || '—';
    buyer30Map[b] = (buyer30Map[b] ?? 0) + inv.metricTonnes;
  });
  const top30Entry = Object.entries(buyer30Map).sort((a, b) => b[1] - a[1])[0];
  const topBuyerName = top30Entry ? top30Entry[0] : '—';
  const topBuyerMT = top30Entry ? top30Entry[1] : 0;

  // Month selector for tonnage chart
  const monthOptions = getMonthOptions(invoices);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('all');

  // Monthly bar chart data — count of invoices per month (last 6)
  const now = new Date();
  const barMonths: { label: string; key: string; mt: number; count: number }[] = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const key = 'D' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0');
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const slice = invoices.filter(inv => inv.id.startsWith(key));
    barMonths.push({ label, key, mt: slice.reduce((s, i) => s + i.metricTonnes, 0), count: slice.length });
  }
  const maxBarMT = Math.max(...barMonths.map(m => m.mt), 1);

  // Tonnage by vessel — filtered by selected month
  const vesselSlice = selectedMonthKey === 'all'
    ? invoices
    : invoices.filter(inv => {
        const m = inv.id.match(/^D(\d{4})(\d{2})-/);
        return m ? (m[1] + m[2]) === selectedMonthKey : false;
      });

  const vesselMTMap: Record<string, { mt: number; count: number }> = {};
  vesselSlice.forEach(inv => {
    const v = inv.firstVesselName || '—';
    if (!vesselMTMap[v]) vesselMTMap[v] = { mt: 0, count: 0 };
    vesselMTMap[v].mt += inv.metricTonnes;
    vesselMTMap[v].count++;
  });
  const topVesselsMT = Object.entries(vesselMTMap)
    .sort((a, b) => b[1].mt - a[1].mt)
    .slice(0, 8);
  const maxVesselMT = Math.max(...topVesselsMT.map(v => v[1].mt), 1);

  // Recent (5)
  const recent = [...invoices].sort((a, b) => b.issueDate.localeCompare(a.issueDate)).slice(0, 5);

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="text-xs tracking-widest uppercase mb-1" style={{ color: 'var(--primary)', fontFamily: 'var(--font-jetbrains)' }}>Overview</p>
          <h1 className="text-3xl font-serif font-light">Analytics</h1>
        </div>
        {invoices.length === 0 && (
          <button onClick={() => onNavigate('new')} className="px-5 py-2.5 text-sm font-semibold rounded" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            Create First Invoice
          </button>
        )}
      </div>

      {invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32" style={{ color: 'var(--muted-foreground)' }}>
          <p className="text-base">No data yet</p>
          <p className="text-sm mt-1 opacity-60">Create your first invoice to see analytics</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">

          {/* KPI row */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Total Metric Tonnes" value={fmtMT(totalMT)} sub={invoices.length + ' invoice' + (invoices.length !== 1 ? 's' : '')} accent />
            {/* Top Buyer — spans 2 cols */}
            <div className="col-span-2 p-5 rounded flex flex-col gap-1" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)' }}>
                  Top Buyer
                </div>
                <span className="text-xs" style={{ color: 'var(--muted-foreground)', opacity: 0.55, fontSize: 9 }}>(30 days)</span>
              </div>
              <div className="text-2xl font-semibold leading-tight truncate" style={{ fontFamily: 'var(--font-jetbrains)' }}>
                {topBuyerName}
              </div>
              {topBuyerMT > 0 && (
                <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{fmtMT(topBuyerMT)} in period</div>
              )}
            </div>
          </div>

          {/* Monthly volume bar + buyers */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 p-5 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <div className="text-xs tracking-widest uppercase mb-5" style={{ color: 'var(--muted-foreground)' }}>Monthly Tonnage (MT)</div>
              <div className="flex items-end gap-2" style={{ height: 100 }}>
                {barMonths.map(m => (
                  <div key={m.key} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)', fontSize: 9 }}>
                      {m.mt > 0 ? (m.mt >= 1000 ? (m.mt / 1000).toFixed(1) + 'k' : m.mt.toFixed(0)) : ''}
                    </div>
                    <div className="w-full rounded-t" style={{ height: Math.max((m.mt / maxBarMT) * 100, 2) + '%', background: m.mt > 0 ? 'var(--primary)' : 'var(--border)', minHeight: 3 }} />
                    <div className="text-xs text-center" style={{ color: 'var(--muted-foreground)', fontSize: 9 }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <div className="text-xs tracking-widest uppercase mb-4" style={{ color: 'var(--muted-foreground)' }}>Top Buyers</div>
              <div className="flex flex-col gap-3">
                {Object.entries(buyerMTMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([buyer, mt]) => (
                  <div key={buyer}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs truncate pr-2">{buyer}</span>
                      <span className="text-xs shrink-0" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', fontSize: 10 }}>
                        {mt >= 1000 ? (mt / 1000).toFixed(1) + 'k' : mt.toFixed(0)} MT
                      </span>
                    </div>
                    <MiniBar pct={(mt / topBuyerMT) * 100} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tonnage by vessel per month */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 p-5 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>Tonnage by Vessel</div>
                <select
                  value={selectedMonthKey}
                  onChange={e => setSelectedMonthKey(e.target.value)}
                  style={{ fontSize: 11, padding: '3px 8px', fontFamily: 'var(--font-jetbrains)', minWidth: 140 }}
                >
                  <option value="all">All time</option>
                  {monthOptions.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
              {topVesselsMT.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--muted-foreground)' }}>No data for this period</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {topVesselsMT.map(([vessel, { mt, count }]) => (
                    <div key={vessel}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm truncate pr-3 flex-1">{vessel}</span>
                        <span className="text-xs shrink-0 mr-3" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{count} inv</span>
                        <span className="text-xs shrink-0 font-semibold" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)', fontSize: 11, minWidth: 80, textAlign: 'right' }}>
                          {fmtMT(mt)}
                        </span>
                      </div>
                      <MiniBar pct={(mt / maxVesselMT) * 100} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <div className="text-xs tracking-widest uppercase mb-4" style={{ color: 'var(--muted-foreground)' }}>Grade Distribution</div>
              {(() => {
                const gMap: Record<string, number> = {};
                invoices.forEach(i => { gMap[i.grade || '—'] = (gMap[i.grade || '—'] ?? 0) + 1; });
                const grades = Object.entries(gMap).sort((a, b) => b[1] - a[1]);
                const maxG = Math.max(...grades.map(g => g[1]), 1);
                return (
                  <div className="flex flex-col gap-3">
                    {grades.slice(0, 5).map(([grade, count]) => (
                      <div key={grade}>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--foreground)' }}>{grade}</span>
                          <span className="text-xs" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)' }}>{count}</span>
                        </div>
                        <MiniBar pct={(count / maxG) * 100} />
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Recent invoices — no monetary column */}
          <div className="p-5 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>Recent Invoices</div>
              <button onClick={() => onNavigate('current')} className="text-xs" style={{ color: 'var(--primary)' }}>View all →</button>
            </div>
            <div className="flex flex-col">
              {recent.map((inv, idx) => (
                <div
                  key={inv.id}
                  className="grid items-center py-2.5 px-3 rounded-sm"
                  style={{ gridTemplateColumns: '120px 140px 1fr 1fr 90px 80px', background: idx % 2 === 0 ? 'transparent' : 'var(--secondary)' }}
                >
                  <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)', fontSize: 11 }}>{inv.debitNumber || inv.id}</span>
                  <span className="text-xs truncate pr-2" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', fontSize: 10 }}>{inv.id}</span>
                  <span className="text-sm truncate pr-2">{inv.buyersName}</span>
                  <span className="text-sm truncate pr-2" style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>{inv.destination || '—'}</span>
                  <span className="text-xs" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', fontSize: 10 }}>
                    {inv.metricTonnes > 0 ? fmtMT(inv.metricTonnes) : '—'}
                  </span>
                  <div className="flex justify-end">
                    <button onClick={() => generateInvoicePDF(inv)} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)', fontSize: 9 }}>PDF</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
