// The two copies, side by side, exactly as the Sample UI framed them — except
// these are the real documents off the Rust renderer, so what is on screen is
// what prints. The right-hand pane is the accountant copy and is the only place
// the costing block and profit appear.

import { useState } from 'react'

import { api, errorMessage, pdfUrl, savePdf } from '../api'
import type { DebitNoteSummary } from '../types'
import { GhostButton, Icon, PrimaryButton, Spinner, fmt2, usePdfPreview } from '../ui'

interface Props {
  note: DebitNoteSummary | null
  onEdit: (id: number) => void
  onDelete: (note: DebitNoteSummary) => void
  onToggleFiled: (note: DebitNoteSummary) => void
  notify: (message: string, kind: 'error' | 'ok') => void
}

export default function NotePreview({ note, onEdit, onDelete, onToggleFiled, notify }: Props) {
  const [downloading, setDownloading] = useState(false)

  const customer = usePdfPreview(
    note ? () => api.notePdfCopy(note.id, 'customer').then(pdfUrl) : null,
    [note?.id, note?.status],
  )
  const accountant = usePdfPreview(
    note ? () => api.notePdfCopy(note.id, 'accountant').then(pdfUrl) : null,
    [note?.id, note?.status],
  )

  if (!note) {
    return (
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="flex flex-col items-center gap-3 opacity-20">
          <Icon name="fileText" size={52} strokeWidth={0.7} style={{ color: 'var(--foreground)' }} />
          <p className="text-sm font-serif tracking-wide">Select a debit note to preview</p>
        </div>
      </div>
    )
  }

  async function handleDownload() {
    if (!note) return
    setDownloading(true)
    try {
      const b64 = await api.notePdf(note.id)
      const saved = await savePdf(b64, `${note.dnNumber}.pdf`)
      if (saved) notify(`${note.dnNumber} saved — both copies in one file`, 'ok')
    } catch (e) {
      notify(errorMessage(e), 'error')
    } finally {
      setDownloading(false)
    }
  }

  const loading = customer.loading || accountant.loading
  const failed = customer.error ?? accountant.error

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ background: '#111' }}>
      <div className="flex items-center justify-between px-5 py-2.5 shrink-0 gap-4" style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold shrink-0" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)', fontSize: 13 }}>
            {note.dnNumber}
          </span>
          <span className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
            {note.buyerName} · {note.destination || '—'} · {note.currency} {fmt2(note.totalAmount)}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onToggleFiled(note)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
            style={{
              background: note.status === 'filed' ? '#1a3a2a' : 'var(--secondary)',
              color: note.status === 'filed' ? '#4caf7a' : 'var(--muted-foreground)',
              border: `1px solid ${note.status === 'filed' ? '#2a5a3a' : 'var(--border)'}`,
            }}
            title={note.status === 'filed' ? 'Mark as not yet filed' : 'Mark as filed'}
          >
            <Icon name={note.status === 'filed' ? 'check' : 'archive'} size={11} strokeWidth={2.5} />
            {note.status === 'filed' ? 'Filed' : 'Mark filed'}
          </button>

          <button onClick={() => onEdit(note.id)} className="w-7 h-7 rounded flex items-center justify-center" style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }} title="Edit">
            <Icon name="edit" size={12} />
          </button>

          <button onClick={() => onDelete(note)} className="w-7 h-7 rounded flex items-center justify-center" style={{ background: 'var(--secondary)', color: '#e05252' }} title="Delete">
            <Icon name="trash" size={12} />
          </button>

          <PrimaryButton onClick={handleDownload} disabled={downloading} className="flex items-center gap-2 !px-4 !py-1.5">
            <Icon name="download" size={13} strokeWidth={2.5} />
            {downloading ? 'Saving…' : 'Download PDF'}
          </PrimaryButton>
        </div>
      </div>

      <div className="grid shrink-0 px-4 pt-3 pb-1" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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

      <div className="flex-1 relative overflow-hidden px-4 pb-4 pt-2">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#111' }}>
            <Spinner label="Rendering copies…" />
          </div>
        )}

        {failed && !loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 px-8 text-center" style={{ background: '#111' }}>
            <p className="text-sm" style={{ color: '#e89090' }}>{failed}</p>
          </div>
        )}

        {customer.url && accountant.url && (
          <div className="grid h-full" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <iframe
              key={customer.url}
              src={customer.url}
              className="w-full h-full rounded border-0"
              style={{ outline: '2px solid #2a5a3a' }}
              title={`${note.dnNumber} — Customer Copy`}
            />
            <iframe
              key={accountant.url}
              src={accountant.url}
              className="w-full h-full rounded border-0"
              style={{ outline: '2px solid color-mix(in srgb, var(--primary) 40%, transparent)' }}
              title={`${note.dnNumber} — Accountant Copy`}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/** A compact "open in viewer" affordance shared by the report tabs. */
export function DownloadBar({
  label,
  filename,
  load,
  notify,
}: {
  label: string
  filename: string
  load: () => Promise<string>
  notify: (message: string, kind: 'error' | 'ok') => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <GhostButton
      onClick={async () => {
        setBusy(true)
        try {
          const saved = await savePdf(await load(), filename)
          if (saved) notify(`${filename} saved`, 'ok')
        } catch (e) {
          notify(errorMessage(e), 'error')
        } finally {
          setBusy(false)
        }
      }}
      disabled={busy}
      className="flex items-center gap-2 !px-4 !py-1.5 !text-xs"
    >
      <Icon name="download" size={12} />
      {busy ? 'Saving…' : label}
    </GhostButton>
  )
}
