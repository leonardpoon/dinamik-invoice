// "History" — the whole register, grouped year > month > note, with a search
// box that widens to any field the office is likely to remember: a vessel, a
// buyer, a B/L, a port, a month name.

import { useMemo, useState } from 'react'

import type { Store } from '../store'
import type { DebitNoteSummary } from '../types'
import { Chevron, Icon, MONTH_NAMES, Panel, PanelHeader, fmtCompact } from '../ui'
import { NoteRow } from './Current'
import NotePreview from './NotePreview'

interface Props {
  store: Store
  onEdit: (id: number) => void
  onDelete: (note: DebitNoteSummary) => void
  notify: (message: string, kind: 'error' | 'ok') => void
}

interface MonthGroup {
  month: number
  key: string
  notes: DebitNoteSummary[]
  total: number
}

interface YearGroup {
  year: number
  months: MonthGroup[]
  total: number
  count: number
}

function buildGroups(notes: DebitNoteSummary[]): YearGroup[] {
  const years = new Map<number, Map<number, DebitNoteSummary[]>>()
  for (const n of notes) {
    if (!/^\d{6}$/.test(n.yearMonth)) continue
    const year = parseInt(n.yearMonth.slice(0, 4), 10)
    const month = parseInt(n.yearMonth.slice(4), 10)
    const byMonth = years.get(year) ?? new Map<number, DebitNoteSummary[]>()
    byMonth.set(month, [...(byMonth.get(month) ?? []), n])
    years.set(year, byMonth)
  }

  return [...years.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, byMonth]) => {
      const months = [...byMonth.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([month, list]) => ({
          month,
          key: `${year}-${month}`,
          notes: list,
          total: list.reduce((s, n) => s + n.totalAmount, 0),
        }))
      return {
        year,
        months,
        total: months.reduce((s, m) => s + m.total, 0),
        count: months.reduce((s, m) => s + m.notes.length, 0),
      }
    })
}

function matches(n: DebitNoteSummary, q: string): boolean {
  const monthName = /^\d{6}$/.test(n.yearMonth)
    ? (MONTH_NAMES[parseInt(n.yearMonth.slice(4), 10) - 1] ?? '')
    : ''
  return [
    n.dnNumber,
    n.customerName,
    n.buyerName,
    n.customerInvoiceRef,
    n.siNumber,
    n.blNumber,
    n.feederVessel,
    n.oceanVessel,
    n.destination,
    n.productDesc,
    monthName,
    n.yearMonth.slice(0, 4),
  ].some((v) => (v ?? '').toLowerCase().includes(q))
}

export default function History({ store, onEdit, onDelete, notify }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [openYears, setOpenYears] = useState<number[]>([])
  const [openMonths, setOpenMonths] = useState<string[]>([])
  const [query, setQuery] = useState('')

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (q ? store.notes.filter((n) => matches(n, q)) : store.notes),
    [store.notes, q],
  )
  const groups = useMemo(() => buildGroups(filtered), [filtered])

  // A search should reveal its hits, not leave them behind collapsed headers.
  const shownYears = q ? groups.map((g) => g.year) : openYears
  const shownMonths = q ? groups.flatMap((g) => g.months.map((m) => m.key)) : openMonths

  const selected = store.notes.find((n) => n.id === selectedId) ?? null

  return (
    <div className="flex flex-1 overflow-hidden">
      <Panel width={300}>
        <PanelHeader
          eyebrow="Archive"
          title="Debit Note History"
          sub={`${store.notes.length} total · ${groups.length} year${groups.length === 1 ? '' : 's'}`}
        >
          <div className="flex items-center gap-2 px-2 rounded" style={{ border: '1px solid var(--border)', background: 'var(--secondary)' }}>
            <Icon name="search" size={11} style={{ color: 'var(--muted-foreground)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Vessel, buyer, B/L, port, month…"
              style={{ border: 'none', background: 'transparent', flex: 1, fontSize: 12, padding: '6px 0' }}
            />
            {query && (
              <button onClick={() => setQuery('')} style={{ color: 'var(--muted-foreground)', lineHeight: 1 }} aria-label="Clear search">
                <Icon name="close" size={10} strokeWidth={2.5} />
              </button>
            )}
          </div>
          {q && (
            <p className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)', fontSize: 10 }}>
              {filtered.length} result{filtered.length === 1 ? '' : 's'} for "{query}"
            </p>
          )}
        </PanelHeader>

        <div className="flex-1 overflow-auto">
          {groups.length === 0 ? (
            <div className="flex items-center justify-center h-full px-6 text-center">
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                {q ? 'Nothing matches that search' : 'No debit notes yet'}
              </p>
            </div>
          ) : (
            groups.map((yg) => {
              const yearOpen = shownYears.includes(yg.year)
              return (
                <div key={yg.year}>
                  <button
                    onClick={() =>
                      setOpenYears((o) => (o.includes(yg.year) ? o.filter((y) => y !== yg.year) : [...o, yg.year]))
                    }
                    className="w-full flex items-center justify-between px-4 py-3 transition-colors"
                    style={{
                      background: yearOpen ? 'color-mix(in srgb, var(--primary) 8%, var(--card))' : 'transparent',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Chevron open={yearOpen} />
                      <span className="font-semibold text-sm" style={{ fontFamily: 'var(--font-jetbrains)' }}>{yg.year}</span>
                      {yg.year === currentYear && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)', fontSize: 9 }}
                        >
                          Current
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', fontSize: 10 }}>
                        {fmtCompact(yg.total)}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontSize: 9 }}>{yg.count} notes</div>
                    </div>
                  </button>

                  {yearOpen &&
                    yg.months.map((mg) => {
                      const monthOpen = shownMonths.includes(mg.key)
                      const isCurrent = yg.year === currentYear && mg.month === currentMonth
                      return (
                        <div key={mg.key}>
                          <div
                            onClick={() =>
                              setOpenMonths((o) => (o.includes(mg.key) ? o.filter((k) => k !== mg.key) : [...o, mg.key]))
                            }
                            className="flex items-center justify-between py-2.5 cursor-pointer"
                            style={{
                              paddingLeft: 28,
                              paddingRight: 12,
                              background: monthOpen ? 'color-mix(in srgb, var(--primary) 6%, var(--card))' : 'var(--secondary)',
                              borderBottom: '1px solid var(--border)',
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <Chevron open={monthOpen} />
                              <span className="text-sm" style={{ color: isCurrent ? 'var(--primary)' : 'var(--foreground)' }}>
                                {MONTH_NAMES[mg.month - 1]}
                              </span>
                              {isCurrent && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#4caf7a' }} />}
                            </div>
                            <div className="text-right">
                              <div className="text-xs" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', fontSize: 10 }}>
                                {fmtCompact(mg.total)}
                              </div>
                              <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontSize: 9 }}>{mg.notes.length}</div>
                            </div>
                          </div>

                          {monthOpen &&
                            mg.notes.map((n) => (
                              <NoteRow
                                key={n.id}
                                note={n}
                                selected={n.id === selectedId}
                                onSelect={() => setSelectedId(n.id)}
                                indent={28}
                              />
                            ))}
                        </div>
                      )
                    })}
                </div>
              )
            })
          )}
        </div>
      </Panel>

      <NotePreview note={selected} onEdit={onEdit} onDelete={onDelete} notify={notify} />
    </div>
  )
}
