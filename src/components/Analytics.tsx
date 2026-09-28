// "Director Analytics" — money, not tonnage. Pinned at the far right of the
// nav and locked behind a hardcoded password because the shop floor doesn't
// need to see margins; "Overview" stays the operational tab everyone uses
// day to day. The gate never caches — leaving the tab and coming back always
// asks again, on purpose, since a screen left open on this tab is exactly
// the case the password exists for.
//
// Figures are grouped by currency rather than blended into one total — a
// SGD + USD sum would just be a wrong number, not an approximate one. In
// practice the register is almost always a single currency, so that
// grouping is invisible unless it genuinely isn't.
//
// The forecast is deliberately the safest thing that could be called a
// forecast: a low/high range read straight off the last few months' actuals,
// not a fitted trend line. With only a handful of notes some months, a
// regression would just be dressing up noise as a prediction.

import { useEffect, useState } from 'react'

import { api, errorMessage, savePdf } from '../api'
import type { CurrencyAnalytics, MonthStat, NameStat } from '../types'
import { Icon, PageHeader, PrimaryButton, MiniBar, Spinner, fmt2, fmtInt, todayIso } from '../ui'

const PASSWORD = 'dinamik'

interface Props {
  notify: (message: string, kind: 'error' | 'ok') => void
}

export default function Analytics({ notify }: Props) {
  const [unlocked, setUnlocked] = useState(false)
  return unlocked ? <Dashboard notify={notify} /> : <PasswordGate onUnlock={() => setUnlocked(true)} />
}

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (value === PASSWORD) {
      onUnlock()
    } else {
      setError(true)
      setValue('')
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="rounded-lg p-8 w-80 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)' }}
        >
          <Icon name="lock" size={22} strokeWidth={2.5} />
        </div>
        <p className="text-xs tracking-widest uppercase mb-1" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)' }}>
          Restricted
        </p>
        <h3 className="text-xl font-serif mb-1">Director Analytics</h3>
        <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
          Revenue, cost and forecasts — enter the password to continue
        </p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError(false)
            }}
            placeholder="Password"
            style={{ textAlign: 'center' }}
          />
          {error && <p className="text-xs" style={{ color: '#e05252' }}>Incorrect password</p>}
          <PrimaryButton type="submit" className="w-full">Unlock</PrimaryButton>
        </form>
      </div>
    </div>
  )
}

interface ForecastRange {
  low: number
  high: number
  expected: number
  monthsUsed: number
}

/** The low/high read straight off the trailing `window` months' actuals —
 * not a fitted trend, on purpose (see file header). */
function forecastRange(months: MonthStat[], pick: (m: MonthStat) => number, window = 3): ForecastRange | null {
  const recent = months.slice(0, window)
  if (recent.length < 2) return null
  const values = recent.map(pick)
  return {
    low: Math.min(...values),
    high: Math.max(...values),
    expected: values.reduce((a, b) => a + b, 0) / values.length,
    monthsUsed: recent.length,
  }
}

