// "Overview" — the tonnage dashboard everybody uses (formerly the tab named
// "Analytics"; that name now belongs to the director's money-and-forecasts
// tab instead). The Sample UI's original screen had no costing block behind
// it and stayed money-free by necessity; the fix log asked for the same
// thing here on purpose, so revenue/cost/profit stay off this tab even
// though the accountant copy carries them. Money lives on the debit note
// itself, its PDF, Current/History, and now the Analytics tab.

import { useEffect, useMemo, useState } from 'react'

import { api, errorMessage, savePdf } from '../api'
import type { Analytics as AnalyticsData, DebitNoteSummary, NameStat } from '../types'
import {
  Icon,
  MiniBar,
  PageHeader,
  PrimaryButton,
  fmt2,
  fmtDate,
  fmtInt,
  monthLabel,
  todayIso,
} from '../ui'

interface Props {
  notes: DebitNoteSummary[]
  onNew: () => void
  onOpenCurrent: () => void
  onEdit: (id: number) => void
  notify: (message: string, kind: 'error' | 'ok') => void
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export default function Overview({ notes, onNew, onOpenCurrent, onEdit, notify }: Props) {
  const [scope, setScope] = useState('all')
  const [buyerMetric, setBuyerMetric] = useState<'tonnage' | 'count'>('tonnage')
  const [printing, setPrinting] = useState(false)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .analytics(scope)
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setError(null)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [scope, notes.length])

  // The two "last 30 days" cards are a rolling window, independent of the
  // page's all-time/period selector — computed here from the same register
  // rather than round-tripping to Rust for a figure this cheap to derive.
  const last30 = useMemo(() => {
    const cutoff = Date.now() - THIRTY_DAYS_MS
    const recent = notes.filter((n) => {
      const t = Date.parse(n.dnDate)
      return !Number.isNaN(t) && t >= cutoff
    })
    const tonnage = recent.reduce((s, n) => s + n.tonnage, 0)
    const byBuyer = new Map<string, number>()
    for (const n of recent) {
      const name = n.buyerName.trim() || '—'
      byBuyer.set(name, (byBuyer.get(name) ?? 0) + n.tonnage)
    }
    let topBuyer: { name: string; tonnage: number } | null = null
    for (const [name, tonnage] of byBuyer) {
      if (!topBuyer || tonnage > topBuyer.tonnage) topBuyer = { name, tonnage }
    }
    return { tonnage, topBuyer }
  }, [notes])

  const recent5 = useMemo(
    () => [...notes].sort((a, b) => b.dnDate.localeCompare(a.dnDate) || b.id - a.id).slice(0, 5),
    [notes],
  )

  if (error) {
    return (
      <div className="px-6 py-8 max-w-6xl mx-auto">
        <p className="text-sm" style={{ color: '#e89090' }}>{error}</p>
      </div>
    )
  }

  if (!data) {
    return <div className="px-6 py-8 max-w-6xl mx-auto" />
  }

  if (notes.length === 0) {
    return (
      <div className="px-6 py-8 max-w-6xl mx-auto">
        <PageHeader
          eyebrow="Summary"
          title="Overview"
          right={<PrimaryButton onClick={onNew}>Create First Debit Note</PrimaryButton>}
        />
        <div className="flex flex-col items-center justify-center py-32" style={{ color: 'var(--muted-foreground)' }}>
          <p className="text-base">No data yet</p>
          <p className="text-sm mt-1 opacity-60">Create a debit note to see the overview</p>
        </div>
      </div>
    )
  }

  // Last six months, oldest first, for the tonnage trend.
  const bars = data.months.slice(0, 6).reverse()
  const maxTonnage = Math.max(...bars.map((m) => m.tonnage), 1)
  const scopeLabel = scope === 'all' ? 'All time' : monthLabel(scope)

