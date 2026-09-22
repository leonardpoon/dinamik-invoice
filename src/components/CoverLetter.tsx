// "Cover Letter" — the workbook's second sheet, built from the register.
//
// Pick a customer and a single settlement month; the enclosed debit note
// numbers are always read from the database, never typed, which is the bit
// the spreadsheet got wrong often enough to matter.
//
// The customer and the addressee's name are "sticky" — saved to Settings as
// they change, so the letter reopens with the same two values next time,
// restart or no restart. Everything the letterhead prints (company details,
// payment lines, the signatory, the opening sentence) lives here too, since
// it has nowhere else to be edited now that Settings no longer carries it.

import { useEffect, useMemo, useState } from 'react'

import { api, pdfUrl } from '../api'
import type { Store } from '../store'
import type { Settings } from '../types'
import { Chevron, Icon, MONTH_NAMES, Panel, PanelHeader, Spinner, currentYearMonth, monthLabel, todayIso, usePdfPreview } from '../ui'
import { DownloadBar } from './NotePreview'
import { Divider, Row, SaveBar, useDraft } from './SettingsPanel'

interface Props {
  store: Store
  notify: (message: string, kind: 'error' | 'ok') => void
}

export default function CoverLetter({ store, notify }: Props) {
  const [customerId, setCustomerId] = useState(0)
  const [attnName, setAttnName] = useState('')
  const [yearMonth, setYearMonth] = useState(currentYearMonth)
  const [letterDate, setLetterDate] = useState(todayIso)
  const [companyOpen, setCompanyOpen] = useState(false)

  // Pick up the sticky customer + addressee the moment Settings loads, but
  // never clobber what the user has already changed this session.
  useEffect(() => {
    if (!store.settings || customerId) return
    const savedId = store.settings.coverLetterCustomerId
    const fallback = store.customers.find((c) => c.name === store.notes[0]?.customerName) ?? store.customers.find((c) => c.active)
    const match = (savedId && store.customers.find((c) => c.id === savedId)) || fallback
    if (match) setCustomerId(match.id)
    setAttnName(store.settings.coverLetterAttnName || '')
  }, [store.settings, store.customers, store.notes, customerId])

  const customer = store.customers.find((c) => c.id === customerId) ?? null

  // Only months this customer actually has notes in are worth picking.
  const years = useMemo(() => {
    if (!customer) return []
    const s = new Set(
      store.notes.filter((n) => n.customerName === customer.name).map((n) => n.yearMonth.slice(0, 4)),
    )
    s.add(yearMonth.slice(0, 4))
    return [...s].sort().reverse()
  }, [store.notes, customer, yearMonth])

  const year = parseInt(yearMonth.slice(0, 4), 10)
  const month = parseInt(yearMonth.slice(4), 10)
  const enclosedCount = useMemo(
    () => store.notes.filter((n) => n.customerName === customer?.name && n.yearMonth === yearMonth).length,
    [store.notes, customer, yearMonth],
  )

  const canRender = customerId > 0
  const preview = usePdfPreview(
    canRender ? () => api.coverLetterPdf(customerId, yearMonth, attnName, letterDate).then(pdfUrl) : null,
    [customerId, yearMonth, attnName, letterDate],
  )

  function selectCustomer(id: number) {
    setCustomerId(id)
    void store.saveSettings({ ...store.settings!, coverLetterCustomerId: id || null })
  }

  function commitAttnName() {
    if (!store.settings) return
    void store.saveSettings({ ...store.settings, coverLetterAttnName: attnName })
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <Panel width={300}>
        <PanelHeader eyebrow="Enclosure" title="Cover Letter" sub="Numbers come from the register" />

        <div className="flex flex-col gap-5 px-4 py-5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs tracking-widest uppercase font-medium" style={{ color: 'var(--muted-foreground)' }}>
              Customer
            </label>
            <select value={customerId || ''} onChange={(e) => selectCustomer(parseInt(e.target.value, 10) || 0)}>
              <option value="">Select a customer…</option>
              {store.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.active ? '' : ' (retired)'}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs tracking-widest uppercase font-medium" style={{ color: 'var(--muted-foreground)' }}>
              Attn
            </label>
            <input
              value={attnName}
              onChange={(e) => setAttnName(e.target.value)}
              onBlur={commitAttnName}
              placeholder="Ms Chia Ching Lian"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs tracking-widest uppercase font-medium" style={{ color: 'var(--muted-foreground)' }}>Year</label>
              <select
                value={year}
                onChange={(e) => setYearMonth(`${e.target.value}${String(month).padStart(2, '0')}`)}
              >
                {(years.length ? years : [String(year)]).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs tracking-widest uppercase font-medium" style={{ color: 'var(--muted-foreground)' }}>Month</label>
              <select
                value={month}
                onChange={(e) => setYearMonth(`${year}${e.target.value.padStart(2, '0')}`)}
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>{name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs tracking-widest uppercase font-medium" style={{ color: 'var(--muted-foreground)' }}>
              Letter Date
            </label>
            <input
              type="date"
              value={letterDate}
              onChange={(e) => setLetterDate(e.target.value)}
              style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 12 }}
            />
          </div>

          <div className="rounded p-3" style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}>
            <div className="text-lg font-semibold leading-tight" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)' }}>
              {enclosedCount}
            </div>
            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              debit note{enclosedCount === 1 ? '' : 's'} enclosed
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <button
            onClick={() => setCompanyOpen((o) => !o)}
            className="w-full flex items-center gap-2 px-4 py-3 text-xs font-semibold tracking-widest uppercase"
            style={{ color: 'var(--primary)' }}
          >
            <Chevron open={companyOpen} />
            Company &amp; Letterhead
          </button>
          {companyOpen && <CompanyPanel store={store} notify={notify} />}
        </div>
      </Panel>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ background: '#111' }}>
        <div className="flex items-center justify-between px-5 py-2.5 shrink-0" style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-semibold truncate" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)', fontSize: 11 }}>
              {customer?.name ?? 'Cover Letter'}
            </span>
            <span className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
              {monthLabel(yearMonth)}
            </span>
          </div>
          {canRender && (
            <DownloadBar
              label="Download PDF"
              filename={`cover-letter-${yearMonth}.pdf`}
              load={() => api.coverLetterPdf(customerId, yearMonth, attnName, letterDate)}
              notify={notify}
            />
          )}
        </div>

        <div className="flex-1 relative overflow-hidden p-4">
          {!canRender && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--muted-foreground)' }}>
              <div className="flex flex-col items-center gap-3 opacity-25">
                <Icon name="mail" size={48} strokeWidth={0.8} />
                <p className="text-sm font-serif tracking-wide">Select a customer to preview the letter</p>
              </div>
            </div>
          )}
          {preview.loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#111' }}>
              <Spinner label="Composing letter…" />
            </div>
          )}
          {preview.url && (
            <iframe
              key={preview.url}
              src={preview.url}
              className="w-full h-full rounded border-0"
              style={{ outline: '2px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}
              title="Cover letter preview"
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** Everything the letterhead prints, formerly Settings → Company. */
function CompanyPanel({ store, notify }: Props) {
  const d = useDraft<Settings>(store.settings, store.saveSettings, notify)
  if (!d.draft) return null
  const s = d.draft
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => d.update({ ...s, [k]: v })

  return (
    <div className="flex flex-col">
      <div className="px-4 pb-5 flex flex-col gap-5">
        <Divider label="Letterhead" />
        <Row label="Company Name">
          <input value={s.companyName} onChange={(e) => set('companyName', e.target.value)} />
        </Row>
        <Row label="Address Line">
          <textarea rows={3} value={s.addressLine} onChange={(e) => set('addressLine', e.target.value)} />
        </Row>
        <Row label="Registration">
          <input value={s.registrationNo} onChange={(e) => set('registrationNo', e.target.value)} />
        </Row>
        <Row label="Email">
          <input value={s.email} onChange={(e) => set('email', e.target.value)} />
        </Row>

        <Divider label="Payment" />
        <Row label="Payment Line 1">
          <textarea rows={2} value={s.paymentLine1} onChange={(e) => set('paymentLine1', e.target.value)} />
        </Row>
        <Row label="Payment Line 2">
          <textarea rows={2} value={s.paymentLine2} onChange={(e) => set('paymentLine2', e.target.value)} />
        </Row>

        <Divider label="Signatory" />
        <Row label="Name">
          <input value={s.signatoryName} onChange={(e) => set('signatoryName', e.target.value)} />
        </Row>
        <Row label="Title">
          <input value={s.signatoryTitle} onChange={(e) => set('signatoryTitle', e.target.value)} />
        </Row>

        <Divider label="Opening Sentence" />
        <Row label="Cover Letter Intro">
          <textarea rows={3} value={s.coverLetterIntro} onChange={(e) => set('coverLetterIntro', e.target.value)} />
        </Row>
      </div>
      <SaveBar dirty={d.dirty} saved={d.saved} onSave={() => void d.commit()} />
    </div>
  )
}