function Dashboard({ notify }: Props) {
  const [currencies, setCurrencies] = useState<CurrencyAnalytics[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currency, setCurrency] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .directorAnalytics()
      .then((d) => {
        if (cancelled) return
        setCurrencies(d.currencies)
        setCurrency((c) => c ?? d.currencies[0]?.currency ?? null)
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="px-6 py-8 max-w-6xl mx-auto">
        <p className="text-sm" style={{ color: '#e89090' }}>{error}</p>
      </div>
    )
  }

  if (!currencies) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Spinner label="Crunching the numbers…" />
      </div>
    )
  }

  if (currencies.length === 0) {
    return (
      <div className="px-6 py-8 max-w-6xl mx-auto">
        <PageHeader eyebrow="Director" title="Director Analytics" />
        <div className="flex flex-col items-center justify-center py-32" style={{ color: 'var(--muted-foreground)' }}>
          <p className="text-base">No data yet</p>
          <p className="text-sm mt-1 opacity-60">Create a debit note to see revenue and cost figures</p>
        </div>
      </div>
    )
  }

  const scoped = currencies.find((c) => c.currency === currency) ?? currencies[0]
  const margin = scoped.totalRevenue > 0 ? (scoped.totalProfit / scoped.totalRevenue) * 100 : 0
  const bars = scoped.months.slice(0, 6).reverse()
  const maxRevenue = Math.max(...bars.map((m) => m.revenue), 1)
  const buyersByProfit = [...scoped.buyers].sort((a, b) => b.profit - a.profit).slice(0, 6)

  const tonnageForecast = forecastRange(scoped.months, (m) => m.tonnage)
  const revenueForecast = forecastRange(scoped.months, (m) => m.revenue)
  const contractsForecast = forecastRange(scoped.months, (m) => m.count)

  async function handlePrint() {
    setPrinting(true)
    try {
      const b64 = await api.directorReportPdf(scoped.currency)
      const saved = await savePdf(b64, `director-analytics-${scoped.currency}-${todayIso()}.pdf`)
      if (saved) notify('Director Analytics report saved — open it to print', 'ok')
    } catch (e) {
      notify(errorMessage(e), 'error')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <PageHeader
        eyebrow="Director"
        title="Director Analytics"
        sub="Revenue, cost and profit — all time"
        right={
          <div className="flex items-center gap-2">
            {currencies.length > 1 && (
              <select
                value={scoped.currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{ fontSize: 12, padding: '6px 10px', fontFamily: 'var(--font-jetbrains)' }}
              >
                {currencies.map((c) => (
                  <option key={c.currency} value={c.currency}>{c.currency}</option>
                ))}
              </select>
            )}
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
        {/* Row 1 — the headline money figures for this currency. */}
        <div className="grid grid-cols-4 gap-4">
          <StatTile label="Revenue" value={`${scoped.currency} ${fmt2(scoped.totalRevenue)}`} />
          <StatTile label="Cost" value={`${scoped.currency} ${fmt2(scoped.totalCost)}`} />
          <StatTile label="Profit" value={`${scoped.currency} ${fmt2(scoped.totalProfit)}`} accent />
          <StatTile label="Margin" value={`${margin.toFixed(1)}%`} accent />
        </div>

        {/* Row 2 — revenue trend, cost/profit split within each bar. */}
        <div className="p-5 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-5">
            <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>
              Monthly Revenue — cost vs. profit
            </div>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--border)' }} /> Cost
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--primary)' }} /> Profit
              </span>
            </div>
          </div>
          {bars.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: 'var(--muted-foreground)' }}>No data yet</p>
          ) : (
            <div className="flex items-end gap-3" style={{ height: 140 }}>
              {bars.map((m) => {
                const total = m.cost + m.profit || 1
                return (
                  <div key={m.yearMonth} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)', fontSize: 9 }}>
                      {fmt2(m.revenue)}
                    </div>
                    <div
                      className="w-full rounded-t overflow-hidden flex flex-col justify-end"
                      style={{ height: `${Math.max((m.revenue / maxRevenue) * 100, 1.5)}%`, minHeight: 3 }}
                    >
                      <div style={{ height: `${(m.profit / total) * 100}%`, background: 'var(--primary)' }} title={`Profit ${fmt2(m.profit)}`} />
                      <div style={{ height: `${(m.cost / total) * 100}%`, background: 'var(--border)' }} title={`Cost ${fmt2(m.cost)}`} />
                    </div>
                    <div className="text-xs text-center" style={{ color: 'var(--muted-foreground)', fontSize: 9 }}>
                      {m.label.slice(0, 3)} {m.yearMonth.slice(2, 4)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Row 3 — who actually makes the money. */}
        <div className="grid grid-cols-2 gap-4">
          <RankMoneyPanel title="Top Buyers by Revenue" stats={scoped.buyers} metric="revenue" currency={scoped.currency} />
          <RankMoneyPanel title="Top Buyers by Profit" stats={buyersByProfit} metric="profit" currency={scoped.currency} />
        </div>

        {/* Row 4 — the safest thing that can be called a forecast. Each
            metric gets one row split into two panels, side by side: the
            trailing 12 months (with the projection appended) on the left,
            the same figure totalled by year on the right — the short-term
            read and the long-term one, next to each other. */}
        <div>
          <div className="text-xs tracking-widest uppercase mb-1" style={{ color: 'var(--muted-foreground)' }}>
            Projected Range &amp; Trend
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--muted-foreground)', opacity: 0.8 }}>
            {revenueForecast
              ? `Next month's low/high is read off the last ${revenueForecast.monthsUsed} months' actuals — a range, not a statistical forecast.`
              : 'Not enough history yet to project next month — at least 2 months of data are needed.'}
          </p>
          <div className="flex flex-col gap-4">
            <ForecastRow label="Tonnage" months={scoped.months} pick={(m) => m.tonnage} range={tonnageForecast} fmt={fmt2} unit=" MT" />
            <ForecastRow
              label="Revenue"
              months={scoped.months}
              pick={(m) => m.revenue}
              range={revenueForecast}
              fmt={fmt2}
              prefix={`${scoped.currency} `}
            />
            <ForecastRow
              label="Contracts"
              months={scoped.months}
              pick={(m) => m.count}
              range={contractsForecast}
              fmt={(n) => fmtInt(Math.round(n))}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="p-5 rounded flex flex-col gap-1" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)' }}>
        {label}
      </div>
      <div
        className="text-xl font-semibold leading-tight"
        style={{ fontFamily: 'var(--font-jetbrains)', color: accent ? 'var(--primary)' : 'var(--foreground)' }}
      >
        {value}
      </div>
    </div>
  )
}

