// "Filing" — pick a month, then pick which of its debit notes go on the
// filing record. Every note starts checked, in DN order, since enclosing the
// whole month is the common case; the checklist exists for the month the
// office deliberately wants to hold one back. Filing itself still happens on
// paper, with a pen, as the notes physically go into the folder — this tab
// is just the period-and-note picker in front of the PDF the office prints.

import { useEffect, useMemo, useState } from 'react'

import { api, pdfUrl } from '../api'
import type { DebitNoteSummary } from '../types'
import { Icon, MONTH_NAMES, Panel, PanelHeader, Spinner, currentYearMonth, monthLabel, usePdfPreview } from '../ui'
import { DownloadBar } from './NotePreview'

interface Props {
  store: { notes: DebitNoteSummary[] }
  notify: (message: string, kind: 'error' | 'ok') => void
}

export default function Filing({ store, notify }: Props) {
  const [yearMonth, setYearMonth] = useState(currentYearMonth)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // DN order (ascending) rather than the register's newest-first order — the
  // sequence the notes were actually issued in, and the order the printed
  // record lists them in.
  const notes = useMemo(
    () => store.notes.filter((n) => n.yearMonth === yearMonth).sort((a, b) => a.dnNumber.localeCompare(b.dnNumber)),
    [store.notes, yearMonth],
  )

  // Every note starts on the record — "auto-add incrementally" — whenever the
  // month changes or the month's own note count changes (a note created or
  // deleted while this tab is open). A mid-session uncheck is a one-off
  // exclusion for the record about to print, not a persisted state, so
  // there's nothing lost by resetting it alongside the note list.
  useEffect(() => {
    setSelectedIds(new Set(notes.map((n) => n.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearMonth, notes.length])

  const years = useMemo(() => {
    const s = new Set(store.notes.map((n) => n.yearMonth.slice(0, 4)))
    s.add(yearMonth.slice(0, 4))
    return [...s].sort().reverse()
  }, [store.notes, yearMonth])

  const year = parseInt(yearMonth.slice(0, 4), 10)
  const month = parseInt(yearMonth.slice(4), 10)

  const selectedIdList = useMemo(() => [...selectedIds].sort((a, b) => a - b), [selectedIds])
  const selectedKey = selectedIdList.join(',')
  const preview = usePdfPreview(
    () => api.filingReportPdf(yearMonth, selectedIdList).then(pdfUrl),
    [yearMonth, selectedKey],
  )

  function setMonthPart(m: number) {
    setYearMonth(`${year}${String(m).padStart(2, '0')}`)
  }

  function setYearPart(y: number) {
    setYearMonth(`${y}${String(month).padStart(2, '0')}`)
  }

  function toggleNote(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <Panel width={280}>
        <PanelHeader eyebrow="Monthly Register" title="Filing Records" />

        <div className="flex flex-col gap-4 px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs tracking-widest uppercase font-medium" style={{ color: 'var(--muted-foreground)' }}>Year</label>
              <select value={year} onChange={(e) => setYearPart(parseInt(e.target.value, 10))}>
                {(years.length ? years : [String(year)]).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs tracking-widest uppercase font-medium" style={{ color: 'var(--muted-foreground)' }}>Month</label>
              <select value={month} onChange={(e) => setMonthPart(parseInt(e.target.value, 10))}>
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>{name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded p-3" style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}>
            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{monthLabel(yearMonth)}</div>
            <div className="text-lg font-semibold leading-tight" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)' }}>
              {selectedIds.size} <span style={{ color: 'var(--muted-foreground)', fontSize: 12, fontWeight: 400 }}>/ {notes.length}</span>
            </div>
            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              debit note{selectedIds.size === 1 ? '' : 's'} on the record
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-xs tracking-widest uppercase font-medium" style={{ color: 'var(--muted-foreground)' }}>
            This Month
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedIds(new Set(notes.map((n) => n.id)))}
              disabled={notes.length === 0}
              className="text-xs disabled:opacity-40"
              style={{ color: 'var(--primary)' }}
            >
              All
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              disabled={selectedIds.size === 0}
              className="text-xs disabled:opacity-40"
              style={{ color: 'var(--muted-foreground)' }}
            >
              None
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {notes.length === 0 ? (
            <div className="flex items-center justify-center h-full px-6 text-center">
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                No debit notes in {monthLabel(yearMonth)}
              </p>
            </div>
          ) : (
            notes.map((n) => {
              const checked = selectedIds.has(n.id)
              return (
                <button
                  key={n.id}
                  onClick={() => toggleNote(n.id)}
                  className="w-full flex items-center justify-between gap-2 py-2.5 px-4 text-left transition-colors"
                  style={{
                    background: checked ? 'color-mix(in srgb, var(--primary) 8%, var(--card))' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                    borderLeft: `3px solid ${checked ? 'var(--primary)' : 'transparent'}`,
                  }}
                >
                  <span className="truncate flex items-baseline gap-1.5">
                    <span
                      style={{
                        fontFamily: 'var(--font-jetbrains)',
                        fontSize: 11,
                        fontWeight: 600,
                        color: checked ? 'var(--primary)' : 'var(--foreground)',
                      }}
                    >
                      {n.dnNumber}
                    </span>
                    <span className="truncate" style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                      - {n.buyerName || '—'}
                    </span>
                  </span>
                  {checked && <Icon name="check" size={12} strokeWidth={2.5} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
                </button>
              )
            })
          )}
        </div>
      </Panel>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ background: '#111' }}>
        <div className="flex items-center justify-between px-5 py-2.5 shrink-0" style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)', fontSize: 11 }}>
              Filing Records — {monthLabel(yearMonth)}
            </span>
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {selectedIds.size} debit note{selectedIds.size === 1 ? '' : 's'}
            </span>
          </div>
          <DownloadBar
            label="Download PDF"
            filename={`filing-records-${yearMonth}.pdf`}
            load={() => api.filingReportPdf(yearMonth, selectedIdList)}
            notify={notify}
          />
        </div>

        <div className="flex-1 relative overflow-hidden p-4">
          {preview.loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#111' }}>
              <Spinner label="Generating record…" />
            </div>
          )}
          {preview.url && (
            <iframe
              key={preview.url}
              src={preview.url}
              className="w-full h-full rounded border-0"
              style={{ outline: '2px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}
              title="Filing records preview"
            />
          )}
        </div>
      </div>
    </div>
  )
}

