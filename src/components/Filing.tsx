// "Filing" — pick a month, preview and print the register for it.
//
// The printed page carries a blank box per note; filing itself happens on
// paper, with a pen, as the notes physically go into the folder. So this tab
// has nothing to click per note — it is just a period picker in front of the
// PDF the office prints and works from.

import { useMemo, useState } from 'react'

import { api, pdfUrl } from '../api'
import type { Store } from '../store'
import { MONTH_NAMES, Panel, PanelHeader, Spinner, currentYearMonth, monthLabel, usePdfPreview } from '../ui'
import { DownloadBar } from './NotePreview'

interface Props {
  store: Store
  notify: (message: string, kind: 'error' | 'ok') => void
}

export default function Filing({ store, notify }: Props) {
  const [yearMonth, setYearMonth] = useState(currentYearMonth)

  const notes = useMemo(
    () => store.notes.filter((n) => n.yearMonth === yearMonth),
    [store.notes, yearMonth],
  )

  const years = useMemo(() => {
    const s = new Set(store.notes.map((n) => n.yearMonth.slice(0, 4)))
    s.add(yearMonth.slice(0, 4))
    return [...s].sort().reverse()
  }, [store.notes, yearMonth])

  const year = parseInt(yearMonth.slice(0, 4), 10)
  const month = parseInt(yearMonth.slice(4), 10)

  const preview = usePdfPreview(() => api.filingReportPdf(yearMonth).then(pdfUrl), [yearMonth])

  function setMonthPart(m: number) {
    setYearMonth(`${year}${String(m).padStart(2, '0')}`)
  }

  function setYearPart(y: number) {
    setYearMonth(`${y}${String(month).padStart(2, '0')}`)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <Panel width={260}>
        <PanelHeader eyebrow="Monthly Register" title="Filing Records" />

        <div className="flex flex-col gap-4 px-4 py-4 shrink-0">
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
              {notes.length}
            </div>
            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              debit note{notes.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      </Panel>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ background: '#111' }}>
        <div className="flex items-center justify-between px-5 py-2.5 shrink-0" style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)', fontSize: 11 }}>
              Filing Records — {monthLabel(yearMonth)}
            </span>
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {notes.length} debit note{notes.length === 1 ? '' : 's'}
            </span>
          </div>
          <DownloadBar
            label="Download PDF"
            filename={`filing-records-${yearMonth}.pdf`}
            load={() => api.filingReportPdf(yearMonth)}
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