  async function handlePrint() {
    setPrinting(true)
    try {
      const b64 = await api.overviewReportPdf(scope === 'all' ? undefined : scope)
      const saved = await savePdf(b64, `overview-${scope}-${todayIso()}.pdf`)
      if (saved) notify('Overview report saved — open it to print', 'ok')
    } catch (e) {
      notify(errorMessage(e), 'error')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <PageHeader
        eyebrow="Summary"
        title="Overview"
        sub={scopeLabel}
        right={
          <div className="flex items-center gap-2">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              style={{ fontSize: 12, padding: '6px 10px', fontFamily: 'var(--font-jetbrains)', minWidth: 170, width: 'auto' }}
            >
              <option value="all">All time</option>
              {data.months.map((m) => (
                <option key={m.yearMonth} value={m.yearMonth}>{m.label}</option>
              ))}
            </select>
            <button
              onClick={() => void handlePrint()}
              disabled={printing}
              className="w-8 h-8 rounded flex items-center justify-center transition-colors disabled:opacity-40"
              style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}
              title="Print this report — black and white, one A4 page"
            >
              <Icon name="print" size={15} />
            </button>
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        {/* Row 1 — the two 30-day headline figures, 3 cards wide. */}
        <div className="grid grid-cols-3 gap-4">
          <TileCard label="Total Metric Tonnes" period="30 days" value={fmt2(last30.tonnage) + ' MT'} accent />
          <div className="col-span-2 p-5 rounded flex items-center justify-between" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)' }}>
                  Top Buyer
                </span>
                <span style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>30 days</span>
              </div>
              <div className="text-xl font-serif mt-1">{last30.topBuyer?.name ?? '—'}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)' }}>
                {last30.topBuyer ? fmt2(last30.topBuyer.tonnage) : '0.00'}
              </div>
              <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>MT</div>
            </div>
          </div>
        </div>