function RankMoneyPanel({
  title,
  stats,
  metric,
  currency,
}: {
  title: string
  stats: NameStat[]
  metric: 'revenue' | 'profit'
  currency: string
}) {
  const top = stats.slice(0, 6)
  const max = Math.max(...top.map((s) => s[metric]), 1)
  return (
    <div className="p-5 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="text-xs tracking-widest uppercase mb-4" style={{ color: 'var(--muted-foreground)' }}>{title}</div>
      {top.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>No data</p>
      ) : (
        <div className="flex flex-col gap-3">
          {top.map((s) => (
            <div key={s.name}>
              <div className="flex justify-between mb-1 gap-2">
                <span className="text-xs truncate">{s.name}</span>
                <span className="text-xs shrink-0" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', fontSize: 10 }}>
                  {currency} {fmt2(s[metric])}
                </span>
              </div>
              <MiniBar pct={(s[metric] / max) * 100} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** One metric's row: the trailing-12-months view (with the projection
 * appended) on the left, the same figure totalled by calendar year on the
 * right — side by side, each taking half the row. */
function ForecastRow({
  label,
  months,
  pick,
  range,
  fmt,
  unit = '',
  prefix = '',
}: {
  label: string
  months: MonthStat[]
  pick: (m: MonthStat) => number
  range: ForecastRange | null
  fmt: (n: number) => string
  unit?: string
  prefix?: string
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <MonthlyLineCard label={label} months={months} pick={pick} range={range} fmt={fmt} unit={unit} prefix={prefix} />
      <YearlyLineCard label={label} months={months} pick={pick} fmt={fmt} unit={unit} prefix={prefix} />
    </div>
  )
}

function MonthlyLineCard({
  label,
  months,
  pick,
  range,
  fmt,
  unit,
  prefix,
}: {
  label: string
  months: MonthStat[]
  pick: (m: MonthStat) => number
  range: ForecastRange | null
  fmt: (n: number) => string
  unit: string
  prefix: string
}) {
  const trailing = months.slice(0, 12).reverse() // oldest -> newest
  const points: ChartPoint[] = trailing.map((m) => ({ label: m.label.slice(0, 3), value: pick(m) }))
  if (range) points.push({ label: 'Proj', value: range.expected })
  const last = points[points.length - 1]

  return (
    <div className="p-4 rounded" style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}>
      <div className="mb-2">
        <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>{label} · Last 12 Months</div>
        <div className="text-xs mt-0.5 whitespace-nowrap" style={{ fontFamily: 'var(--font-jetbrains)' }}>
          {range ? (
            <>
              <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{prefix}{fmt(range.expected)}{unit}</span>
              <span style={{ color: 'var(--muted-foreground)' }}> ({fmt(range.low)}{unit}–{fmt(range.high)}{unit})</span>
            </>
          ) : last ? (
            <span style={{ color: 'var(--muted-foreground)' }}>{prefix}{fmt(last.value)}{unit}</span>
          ) : null}
        </div>
      </div>
      <LineChartSvg points={points} range={range} fmt={fmt} unit={unit} prefix={prefix} showAllValueLabels={false} />
    </div>
  )
}

function YearlyLineCard({
  label,
  months,
  pick,
  fmt,
  unit,
  prefix,
}: {
  label: string
  months: MonthStat[]
  pick: (m: MonthStat) => number
  fmt: (n: number) => string
  unit: string
  prefix: string
}) {
  const byYear = new Map<string, number>()
  for (const m of months) {
    const year = m.yearMonth.slice(0, 4)
    byYear.set(year, (byYear.get(year) ?? 0) + pick(m))
  }
  const points: ChartPoint[] = [...byYear.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, value]) => ({ label: year, value }))
  const latest = points[points.length - 1]

  return (
    <div className="p-4 rounded" style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}>
      <div className="mb-2">
        <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>{label} · By Year</div>
        {latest && (
          <div className="text-xs mt-0.5 whitespace-nowrap" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)' }}>
            {latest.label}: <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{prefix}{fmt(latest.value)}{unit}</span>
          </div>
        )}
      </div>
      <LineChartSvg points={points} range={null} fmt={fmt} unit={unit} prefix={prefix} showAllValueLabels />
    </div>
  )
}

