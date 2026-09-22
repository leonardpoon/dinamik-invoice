// "Current" — this month's notes in a rail, the selected one previewed.
//
// The month is pickable rather than pinned to today's, because the office
// routinely finishes last month's paperwork in the first week of the next one.

import { useEffect, useMemo, useState } from 'react'

import { api, errorMessage, savePdf } from '../api'
import type { Store } from '../store'
import type { DebitNoteSummary } from '../types'
import {
  Icon,
  Panel,
  PanelHeader,
  PrimaryButton,
  currentYearMonth,
  fmt2,
  fromMonthInput,
  monthLabel,
  toMonthInput,
} from '../ui'
import NotePreview from './NotePreview'

interface Props {
  store: Store
  onEdit: (id: number) => void
  onNew: () => void
  onDelete: (note: DebitNoteSummary) => void
  notify: (message: string, kind: 'error' | 'ok') => void
}

export default function Current({ store, onEdit, onNew, onDelete, notify }: Props) {
  const [yearMonth, setYearMonth] = useState(currentYearMonth)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [reporting, setReporting] = useState(false)

  const notes = useMemo(
    () => store.notes.filter((n) => n.yearMonth === yearMonth),
    [store.notes, yearMonth],
  )

  // Keep a valid selection as the month or the register changes.
  useEffect(() => {
    if (notes.length === 0) {
      setSelectedId(null)
    } else if (!notes.some((n) => n.id === selectedId)) {
      setSelectedId(notes[0].id)
    }
  }, [notes, selectedId])

  const selected = notes.find((n) => n.id === selectedId) ?? null
  const filed = notes.filter((n) => n.status === 'filed').length
  const total = notes.reduce((s, n) => s + n.totalAmount, 0)

  async function handleReport() {
    setReporting(true)
    try {
      const b64 = await api.filingReportPdf(yearMonth)
      const saved = await savePdf(b64, `filing-register-${yearMonth}.pdf`)
      if (saved) notify(`Filing register for ${monthLabel(yearMonth)} saved`, 'ok')
    } catch (e) {
      notify(errorMessage(e), 'error')
    } finally {
      setReporting(false)
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <Panel width={300}>
        <PanelHeader
          eyebrow="Current Period"
          title={monthLabel(yearMonth)}
          sub={`${notes.length} debit note${notes.length === 1 ? '' : 's'} · ${filed} filed`}
        >
          <input
            type="month"
            value={toMonthInput(yearMonth)}
            onChange={(e) => setYearMonth(fromMonthInput(e.target.value) || currentYearMonth())}
            style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 12 }}
          />
        </PanelHeader>

        <div className="flex-1 overflow-auto">
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
              <Icon name="file" size={32} strokeWidth={1} style={{ color: 'var(--border)' }} />
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                No debit notes in {monthLabel(yearMonth)}
              </p>
              <PrimaryButton onClick={onNew} className="!text-xs !px-3 !py-1.5">
                Create Debit Note
              </PrimaryButton>
            </div>
          ) : (
            notes.map((n) => (
              <NoteRow
                key={n.id}
                note={n}
                selected={n.id === selectedId}
                onSelect={() => setSelectedId(n.id)}
                onToggleFiled={() => void store.setFiled(n.id, n.status !== 'filed')}
              />
            ))
          )}
        </div>

        {notes.length > 0 && (
          <div className="px-4 py-3 flex flex-col gap-2 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted-foreground)' }}>
              <span>Month total</span>
              <span style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--foreground)' }}>
                {notes[0].currency} {fmt2(total)}
              </span>
            </div>
            <PrimaryButton
              onClick={handleReport}
              disabled={reporting}
              className="w-full flex items-center justify-center gap-2 !py-2 !text-xs"
            >
              <Icon name="fileText" size={12} strokeWidth={2.5} />
              {reporting ? 'Generating…' : 'Generate Filing Report'}
            </PrimaryButton>
          </div>
        )}
      </Panel>

      <NotePreview
        note={selected}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleFiled={(n) => void store.setFiled(n.id, n.status !== 'filed')}
        notify={notify}
      />
    </div>
  )
}

export function NoteRow({
  note,
  selected,
  onSelect,
  onToggleFiled,
  indent = 0,
}: {
  note: DebitNoteSummary
  selected: boolean
  onSelect: () => void
  onToggleFiled?: () => void
  indent?: number
}) {
  return (
    <div
      onClick={onSelect}
      className="w-full text-left py-3 flex flex-col gap-1 transition-colors cursor-pointer"
      style={{
        paddingLeft: 16 + indent,
        paddingRight: 12,
        background: selected ? 'color-mix(in srgb, var(--primary) 10%, var(--card))' : 'transparent',
        borderBottom: '1px solid var(--border)',
        borderLeft: `3px solid ${selected ? 'var(--primary)' : 'transparent'}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span
            className="text-xs font-semibold truncate"
            style={{ fontFamily: 'var(--font-jetbrains)', color: selected ? 'var(--primary)' : 'var(--foreground)', fontSize: 11 }}
          >
            {note.dnNumber}
          </span>
          {note.customerInvoiceRef && (
            <span className="text-xs truncate" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)', fontSize: 10 }}>
              {note.customerInvoiceRef}
            </span>
          )}
        </div>

        {onToggleFiled && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleFiled()
            }}
            className="w-5 h-5 rounded flex items-center justify-center shrink-0"
            style={{
              color: note.status === 'filed' ? '#4caf7a' : 'var(--muted-foreground)',
              background: note.status === 'filed' ? 'rgba(76,175,122,0.12)' : 'transparent',
            }}
            title={note.status === 'filed' ? 'Filed — click to unfile' : 'Mark as filed'}
          >
            <Icon name={note.status === 'filed' ? 'check' : 'archive'} size={11} strokeWidth={2.5} />
          </button>
        )}
      </div>

      <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{note.buyerName || '—'}</p>
      <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{note.destination || '—'}</p>
      <p className="text-xs" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--foreground)', fontSize: 10, marginTop: 2 }}>
        {note.currency} {fmt2(note.totalAmount)}
        <span style={{ color: 'var(--muted-foreground)' }}> · {fmt2(note.tonnage)} MT</span>
      </p>
    </div>
  )
}