        {/* Row 2 — monthly tonnage trend, and the buyer breakdown for the scope above. */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 p-5 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="text-xs tracking-widest uppercase mb-5" style={{ color: 'var(--muted-foreground)' }}>
              Monthly Tonnage (MT)
            </div>
            <div className="flex items-end gap-3" style={{ height: 120 }}>
              {bars.map((m) => (
                <div key={m.yearMonth} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)', fontSize: 9 }}>
                    {fmt2(m.tonnage)}
                  </div>
                  <div
                    className="w-full rounded-t"
                    style={{ height: `${Math.max((m.tonnage / maxTonnage) * 100, 1.5)}%`, background: 'var(--primary)', minHeight: 3 }}
                    title={`${fmt2(m.tonnage)} MT`}
                  />
                  <div className="text-xs text-center" style={{ color: 'var(--muted-foreground)', fontSize: 9 }}>
                    {m.label.slice(0, 3)} {m.yearMonth.slice(2, 4)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-5 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>Buyers</div>
              <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {(['tonnage', 'count'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setBuyerMetric(m)}
                    className="px-2 py-1 text-xs"
                    style={{
                      background: buyerMetric === m ? 'var(--primary)' : 'transparent',
                      color: buyerMetric === m ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                    }}
                  >
                    {m === 'tonnage' ? 'MT' : '#'}
                  </button>
                ))}
              </div>
            </div>
            <BuyerBars stats={data.buyers} metric={buyerMetric} />
          </div>
        </div>

        {/* Row 3 — first-carrier tonnage and grade distribution, both scoped
            by the selector above (all time or a single period). */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 p-5 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>
                Tonnage by First Carriers
              </span>
              <span style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{scopeLabel}</span>
            </div>
            {data.vessels.length === 0 ? (
              <p className="text-xs py-4 text-center" style={{ color: 'var(--muted-foreground)' }}>No data for this period</p>
            ) : (
              <div className="flex flex-col gap-3">
                {data.vessels.slice(0, 8).map((v) => {
                  const max = Math.max(...data.vessels.map((x) => x.tonnage), 1)
                  return (
                    <div key={v.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm truncate pr-3 flex-1">{v.name}</span>
                        <span className="text-xs shrink-0 mr-3" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
                          {v.count} note{v.count === 1 ? '' : 's'}
                        </span>
                        <span
                          className="text-xs shrink-0 font-semibold"
                          style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)', fontSize: 11, minWidth: 82, textAlign: 'right' }}
                        >
                          {fmt2(v.tonnage)} MT
                        </span>
                      </div>
                      <MiniBar pct={(v.tonnage / max) * 100} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <RankPanel title="Grade Distribution" stats={data.products} metric="tonnage" suffix=" MT" />
        </div>

        {/* Row 4 — the 5 most recent notes, replacing the old by-month table. */}
        <div className="p-5 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>Recent Debit Notes</div>
            <button onClick={onOpenCurrent} className="text-xs flex items-center gap-1" style={{ color: 'var(--primary)' }}>
              Open current period <Icon name="chart" size={11} />
            </button>
          </div>
          <div className="flex flex-col">
            {recent5.map((n, i) => (
              <button
                key={n.id}
                onClick={() => onEdit(n.id)}
                className="grid items-center py-2.5 px-3 rounded-sm text-sm text-left transition-colors"
                style={{ gridTemplateColumns: '1fr 1.4fr 1fr 1fr', background: i % 2 === 0 ? 'transparent' : 'var(--secondary)' }}
              >
                <span style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)', fontSize: 12 }}>{n.dnNumber}</span>
                <span className="truncate">{n.buyerName || '—'}</span>
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{fmtDate(n.dnDate)}</span>
                <span className="text-right text-xs" style={{ fontFamily: 'var(--font-jetbrains)' }}>{fmtInt(n.boxes)} boxes · {fmt2(n.tonnage)} MT</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function TileCard({ label, period, value, accent }: { label: string; period: string; value: string; accent?: boolean }) {
  return (
    <div className="p-5 rounded flex flex-col gap-1" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="flex items-baseline gap-2">
        <span className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)' }}>
          {label}
        </span>
        <span style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{period}</span>
      </div>
      <div
        className="text-2xl font-semibold leading-tight"
        style={{ fontFamily: 'var(--font-jetbrains)', color: accent ? 'var(--primary)' : 'var(--foreground)' }}
      >
        {value}
      </div>
    </div>
  )
}

function BuyerBars({ stats, metric }: { stats: NameStat[]; metric: 'tonnage' | 'count' }) {
  const top = [...stats]
    .sort((a, b) => (metric === 'tonnage' ? b.tonnage - a.tonnage : b.count - a.count))
    .slice(0, 8)
  const max = Math.max(...top.map((s) => (metric === 'tonnage' ? s.tonnage : s.count)), 1)
  if (top.length === 0) {
    return <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>No data</p>
  }
  return (
    <div className="flex flex-col gap-3">
      {top.map((s) => {
        const value = metric === 'tonnage' ? s.tonnage : s.count
        return (
          <div key={s.name}>
            <div className="flex justify-between mb-1 gap-2">
              <span className="text-xs truncate">{s.name}</span>
              <span className="text-xs shrink-0" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', fontSize: 10 }}>
                {metric === 'tonnage' ? fmt2(value) + ' MT' : fmtInt(value)}
              </span>
            </div>
            <MiniBar pct={(value / max) * 100} />
          </div>
        )
      })}
    </div>
  )
}

function RankPanel({
  title,
  stats,
  metric,
  suffix,
}: {
  title: string
  stats: NameStat[]
  metric: 'tonnage' | 'count'
  suffix: string
}) {
  const top = stats.slice(0, 6)
  const max = Math.max(...top.map((s) => (metric === 'tonnage' ? s.tonnage : s.count)), 1)
  return (
    <div className="p-5 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="text-xs tracking-widest uppercase mb-4" style={{ color: 'var(--muted-foreground)' }}>{title}</div>
      {top.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>No data</p>
      ) : (
        <div className="flex flex-col gap-3">
          {top.map((s) => {
            const value = metric === 'tonnage' ? s.tonnage : s.count
            return (
              <div key={s.name}>
                <div className="flex justify-between mb-1 gap-2">
                  <span className="text-xs truncate">{s.name}</span>
                  <span className="text-xs shrink-0" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', fontSize: 10 }}>
                    {metric === 'tonnage' ? fmt2(value) : fmtInt(value)}
                    {suffix}
                  </span>
                </div>
                <MiniBar pct={(value / max) * 100} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