interface ChartPoint {
  label: string
  value: number
}

/** The shared line-graph renderer: a solid line through every point except
 * the last, which — when `range` is given — is drawn as a dashed lead-in to
 * an outlined "projected" dot with a low/high marker beside it. Without a
 * `range`, every point is just part of the plain trend line (the yearly
 * cards, and a monthly card too short on history to project from). */
function LineChartSvg({
  points,
  range,
  fmt,
  unit = '',
  prefix = '',
  showAllValueLabels,
}: {
  points: ChartPoint[]
  range: ForecastRange | null
  fmt: (n: number) => string
  unit?: string
  prefix?: string
  showAllValueLabels: boolean
}) {
  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height: 110 }}>
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>No data yet</p>
      </div>
    )
  }

  const W = 460
  const H = 130
  const padX = 18
  const padTop = 20
  const padBottom = 20
  const innerW = W - padX * 2
  const innerH = H - padTop - padBottom
  const n = points.length
  const maxVal = Math.max(...points.map((p) => p.value), range?.high ?? 0, 1)
  const xAt = (i: number) => padX + (n <= 1 ? innerW / 2 : (innerW / (n - 1)) * i)
  const yAt = (v: number) => padTop + innerH - (v / maxVal) * innerH

  const solidCount = range ? n - 1 : n
  const solidPath = points
    .slice(0, solidCount)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.value)}`)
    .join(' ')
  const dashPath =
    range && solidCount > 0 ? `M ${xAt(solidCount - 1)} ${yAt(points[solidCount - 1].value)} L ${xAt(n - 1)} ${yAt(points[n - 1].value)}` : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 120, display: 'block' }} preserveAspectRatio="none">
      <line x1={padX} y1={padTop + innerH} x2={W - padX} y2={padTop + innerH} stroke="var(--border)" strokeWidth={1} />

      {dashPath && <path d={dashPath} fill="none" stroke="var(--primary)" strokeWidth={2} strokeDasharray="5 4" strokeOpacity={0.7} />}
      {solidPath && <path d={solidPath} fill="none" stroke="var(--primary)" strokeWidth={2.5} />}

      {points.map((p, i) => {
        const projected = !!range && i === n - 1
        const lastActual = i === solidCount - 1
        const showValue = showAllValueLabels || projected || lastActual || i === 0
        // The end points sit right at the chart's edge — a centered label
        // there would run off the canvas, so the first and last points
        // anchor outward from their dot instead of straddling it.
        const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
        return (
          <g key={i}>
            <title>{`${p.label}: ${prefix}${fmt(p.value)}${unit}`}</title>
            <circle
              cx={xAt(i)}
              cy={yAt(p.value)}
              r={projected ? 4.5 : 3.5}
              fill={projected ? 'var(--secondary)' : 'var(--primary)'}
              stroke="var(--primary)"
              strokeWidth={projected ? 2 : 0}
            />
            {showValue && (
              <text x={xAt(i)} y={yAt(p.value) - 8} textAnchor={anchor} fontSize="9" fill="var(--muted-foreground)">
                {fmt(p.value)}
              </text>
            )}
            <text x={xAt(i)} y={H - 5} textAnchor={anchor} fontSize="9" fill="var(--muted-foreground)">
              {p.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
