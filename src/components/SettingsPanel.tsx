// The Sample UI's collapsible settings rail, widened to carry everything the
// PDFs read from: the letterhead and bank lines, the form defaults, the bill-to
// customers, and the cost rate card the accountant copy is priced from.
//
// It stays a sidebar rather than becoming a tab so the rate card can be nudged
// while a note is open in the form beside it.

import { useEffect, useRef, useState } from 'react'

import { errorMessage } from '../api'
import type { Store } from '../store'
import type { Customer, RateDefault, Settings, ShipmentType } from '../types'
import { BASIS_LABEL, CATEGORY_LABEL, COST_CATEGORIES, emptyCustomer } from '../types'
import type { CostBasis, CostCategory } from '../types'
import { Icon, fmt2 } from '../ui'

type Tab = 'defaults' | 'customers' | 'rates'

const TABS: { id: Tab; label: string }[] = [
  { id: 'defaults', label: 'Defaults' },
  { id: 'rates', label: 'Rates' },
  { id: 'customers', label: 'Parties' },
]

interface Props {
  store: Store
  notify: (message: string, kind: 'error' | 'ok') => void
}

export default function SettingsPanel({ store, notify }: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('defaults')
  const panelRef = useRef<HTMLDivElement>(null)

  // A click anywhere outside the open panel closes it, the way a dropdown
  // would — the explicit close button stays for keyboard/touch use. A click
  // inside the PDF preview (an <iframe>, on every tab but Parties/Rates) never
  // reaches this document's `mousedown` — iframes have their own document —
  // so the window `blur` that focus-into-the-iframe causes is the fallback.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onBlur() {
      if (document.activeElement?.tagName === 'IFRAME') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('blur', onBlur)
    }
  }, [open])

  if (!open) {
    return (
      <div className="flex flex-col shrink-0 overflow-hidden" style={{ width: 40, borderLeft: '1px solid var(--border)' }}>
        <button
          onClick={() => setOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-3 w-full transition-colors"
          style={{ color: '#f97316' }}
          title="Open settings"
        >
          <Icon name="settings" size={14} />
          <span
            className="text-xs font-semibold tracking-widest uppercase select-none"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.12em' }}
          >
            Settings
          </span>
        </button>
      </div>
    )
  }

  return (
    <div ref={panelRef} className="flex flex-col shrink-0 overflow-hidden" style={{ width: 360, borderLeft: '1px solid var(--border)', background: 'var(--card)' }}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="text-xs tracking-widest uppercase" style={{ color: 'var(--primary)', fontFamily: 'var(--font-jetbrains)', fontSize: 9 }}>
            Configuration
          </p>
          <h3 className="text-sm font-serif font-light mt-0.5">Settings</h3>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="w-6 h-6 rounded flex items-center justify-center"
          style={{ color: 'var(--muted-foreground)', background: 'var(--secondary)' }}
          aria-label="Close settings"
        >
          <Icon name="close" size={11} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 py-2 text-xs font-medium transition-colors"
            style={{
              color: tab === t.id ? 'var(--primary)' : 'var(--muted-foreground)',
              borderBottom: `2px solid ${tab === t.id ? 'var(--primary)' : 'transparent'}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'defaults' && <DefaultsTab store={store} notify={notify} />}
        {tab === 'rates' && <RatesTab store={store} notify={notify} />}
        {tab === 'customers' && <CustomersTab store={store} notify={notify} />}
      </div>
    </div>
  )
}

// --- shared bits, also used by the Cover Letter tab's company panel --------

export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span
        className="text-xs tracking-widest uppercase font-semibold shrink-0"
        style={{ color: 'var(--primary)', fontFamily: 'var(--font-jetbrains)' }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
    </div>
  )
}

export function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {sub && <div className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

export function SaveBar({ dirty, saved, onSave }: { dirty: boolean; saved: boolean; onSave: () => void }) {
  return (
    <div className="px-4 py-3 shrink-0 sticky bottom-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
      <button
        onClick={onSave}
        disabled={!dirty && !saved}
        className="w-full py-2 text-xs font-semibold rounded flex items-center justify-center gap-2 transition-all disabled:opacity-40"
        style={{
          background: saved ? '#1a3a2a' : 'var(--primary)',
          color: saved ? '#4caf7a' : 'var(--primary-foreground)',
          border: saved ? '1px solid #2a5a3a' : 'none',
        }}
      >
        {saved ? (
          <>
            <Icon name="check" size={11} strokeWidth={2.5} /> Saved
          </>
        ) : (
          'Save'
        )}
      </button>
    </div>
  )
}

/** Local draft of a store value, with dirty tracking and a save confirmation. */
export function useDraft<T>(
  source: T | null,
  save: (v: T) => Promise<void>,
  notify: (message: string, kind: 'error' | 'ok') => void,
) {
  const [draft, setDraft] = useState<T | null>(source)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)

  // Adopt upstream changes, but never over the top of unsaved edits.
  useEffect(() => {
    if (!dirty) setDraft(source)
  }, [source, dirty])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(t)
  }, [saved])

  return {
    draft,
    dirty,
    saved,
    update(next: T) {
      setDraft(next)
      setDirty(true)
      setSaved(false)
    },
    async commit() {
      if (!draft) return
      try {
        await save(draft)
        setDirty(false)
        setSaved(true)
      } catch (e) {
        notify(errorMessage(e), 'error')
      }
    },
  }
}

// --- tabs -------------------------------------------------------------------

function DefaultsTab({ store, notify }: Props) {
  const d = useDraft<Settings>(store.settings, store.saveSettings, notify)
  if (!d.draft) return null
  const s = d.draft
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => d.update({ ...s, [k]: v })

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 px-4 py-5 flex flex-col gap-5">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
          Pre-fills every new debit note. Override per note as needed.
        </p>

        <Divider label="Cargo" />

        <Row label="Units / Container" sub="units ÷ this = containers">
          <input
            type="number"
            min={1}
            step={1}
            value={s.defaultBoxesPerContainer}
            onChange={(e) => set('defaultBoxesPerContainer', Math.round(parseFloat(e.target.value)) || 0)}
            style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 12 }}
          />
        </Row>

        <Row label="M/Tons / Container" sub="containers × this = tonnage">
          <input
            type="number"
            min={0.0001}
            step={0.0001}
            value={s.defaultMtPerContainer}
            onChange={(e) => set('defaultMtPerContainer', parseFloat(e.target.value) || 0)}
            style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 12 }}
          />
        </Row>

        <Row label="Packing Description">
          <input value={s.defaultPackingDesc} onChange={(e) => set('defaultPackingDesc', e.target.value)} />
        </Row>

        <Row label="Product Description">
          <input value={s.defaultProductDesc} onChange={(e) => set('defaultProductDesc', e.target.value)} />
        </Row>

        <Divider label="Charge" />

        <Row label="Charge Description">
          <input value={s.defaultChargeDesc} onChange={(e) => set('defaultChargeDesc', e.target.value)} />
        </Row>

        <Row label="Default Currency">
          <select value={s.defaultCurrency} onChange={(e) => set('defaultCurrency', e.target.value)}>
            {['SGD', 'USD', 'MYR', 'EUR', 'GBP', 'JPY', 'CNY'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Row>

        <Row label="Rate / M/Ton">
          <div className="flex items-center" style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <span
              className="px-2 py-2 text-xs font-semibold shrink-0"
              style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', background: 'var(--secondary)', borderRight: '1px solid var(--border)' }}
            >
              {s.defaultCurrency}
            </span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={s.defaultRatePerMt}
              onChange={(e) => set('defaultRatePerMt', parseFloat(e.target.value) || 0)}
              style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 12, border: 'none', borderRadius: 0, background: 'transparent', flex: 1, minWidth: 0 }}
            />
            <span className="px-2 text-xs shrink-0" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)' }}>/MT</span>
          </div>
        </Row>
      </div>
      <SaveBar dirty={d.dirty} saved={d.saved} onSave={() => void d.commit()} />
    </div>
  )
}

function RatesTab({ store, notify }: Props) {
  const [shipmentType, setShipmentType] = useState<ShipmentType>('CONTAINER')
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4">
        <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {(['CONTAINER', 'BREAKBULK'] as ShipmentType[]).map((t) => (
            <button
              key={t}
              onClick={() => setShipmentType(t)}
              className="flex-1 py-2 text-xs font-semibold uppercase tracking-widest"
              style={{
                background: shipmentType === t ? 'color-mix(in srgb, var(--primary) 14%, var(--secondary))' : 'var(--secondary)',
                color: shipmentType === t ? 'var(--primary)' : 'var(--muted-foreground)',
              }}
            >
              {t === 'CONTAINER' ? 'Container' : 'Breakbulk'}
            </button>
          ))}
        </div>
        <p className="text-xs leading-relaxed mt-2" style={{ color: 'var(--muted-foreground)' }}>
          Same customer-facing charge either way — this card only feeds the accountant copy's cost
          block, so container and breakbulk shipments keep entirely separate cost lines.
        </p>
      </div>
      {/* Remounted per tab so an unsaved edit in one card never bleeds into the other. */}
      <RateCardEditor key={shipmentType} shipmentType={shipmentType} store={store} notify={notify} />
    </div>
  )
}

function RateCardEditor({ shipmentType, store, notify }: Props & { shipmentType: ShipmentType }) {
  const save = (lines: RateDefault[]) => store.saveRateCard(shipmentType, lines)
  const d = useDraft<RateDefault[]>(store.rateCards[shipmentType], save, notify)
  if (!d.draft) return null
  const lines = d.draft

  const setLine = (i: number, patch: Partial<RateDefault>) =>
    d.update(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  const addLine = (category: CostCategory) =>
    d.update([
      ...lines,
      {
        id: 0,
        shipmentType,
        category,
        code: '',
        label: '',
        basis: 'PER_CONTAINER',
        rate: 0,
        sortOrder: (lines.filter((l) => l.category === category).length + 1) * 10,
        active: true,
      },
    ])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 px-4 py-5 flex flex-col gap-5">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
          Copied onto each new {shipmentType === 'CONTAINER' ? 'container' : 'breakbulk'} debit
          note, where it can still be overridden. Changing a rate here does not touch notes already
          created.
        </p>

        {COST_CATEGORIES.map((cat) => (
          <div key={cat} className="flex flex-col gap-2">
            <Divider label={CATEGORY_LABEL[cat]} />
            {lines.map((l, i) =>
              l.category !== cat ? null : (
                <div key={cat + i} className="flex items-center gap-1.5">
                  <input
                    value={l.code}
                    onChange={(e) => setLine(i, { code: e.target.value.toUpperCase(), label: e.target.value.toUpperCase() })}
                    placeholder="CODE"
                    style={{ width: 62, fontFamily: 'var(--font-jetbrains)', fontSize: 10, padding: '5px 6px' }}
                  />
                  <select
                    value={l.basis}
                    onChange={(e) => setLine(i, { basis: e.target.value as CostBasis })}
                    style={{ flex: 1, fontSize: 10, padding: '5px 6px' }}
                  >
                    {(Object.keys(BASIS_LABEL) as CostBasis[]).map((b) => (
                      <option key={b} value={b}>{BASIS_LABEL[b]}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    value={l.rate}
                    onChange={(e) => setLine(i, { rate: parseFloat(e.target.value) || 0 })}
                    style={{ width: 62, fontFamily: 'var(--font-jetbrains)', fontSize: 10, padding: '5px 6px', textAlign: 'right' }}
                  />
                  <button
                    onClick={() => setLine(i, { active: !l.active })}
                    className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                    style={{
                      color: l.active ? '#4caf7a' : 'var(--muted-foreground)',
                      background: 'var(--secondary)',
                      opacity: l.active ? 1 : 0.5,
                    }}
                    title={l.active ? 'On the card — click to disable' : 'Disabled — click to enable'}
                  >
                    <Icon name={l.active ? 'check' : 'close'} size={10} strokeWidth={3} />
                  </button>
                  <button
                    onClick={() => d.update(lines.filter((_, idx) => idx !== i))}
                    className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                    style={{ color: '#e05252', background: 'var(--secondary)' }}
                    title="Remove line"
                  >
                    <Icon name="trash" size={10} />
                  </button>
                </div>
              ),
            )}
            <button
              onClick={() => addLine(cat)}
              className="flex items-center gap-1.5 text-xs self-start px-2 py-1 rounded"
              style={{ color: 'var(--primary)' }}
            >
              <Icon name="plus" size={10} strokeWidth={2.5} /> Add line
            </button>
          </div>
        ))}
      </div>
      <SaveBar dirty={d.dirty} saved={d.saved} onSave={() => void d.commit()} />
    </div>
  )
}

function CustomersTab({ store, notify }: Props) {
  const [editing, setEditing] = useState<Customer | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!editing) return
    setBusy(true)
    try {
      await store.saveCustomer(editing)
      notify(`${editing.name} saved`, 'ok')
      setEditing(null)
    } catch (e) {
      notify(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    const set = <K extends keyof Customer>(k: K, v: Customer[K]) => setEditing({ ...editing, [k]: v })
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 px-4 py-5 flex flex-col gap-4">
          <Divider label={editing.id ? 'Edit party' : 'New party'} />
          <Row label="Name" sub="Printed at the top of the debit note">
            <input value={editing.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          </Row>
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <Row key={n} label={`Address line ${n}`}>
              <input
                value={editing[`addressLine${n}` as const]}
                onChange={(e) => set(`addressLine${n}` as const, e.target.value)}
              />
            </Row>
          ))}
          <Row label="Attention" sub="Used on the cover letter's Attn: line">
            <input value={editing.attention} onChange={(e) => set('attention', e.target.value)} />
          </Row>
        </div>
        <div className="px-4 py-3 shrink-0 flex gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setEditing(null)}
            className="flex-1 py-2 text-xs rounded"
            style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={busy || !editing.name.trim()}
            className="flex-1 py-2 text-xs font-semibold rounded disabled:opacity-40"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 px-4 py-5 flex flex-col gap-4">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
          The parties a debit note can be billed to. A party with notes against it is retired rather
          than deleted, so its history keeps its address.
        </p>
        <Divider label="Bill-to parties" />
        <div className="flex flex-col gap-1">
          {store.customers.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 px-2 py-2 rounded"
              style={{ background: 'var(--secondary)', opacity: c.active ? 1 : 0.55 }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{c.name}</div>
                <div className="text-xs truncate" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
                  {c.attention || c.addressLine1 || '—'}
                  {c.active ? '' : ' · retired'}
                </div>
              </div>
              <button
                onClick={() => setEditing(c)}
                className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                style={{ color: 'var(--muted-foreground)' }}
                title="Edit"
              >
                <Icon name="edit" size={11} />
              </button>
              {c.active && (
                <button
                  onClick={() => void store.deleteCustomer(c.id)}
                  className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                  style={{ color: '#e05252' }}
                  title="Remove or retire"
                >
                  <Icon name="trash" size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => setEditing(emptyCustomer())}
          className="flex items-center gap-1.5 text-xs self-start px-2 py-1 rounded"
          style={{ color: 'var(--primary)' }}
        >
          <Icon name="plus" size={10} strokeWidth={2.5} /> Add party
        </button>

        <Divider label="Saved presets" />
        {store.presets.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Presets are saved automatically when a debit note is created.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {store.presets.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-2 py-2 rounded" style={{ background: 'var(--secondary)' }}>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{p.buyerName}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)', fontSize: 9 }}>
                    {p.destination || '—'} · {p.currency} {fmt2(p.ratePerMt)}/MT
                  </div>
                </div>
                <button
                  onClick={() => void store.deletePreset(p.id)}
                  className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                  style={{ color: '#e05252' }}
                  title="Remove preset"
                >
                  <Icon name="trash" size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
