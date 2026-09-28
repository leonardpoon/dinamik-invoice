// "Cover Letter" — the workbook's second sheet, built from the register.
//
// Compose: pick a customer, then check off exactly the debit notes this
// letter encloses from the pool the office hasn't already sent one for. Once
// a letter is generated its notes drop out of that pool for good — the fix
// for the spreadsheet letting the same note go out on two letters by
// accident. History: every letter ever generated, grouped and searchable the
// same way the debit note History tab is, each one re-downloadable exactly
// as it was sent.
//
// The customer and the addressee's name stay "sticky" — saved to Settings as
// they change, so Compose reopens with the same two values next time, restart
// or no restart. Everything the letterhead prints (company details, payment
// lines, the signatory, the opening sentence) lives here too, since it has
// nowhere else to be edited now that Settings no longer carries it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api, errorMessage, pdfUrl, savePdf } from '../api'
import type { Store } from '../store'
import type { CoverLetterSummary, DebitNoteSummary, Settings } from '../types'
import {
  Chevron,
  ConfirmDialog,
  Icon,
  MONTH_NAMES,
  Panel,
  PanelHeader,
  PrimaryButton,
  Spinner,
  monthLabel,
  todayIso,
  usePdfPreview,
} from '../ui'
import { DownloadBar } from './NotePreview'
import { Divider, Row, SaveBar, useDraft } from './SettingsPanel'

interface Props {
  store: Store
  notify: (message: string, kind: 'error' | 'ok') => void
}

type Mode = 'compose' | 'history'

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 p-1 rounded" style={{ background: 'var(--secondary)' }}>
      {(['compose', 'history'] as const).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className="py-1.5 text-xs font-semibold rounded transition-colors"
          style={{
            background: mode === m ? 'var(--card)' : 'transparent',
            color: mode === m ? 'var(--primary)' : 'var(--muted-foreground)',
          }}
        >
          {m === 'compose' ? 'Compose' : 'History'}
        </button>
      ))}
    </div>
  )
}

export default function CoverLetter({ store, notify }: Props) {
  const [mode, setMode] = useState<Mode>('compose')
  return mode === 'compose' ? (
    <Compose store={store} notify={notify} mode={mode} setMode={setMode} />
  ) : (
    <History notify={notify} mode={mode} setMode={setMode} />
  )
}

function Compose({ store, notify, mode, setMode }: Props & { mode: Mode; setMode: (m: Mode) => void }) {
  const [customerId, setCustomerId] = useState(0)
  const [attnName, setAttnName] = useState('')
  const [letterDate, setLetterDate] = useState(todayIso)
  const [companyOpen, setCompanyOpen] = useState(false)

  const [eligibleNotes, setEligibleNotes] = useState<DebitNoteSummary[]>([])
  const [eligibleLoading, setEligibleLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const lastCustomerRef = useRef(0)

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

  // Re-reads the pool whenever the customer changes or the register does (a
  // fresh note may have just been created for them). Switching to a new
  // customer starts every one of their notes checked, since enclosing
  // everything outstanding is the common case; staying on the same customer
  // only narrows the checked set down to what's still eligible, so a mid-edit
  // selection survives an unrelated register refresh.
  useEffect(() => {
    if (!customerId) {
      setEligibleNotes([])
      setSelectedIds(new Set())
      return
    }
    let cancelled = false
    setEligibleLoading(true)
    api
      .coverLetterEligibleNotes(customerId)
      .then((list) => {
        if (cancelled) return
        setEligibleNotes(list)
        const freshCustomer = lastCustomerRef.current !== customerId
        lastCustomerRef.current = customerId
        setSelectedIds((prev) => {
          if (freshCustomer) return new Set(list.map((n) => n.id))
          const ids = new Set(list.map((n) => n.id))
          return new Set([...prev].filter((id) => ids.has(id)))
        })
      })
      .catch((e) => notify(errorMessage(e), 'error'))
      .finally(() => {
        if (!cancelled) setEligibleLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, store.notes])

  const selectedKey = useMemo(() => [...selectedIds].sort((a, b) => a - b).join(','), [selectedIds])

  const canRender = customerId > 0
  const preview = usePdfPreview(
    canRender
      ? () => api.coverLetterPreviewPdf(customerId, [...selectedIds], attnName, letterDate).then(pdfUrl)
      : null,
    [customerId, selectedKey, attnName, letterDate],
  )

  function selectCustomer(id: number) {
    setCustomerId(id)
    void store.saveSettings({ ...store.settings!, coverLetterCustomerId: id || null })
  }

  function commitAttnName() {
    if (!store.settings) return
    void store.saveSettings({ ...store.settings, coverLetterAttnName: attnName })
  }

  function toggleNote(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleGenerate() {
    if (!customer || selectedIds.size === 0) return
    setSaving(true)
    try {
      const ids = [...selectedIds]
      const b64 = await api.saveCoverLetter(customerId, ids, attnName, letterDate)
      const slug = customer.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()
      const saved = await savePdf(b64, `cover-letter-${slug}-${letterDate}.pdf`)
      notify(
        `Cover letter generated — ${ids.length} debit note${ids.length === 1 ? '' : 's'} enclosed` +
          (saved ? '' : ' (not saved to disk — it can still be downloaded from History)'),
        'ok',
      )
      setSelectedIds(new Set())
      setEligibleNotes(await api.coverLetterEligibleNotes(customerId))
    } catch (e) {
      notify(errorMessage(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const groups = useMemo(() => {
    const out: { yearMonth: string; notes: DebitNoteSummary[] }[] = []
    for (const n of eligibleNotes) {
      const last = out[out.length - 1]
      if (last && last.yearMonth === n.yearMonth) last.notes.push(n)
      else out.push({ yearMonth: n.yearMonth, notes: [n] })
    }
    return out
  }, [eligibleNotes])

  return (
    <div className="flex flex-1 overflow-hidden">
      <Panel width={300}>
        <PanelHeader eyebrow="Enclosure" title="Cover Letter" sub="Numbers come from the register">
          <ModeToggle mode={mode} setMode={setMode} />
        </PanelHeader>

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
              {selectedIds.size} <span style={{ color: 'var(--muted-foreground)', fontSize: 12, fontWeight: 400 }}>/ {eligibleNotes.length}</span>
            </div>
            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              debit note{selectedIds.size === 1 ? '' : 's'} enclosed
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-xs tracking-widest uppercase font-medium" style={{ color: 'var(--muted-foreground)' }}>
            Available
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedIds(new Set(eligibleNotes.map((n) => n.id)))}
              disabled={eligibleNotes.length === 0}
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
          {eligibleLoading ? (
            <div className="flex items-center justify-center h-full">
              <Spinner label="Reading the register…" />
            </div>
          ) : !customerId ? (
            <div className="flex items-center justify-center h-full px-6 text-center">
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Select a customer</p>
            </div>
          ) : eligibleNotes.length === 0 ? (
            <div className="flex items-center justify-center h-full px-6 text-center">
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                Every debit note for this customer is already on a letter
              </p>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.yearMonth}>
                <div
                  className="px-4 py-1.5 text-xs font-semibold"
                  style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)', fontSize: 10 }}
                >
                  {monthLabel(g.yearMonth)}
                </div>
                {g.notes.map((n) => {
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
                })}
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <PrimaryButton
            onClick={() => void handleGenerate()}
            disabled={saving || selectedIds.size === 0}
            className="w-full flex items-center justify-center gap-2 !py-2 !text-xs"
          >
            <Icon name="mail" size={12} strokeWidth={2.5} />
            {saving ? 'Generating…' : 'Generate Cover Letter'}
          </PrimaryButton>
        </div>

        <div className="flex-1 overflow-auto" style={{ flex: '0 0 auto', maxHeight: 220, borderTop: '1px solid var(--border)' }}>
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
              {selectedIds.size} note{selectedIds.size === 1 ? '' : 's'} selected · draft preview
            </span>
          </div>
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

interface YearGroup {
  year: number
  months: { month: number; key: string; letters: CoverLetterSummary[] }[]
  count: number
}

function buildLetterGroups(letters: CoverLetterSummary[]): YearGroup[] {
  const years = new Map<number, Map<number, CoverLetterSummary[]>>()
  for (const l of letters) {
    const d = new Date(l.letterDate + 'T00:00:00')
    if (Number.isNaN(d.getTime())) continue
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const byMonth = years.get(year) ?? new Map<number, CoverLetterSummary[]>()
    byMonth.set(month, [...(byMonth.get(month) ?? []), l])
    years.set(year, byMonth)
  }
  return [...years.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, byMonth]) => {
      const months = [...byMonth.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([month, list]) => ({ month, key: `${year}-${month}`, letters: list }))
      return { year, months, count: months.reduce((s, m) => s + m.letters.length, 0) }
    })
}

function matchesLetter(l: CoverLetterSummary, q: string): boolean {
  const d = new Date(l.letterDate + 'T00:00:00')
  const monthName = Number.isNaN(d.getTime()) ? '' : MONTH_NAMES[d.getMonth()]
  return [l.customerName, l.attnName, l.dnNumbers.join(' '), monthName, String(d.getFullYear())]
    .some((v) => (v ?? '').toLowerCase().includes(q))
}

function History({ notify, mode, setMode }: { notify: Props['notify']; mode: Mode; setMode: (m: Mode) => void }) {
  const [letters, setLetters] = useState<CoverLetterSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [openYears, setOpenYears] = useState<number[]>([])
  const [openMonths, setOpenMonths] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState<CoverLetterSummary | null>(null)

  const reload = useCallback(() => {
    setLoading(true)
    api
      .listCoverLetters()
      .then(setLetters)
      .catch((e) => notify(errorMessage(e), 'error'))
      .finally(() => setLoading(false))
  }, [notify])

  useEffect(() => {
    reload()
  }, [reload])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => (q ? letters.filter((l) => matchesLetter(l, q)) : letters), [letters, q])
  const groups = useMemo(() => buildLetterGroups(filtered), [filtered])

  const shownYears = q ? groups.map((g) => g.year) : openYears
  const shownMonths = q ? groups.flatMap((g) => g.months.map((m) => m.key)) : openMonths

  const selected = letters.find((l) => l.id === selectedId) ?? null
  const preview = usePdfPreview(
    selected ? () => api.coverLetterPdfById(selected.id).then(pdfUrl) : null,
    [selected?.id],
  )

  async function doDelete() {
    if (!confirmDelete) return
    const letter = confirmDelete
    setConfirmDelete(null)
    try {
      await api.deleteCoverLetter(letter.id)
      if (selectedId === letter.id) setSelectedId(null)
      notify(`Cover letter for ${letter.customerName} deleted — its notes are available again`, 'ok')
      reload()
    } catch (e) {
      notify(errorMessage(e), 'error')
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <Panel width={300}>
        <PanelHeader
          eyebrow="Archive"
          title="Cover Letter History"
          sub={loading ? 'Loading…' : `${letters.length} letter${letters.length === 1 ? '' : 's'} · ${groups.length} year${groups.length === 1 ? '' : 's'}`}
        >
          <ModeToggle mode={mode} setMode={setMode} />
          <div className="flex items-center gap-2 px-2 rounded" style={{ border: '1px solid var(--border)', background: 'var(--secondary)' }}>
            <Icon name="search" size={11} style={{ color: 'var(--muted-foreground)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Customer, attn, DN number, month…"
              style={{ border: 'none', background: 'transparent', flex: 1, fontSize: 12, padding: '6px 0' }}
            />
            {query && (
              <button onClick={() => setQuery('')} style={{ color: 'var(--muted-foreground)', lineHeight: 1 }} aria-label="Clear search">
                <Icon name="close" size={10} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </PanelHeader>

        <div className="flex-1 overflow-auto">
          {groups.length === 0 ? (
            <div className="flex items-center justify-center h-full px-6 text-center">
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                {loading ? '' : q ? 'Nothing matches that search' : 'No cover letters generated yet'}
              </p>
            </div>
          ) : (
            groups.map((yg) => {
              const yearOpen = shownYears.includes(yg.year)
              return (
                <div key={yg.year}>
                  <button
                    onClick={() => setOpenYears((o) => (o.includes(yg.year) ? o.filter((y) => y !== yg.year) : [...o, yg.year]))}
                    className="w-full flex items-center justify-between px-4 py-3 transition-colors"
                    style={{
                      background: yearOpen ? 'color-mix(in srgb, var(--primary) 8%, var(--card))' : 'transparent',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Chevron open={yearOpen} />
                      <span className="font-semibold text-sm" style={{ fontFamily: 'var(--font-jetbrains)' }}>{yg.year}</span>
                    </div>
                    <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{yg.count} letters</div>
                  </button>

                  {yearOpen &&
                    yg.months.map((mg) => {
                      const monthOpen = shownMonths.includes(mg.key)
                      return (
                        <div key={mg.key}>
                          <div
                            onClick={() => setOpenMonths((o) => (o.includes(mg.key) ? o.filter((k) => k !== mg.key) : [...o, mg.key]))}
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
                              <span className="text-sm">{MONTH_NAMES[mg.month - 1]}</span>
                            </div>
                            <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{mg.letters.length}</div>
                          </div>

                          {monthOpen &&
                            mg.letters.map((l) => {
                              const isSelected = l.id === selectedId
                              return (
                                <button
                                  key={l.id}
                                  onClick={() => setSelectedId(l.id)}
                                  className="w-full text-left py-3 flex flex-col gap-1 transition-colors"
                                  style={{
                                    paddingLeft: 44,
                                    paddingRight: 12,
                                    background: isSelected ? 'color-mix(in srgb, var(--primary) 10%, var(--card))' : 'transparent',
                                    borderBottom: '1px solid var(--border)',
                                    borderLeft: `3px solid ${isSelected ? 'var(--primary)' : 'transparent'}`,
                                  }}
                                >
                                  <span className="text-xs font-semibold truncate" style={{ color: isSelected ? 'var(--primary)' : 'var(--foreground)' }}>
                                    {l.customerName}
                                  </span>
                                  <span className="text-xs truncate" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
                                    {l.attnName || '—'} · {l.dnNumbers.length} note{l.dnNumbers.length === 1 ? '' : 's'}
                                  </span>
                                </button>
                              )
                            })}
                        </div>
                      )
                    })}
                </div>
              )
            })
          )}
        </div>
      </Panel>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ background: '#111' }}>
        {selected ? (
          <>
            <div className="flex items-center justify-between px-5 py-2.5 shrink-0 gap-4" style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-semibold truncate" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)', fontSize: 11 }}>
                  {selected.customerName}
                </span>
                <span className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
                  {selected.dnNumbers.length} note{selected.dnNumbers.length === 1 ? '' : 's'} enclosed
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setConfirmDelete(selected)}
                  className="w-7 h-7 rounded flex items-center justify-center"
                  style={{ background: 'var(--secondary)', color: '#e05252' }}
                  title="Delete — frees its notes to be enclosed again"
                >
                  <Icon name="trash" size={12} />
                </button>
                <DownloadBar
                  label="Download PDF"
                  filename={`cover-letter-${selected.customerName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${selected.letterDate}.pdf`}
                  load={() => api.coverLetterPdfById(selected.id)}
                  notify={notify}
                />
              </div>
            </div>
            <div className="flex-1 relative overflow-hidden p-4">
              {preview.loading && (
                <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#111' }}>
                  <Spinner label="Rendering letter…" />
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
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--muted-foreground)' }}>
            <div className="flex flex-col items-center gap-3 opacity-25">
              <Icon name="mail" size={48} strokeWidth={0.8} />
              <p className="text-sm font-serif tracking-wide">Select a letter to preview it</p>
            </div>
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete this cover letter?`}
          body={`${confirmDelete.dnNumbers.length} debit note${confirmDelete.dnNumbers.length === 1 ? '' : 's'} for ${confirmDelete.customerName} become available to enclose again. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => void doDelete()}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
