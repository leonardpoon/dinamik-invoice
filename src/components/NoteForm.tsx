// The Sample UI's "New Invoice" screen — preset rail on the left, sectioned
// form on the right — over the workbook's cargo model.
//
// Where the Sample UI asked for metric tonnes and a conversion factor, the
// form asks for what the spreadsheet actually starts from: boxes, boxes per
// container and M/Tons per container. Containers and tonnage are then derived
// by Rust and shown in the same read-out box the Sample UI used, so the screen
// reads the same while the arithmetic is the workbook's.

import { useEffect, useMemo, useState } from 'react'

import { api, errorMessage } from '../api'
import type { Store } from '../store'
import type { CostLine, DebitNote, DebitNoteInput, Preset, Preview, ShipmentType } from '../types'
import { CATEGORY_LABEL, COST_CATEGORIES } from '../types'
import {
  Chevron,
  Derived,
  Field,
  Icon,
  MonoInput,
  PageHeader,
  Panel,
  PanelHeader,
  PrimaryButton,
  GhostButton,
  Section,
  currentYearMonth,
  fmt2,
  fmt4,
  fromMonthInput,
  toMonthInput,
  todayIso,
  useDebounced,
} from '../ui'

// Amber: copied from a preset, worth a second look before submitting.
const FROM_PRESET: React.CSSProperties = {
  boxShadow: '0 0 0 2px rgba(251,191,36,0.55)',
  borderColor: 'rgba(251,191,36,0.7)',
}

// Red: blank and required after a preset was applied.
const NEEDS_FILLING: React.CSSProperties = {
  boxShadow: '0 0 0 2px rgba(224,82,82,0.45)',
  borderColor: 'rgba(224,82,82,0.65)',
}

/** Fields a preset fills in and the user should review — a buyer+destination
 * lane usually repeats these month to month, but each is still exactly the
 * kind of thing that quietly changes (box count drifting from 16 to 15, a
 * voyage number rolling over), so none of them are copied silently. */
const PRESET_FIELDS = ['buyerName', 'destination', 'boxes', 'oceanVessel', 'oceanVoyage'] as const

/** Fields that are always blank on a new note, however good the preset is —
 * and, per the fix log, the ones that should be flagged red after a preset
 * is applied, since a copied value here is very unlikely to still be right.
 * The feeder vessel/voyage/arrival date and B/L number are handled instead by
 * the feeder-match lookup below, which fires off what's typed, not the preset. */
const ALWAYS_BLANK = [
  'feederVessel',
  'feederArrivalDate',
  'blNumber',
  'blDate',
  'customerInvoiceRef',
  'siNumber',
  'contractNo',
  'pNumber',
] as const

type Errors = Partial<Record<keyof DebitNoteInput | 'dnSeq', string>>

function emptyInput(): DebitNoteInput {
  return {
    dnNumber: '',
    yearMonth: currentYearMonth(),
    dnDate: todayIso(),
    customerId: 0,
    buyerName: '',
    customerInvoiceRef: '',
    siNumber: '',
    contractNo: '',
    boxes: 0,
    packingDesc: '',
    boxesPerContainer: 16,
    mtPerContainer: 20.16,
    productDesc: '',
    shipmentType: 'CONTAINER',
    feederVessel: '',
    feederVoyage: '',
    feederArrivalDate: '',
    blNumber: '',
    pNumber: '',
    pDescriptor: '',
    oceanVessel: '',
    oceanVoyage: '',
    destination: '',
    blDate: '',
    chargeDesc: '',
    currency: 'SGD',
    ratePerMt: 0,
    remarks: '',
  }
}

export function inputFromNote(n: DebitNote): DebitNoteInput {
  return {
    dnNumber: n.dnNumber,
    yearMonth: n.yearMonth,
    dnDate: n.dnDate,
    customerId: n.customerId,
    buyerName: n.buyerName,
    customerInvoiceRef: n.customerInvoiceRef,
    siNumber: n.siNumber,
    contractNo: n.contractNo,
    boxes: n.boxes,
    packingDesc: n.packingDesc,
    boxesPerContainer: n.boxesPerContainer,
    mtPerContainer: n.mtPerContainer,
    productDesc: n.productDesc,
    shipmentType: n.shipmentType,
    feederVessel: n.feederVessel,
    feederVoyage: n.feederVoyage,
    feederArrivalDate: n.feederArrivalDate,
    blNumber: n.blNumber,
    pNumber: n.pNumber,
    pDescriptor: n.pDescriptor,
    oceanVessel: n.oceanVessel,
    oceanVoyage: n.oceanVoyage,
    destination: n.destination,
    blDate: n.blDate,
    chargeDesc: n.chargeDesc,
    currency: n.currency,
    ratePerMt: n.ratePerMt,
    costs: n.costs,
    remarks: n.remarks,
  }
}

interface Props {
  store: Store
  /** Present when editing; absent when creating. */
  editing?: DebitNote
  onSaved: (id: number, dnNumber: string) => void
  onCancel?: () => void
  notify: (message: string, kind: 'error' | 'ok') => void
}

export default function NoteForm({ store, editing, onSaved, onCancel, notify }: Props) {
  const { settings, customers, presets } = store

  const [form, setForm] = useState<DebitNoteInput>(() =>
    editing ? inputFromNote(editing) : emptyInput(),
  )
  const [dnSeq, setDnSeq] = useState(() =>
    editing ? (editing.dnNumber.split('-').pop() ?? '') : '',
  )
  const [autoNumber, setAutoNumber] = useState(!editing)
  const [suggested, setSuggested] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [highlighted, setHighlighted] = useState<string[]>([])
  const [blanks, setBlanks] = useState<string[]>([])
  const [activePreset, setActivePreset] = useState<number | null>(null)
  const [openBuyers, setOpenBuyers] = useState<string[]>([])
  const [costs, setCosts] = useState<CostLine[] | null>(editing ? editing.costs : null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [saving, setSaving] = useState(false)

  // Seed the defaults from Settings once they land, but never clobber a note
  // that is being edited or a field the user has already filled in.
  useEffect(() => {
    if (!settings || editing) return
    setForm((f) => ({
      ...f,
      boxesPerContainer: f.boxesPerContainer || settings.defaultBoxesPerContainer,
      mtPerContainer: f.mtPerContainer || settings.defaultMtPerContainer,
      ratePerMt: f.ratePerMt || settings.defaultRatePerMt,
      currency: f.currency || settings.defaultCurrency,
      packingDesc: f.packingDesc || settings.defaultPackingDesc,
      productDesc: f.productDesc || settings.defaultProductDesc,
      chargeDesc: f.chargeDesc || settings.defaultChargeDesc,
      customerId: f.customerId || (customers.find((c) => c.active)?.id ?? 0),
    }))
  }, [settings, customers, editing])

  // Show the DN number the note is about to take.
  useEffect(() => {
    if (!autoNumber) return
    let cancelled = false
    api
      .nextDnNumber(form.yearMonth)
      .then((n) => {
        if (!cancelled) setSuggested(n)
      })
      .catch(() => {
        if (!cancelled) setSuggested('')
      })
    return () => {
      cancelled = true
    }
  }, [form.yearMonth, autoNumber, store.notes.length])

  // Live figures, priced by the same Rust that will store them.
  const cargoKey = useDebounced(
    `${form.boxes}|${form.boxesPerContainer}|${form.mtPerContainer}|${form.ratePerMt}|${form.shipmentType}|${costs ? JSON.stringify(costs) : ''}`,
  )
  useEffect(() => {
    let cancelled = false
    api
      .previewFigures({
        boxes: form.boxes,
        boxesPerContainer: form.boxesPerContainer,
        mtPerContainer: form.mtPerContainer,
        ratePerMt: form.ratePerMt,
        shipmentType: form.shipmentType,
        ...(costs ? { costs } : {}),
      })
      .then((p) => {
        if (!cancelled) setPreview(p)
      })
      .catch(() => {
        if (!cancelled) setPreview(null)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargoKey])

  // The same feeder call is often billed to more than one buyer — once the
  // vessel and voyage match an existing note, offer back its arrival date and
  // the vessel/voyage half of its B/L number rather than making this one
  // retype them. Never overwrites something already typed.
  const feederKey = useDebounced(`${form.feederVessel}|${form.feederVoyage}`)
  useEffect(() => {
    if (!form.feederVessel.trim() || !form.feederVoyage.trim()) return
    let cancelled = false
    api
      .feederMatch(form.feederVessel, form.feederVoyage, editing?.id)
      .then((match) => {
        if (cancelled || !match) return
        const filled: string[] = []
        if (!form.feederArrivalDate.trim()) filled.push('feederArrivalDate')
        if (!form.blNumber.trim() && match.blPrefix) filled.push('blNumber')
        if (!filled.length) return
        setForm((f) => ({
          ...f,
          ...(filled.includes('feederArrivalDate') ? { feederArrivalDate: match.feederArrivalDate } : {}),
          ...(filled.includes('blNumber') ? { blNumber: `${match.blPrefix}-` } : {}),
        }))
        setHighlighted((h) => [...new Set([...h, ...filled])])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feederKey, editing?.id])

  const composedDn = autoNumber
    ? suggested
    : dnSeq.trim()
      ? `DN${form.yearMonth}-${dnSeq.trim()}`
      : ''

  function set<K extends keyof DebitNoteInput>(key: K, value: DebitNoteInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e))
    setHighlighted((h) => h.filter((k) => k !== key))
    setBlanks((b) => b.filter((k) => k !== key))
  }

  const groups = useMemo(() => {
    const map = new Map<string, Preset[]>()
    for (const p of presets) {
      const list = map.get(p.buyerName) ?? []
      list.push(p)
      map.set(p.buyerName, list)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([buyerName, items]) => ({
        buyerName,
        items: items.sort((a, b) => a.destination.localeCompare(b.destination)),
      }))
  }, [presets])

  function applyPreset(p: Preset) {
    setForm((f) => ({
      ...f,
      buyerName: p.buyerName,
      destination: p.destination,
      productDesc: p.productDesc || f.productDesc,
      packingDesc: p.packingDesc || f.packingDesc,
      currency: p.currency || f.currency,
      ratePerMt: p.ratePerMt || f.ratePerMt,
      boxesPerContainer: p.boxesPerContainer || f.boxesPerContainer,
      mtPerContainer: p.mtPerContainer || f.mtPerContainer,
      customerId: p.customerId ?? f.customerId,
      // Boxes and the outward vessel/voyage are copied too now — the client
      // asked for a head start on these since a lane usually repeats them —
      // but all three are flagged amber below for the same reason SI/Contract
      // No. stay blank: they're exactly the fields most likely to have
      // quietly changed since last time.
      boxes: p.boxes || f.boxes,
      oceanVessel: p.oceanVessel || f.oceanVessel,
      oceanVoyage: p.oceanVoyage || f.oceanVoyage,
      // SI/Contract No. are per-shipment references, not per-buyer — a copied
      // one is more likely stale than right, so the preset leaves them blank.
      // The feeder vessel/voyage belong to the shipment too, never the preset.
    }))
    setHighlighted([...PRESET_FIELDS])
    setBlanks([...ALWAYS_BLANK])
    setActivePreset(p.id)
    setErrors({})
  }

  function ring(field: string, base: React.CSSProperties = {}): React.CSSProperties {
    if (errors[field as keyof Errors]) return { ...base, borderColor: '#e05252' }
    if (highlighted.includes(field)) return { ...base, ...FROM_PRESET }
    if (blanks.includes(field)) return { ...base, ...NEEDS_FILLING }
    return base
  }

  function validate(): boolean {
    const e: Errors = {}
    if (!form.customerId) e.customerId = 'Select the customer to bill'
    if (!form.buyerName.trim()) e.buyerName = 'Required'
    if (!autoNumber && !dnSeq.trim()) e.dnSeq = 'Required'
    if (!form.dnDate) e.dnDate = 'Required'
    if (!(form.boxes > 0)) e.boxes = 'Must be greater than 0'
    if (!(form.boxesPerContainer > 0)) e.boxesPerContainer = 'Must be greater than 0'
    if (!(form.mtPerContainer > 0)) e.mtPerContainer = 'Must be greater than 0'
    if (!(form.ratePerMt > 0)) e.ratePerMt = 'Must be greater than 0'
    if (!form.productDesc.trim()) e.productDesc = 'Required'
    if (!form.feederVessel.trim()) e.feederVessel = 'Required'
    if (!form.blNumber.trim()) e.blNumber = 'Required'
    if (!form.destination.trim()) e.destination = 'Required'
    if (!form.siNumber.trim() && !form.contractNo.trim()) {
      e.siNumber = 'Fill in either SI No. or Contract No.'
      e.contractNo = 'Fill in either SI No. or Contract No.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) {
      notify('Some required fields still need filling in', 'error')
      return
    }
    setSaving(true)
    try {
      const payload: DebitNoteInput = {
        ...form,
        dnNumber: autoNumber ? '' : composedDn,
        costs: costs ?? null,
      }
      if (editing) {
        await store.updateNote(editing.id, payload)
        onSaved(editing.id, composedDn || editing.dnNumber)
      } else {
        const created = await store.createNote(payload)
        // Remember the buyer + destination pairing for next month's note.
        await store.savePreset({
          id: 0,
          customerId: form.customerId,
          buyerName: form.buyerName.trim(),
          destination: form.destination.trim(),
          siNumber: form.siNumber,
          productDesc: form.productDesc,
          packingDesc: form.packingDesc,
          currency: form.currency,
          ratePerMt: form.ratePerMt,
          boxesPerContainer: form.boxesPerContainer,
          mtPerContainer: form.mtPerContainer,
          contractNo: form.contractNo,
          boxes: form.boxes,
          oceanVessel: form.oceanVessel,
          oceanVoyage: form.oceanVoyage,
        })
        onSaved(created.id, created.dnNumber)
      }
    } catch (e) {
      notify(errorMessage(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleClear() {
    setForm({ ...emptyInput(), ...defaultsFrom(store) })
    setDnSeq('')
    setAutoNumber(true)
    setErrors({})
    setHighlighted([])
    setBlanks([])
    setActivePreset(null)
    setCosts(null)
  }

  const currency = form.currency || 'SGD'

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Preset rail */}
      <Panel width={240}>
        <PanelHeader eyebrow="Saved Profiles" title="Presets" sub="Auto-saved when a note is created" />
        <div className="flex-1 overflow-auto">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center gap-2" style={{ color: 'var(--muted-foreground)' }}>
              <Icon name="users" size={24} strokeWidth={1.5} style={{ opacity: 0.4 }} />
              <p className="text-xs leading-relaxed">Create your first debit note to save a buyer profile</p>
            </div>
          ) : (
            groups.map((g) => {
              const open = openBuyers.includes(g.buyerName)
              const activeHere = g.items.some((p) => p.id === activePreset)
              return (
                <div key={g.buyerName} style={{ borderBottom: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenBuyers((o) =>
                        o.includes(g.buyerName) ? o.filter((n) => n !== g.buyerName) : [...o, g.buyerName],
                      )
                    }
                    className="w-full flex items-center gap-2 px-3 py-3 text-left transition-colors"
                    style={{ background: activeHere ? 'color-mix(in srgb, var(--primary) 8%, var(--card))' : 'transparent' }}
                  >
                    <Chevron open={open} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate" style={{ color: activeHere ? 'var(--primary)' : 'var(--foreground)' }}>
                        {g.buyerName}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontSize: 9 }}>
                        {g.items.length} destination{g.items.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </button>

                  {open &&
                    g.items.map((p) => {
                      const active = p.id === activePreset
                      return (
                        <div
                          key={p.id}
                          className="flex items-stretch group"
                          style={{
                            background: active ? 'color-mix(in srgb, var(--primary) 12%, var(--card))' : 'var(--secondary)',
                            borderTop: '1px solid var(--border)',
                            borderLeft: `3px solid ${active ? 'var(--primary)' : 'transparent'}`,
                          }}
                        >
                          <div className="flex-1 px-3 py-2.5 cursor-pointer min-w-0" onClick={() => applyPreset(p)}>
                            <div className="text-xs font-medium truncate" style={{ color: active ? 'var(--primary)' : 'var(--foreground)' }}>
                              {p.destination || '— no destination —'}
                            </div>
                            <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)', fontSize: 9 }}>
                              {p.currency} · {p.ratePerMt}/MT{p.productDesc ? ' · ' + p.productDesc : ''}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void store.deletePreset(p.id)
                              if (activePreset === p.id) setActivePreset(null)
                            }}
                            className="w-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            style={{ color: '#e05252' }}
                            title="Remove preset"
                          >
                            <Icon name="close" size={10} strokeWidth={2.5} />
                          </button>
                        </div>
                      )
                    })}
                </div>
              )
            })
          )}
        </div>

        {activePreset !== null && (
          <div className="px-3 py-3 flex flex-col gap-2 shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--secondary)' }}>
            {[
              ['rgba(251,191,36,0.85)', 'Copied from preset — review before saving'],
              ['rgba(224,82,82,0.85)', 'Required — needs to be filled in'],
            ].map(([colour, text]) => (
              <div key={text} className="flex items-start gap-2">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0 mt-0.5" style={{ background: colour, boxShadow: `0 0 4px ${colour}` }} />
                <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{text}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Form */}
      <div className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <PageHeader
            eyebrow={editing ? 'Edit' : 'New Document'}
            title={editing ? `Edit ${editing.dnNumber}` : 'Create Debit Note'}
            sub={
              editing
                ? 'Totals and the costing block are recalculated when you save'
                : 'Leave the number on auto to take the next one for the month'
            }
          />

          <form onSubmit={handleSubmit} className="flex flex-col gap-8">
            {/* Shipment Type — standalone: it picks the accountant's cost
                card (below) without touching the customer-facing charge. */}
            <Section title="Shipment Type" subtitle="Picks the accountant's cost card, below — the printed charge is the same either way">
              <select
                value={form.shipmentType}
                onChange={(e) => {
                  set('shipmentType', e.target.value as ShipmentType)
                  setCosts(null)
                }}
                style={{ maxWidth: 220 }}
              >
                <option value="CONTAINER">Container</option>
                <option value="BREAKBULK">Breakbulk</option>
              </select>
            </Section>

            {/* Parties */}
            <Section title="Parties" subtitle="Who is billed, and whose cargo it is">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                {/* Buyer's Name leads: it changes note to note. Bill To rarely
                    does, so it follows rather than anchoring the section. */}
                <Field label="Buyer's Name" required error={errors.buyerName} hint="consignee">
                  <input
                    value={form.buyerName}
                    onChange={(e) => set('buyerName', e.target.value)}
                    style={ring('buyerName')}
                  />
                </Field>

                <Field label="Bill To" required error={errors.customerId} hint="printed at the top of the note">
                  <select
                    value={form.customerId || ''}
                    onChange={(e) => set('customerId', parseInt(e.target.value, 10) || 0)}
                    style={ring('customerId')}
                  >
                    <option value="">Select a customer…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.active ? '' : ' (retired)'}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </Section>

            {/* Identity */}
            <Section title="Note Identity">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Field label="Debit Number" required error={errors.dnSeq} hint="DN-YYYYMM-no.">
                  <div className="flex flex-col gap-1.5">
                    <div
                      className="flex items-center"
                      style={{
                        border: `1px solid ${errors.dnSeq ? '#e05252' : 'var(--border)'}`,
                        borderRadius: 6,
                        overflow: 'hidden',
                        background: 'var(--secondary)',
                        opacity: autoNumber ? 0.65 : 1,
                      }}
                    >
                      <span
                        className="px-3 py-2 text-xs font-bold shrink-0 select-none"
                        style={{
                          fontFamily: 'var(--font-jetbrains)',
                          color: 'var(--primary)',
                          background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                          borderRight: '1px solid var(--border)',
                        }}
                      >
                        DN
                      </span>
                      <input
                        type="month"
                        value={toMonthInput(form.yearMonth)}
                        onChange={(e) => set('yearMonth', fromMonthInput(e.target.value))}
                        style={{
                          border: 'none',
                          borderRadius: 0,
                          background: 'transparent',
                          fontFamily: 'var(--font-jetbrains)',
                          fontSize: 12,
                          width: 132,
                          paddingLeft: 8,
                          paddingRight: 4,
                        }}
                      />
                      <span
                        className="text-xs shrink-0 select-none"
                        style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)', borderLeft: '1px solid var(--border)', padding: '0 6px' }}
                      >
                        —
                      </span>
                      <MonoInput
                        value={autoNumber ? (suggested.split('-').pop() ?? '') : dnSeq}
                        disabled={autoNumber}
                        onChange={(e) => {
                          setDnSeq(e.target.value)
                          setErrors((x) => ({ ...x, dnSeq: undefined }))
                        }}
                        placeholder="01"
                        style={{ border: 'none', borderRadius: 0, background: 'transparent', flex: 1, minWidth: 0 }}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs px-0.5" style={{ color: 'var(--muted-foreground)' }}>
                      <input
                        type="checkbox"
                        checked={autoNumber}
                        onChange={(e) => setAutoNumber(e.target.checked)}
                        style={{ width: 'auto', padding: 0 }}
                      />
                      Increment automatically
                    </label>
                  </div>
                </Field>

                <Field label="Date" required error={errors.dnDate}>
                  <input type="date" value={form.dnDate} onChange={(e) => set('dnDate', e.target.value)} style={ring('dnDate')} />
                </Field>

                <Field label="Your Invoice No." hint="the customer's reference">
                  <MonoInput
                    value={form.customerInvoiceRef}
                    onChange={(e) => set('customerInvoiceRef', e.target.value)}
                    style={ring('customerInvoiceRef')}
                  />
                </Field>

                <Field label="P No." hint="e.g. 153/26, plus where — Tuaran, etc.">
                  <div className="flex items-center gap-1.5">
                    <MonoInput
                      value={form.pNumber}
                      onChange={(e) => set('pNumber', e.target.value)}
                      placeholder="153/26"
                      style={{ ...ring('pNumber'), flex: 1, minWidth: 0 }}
                    />
                    <input
                      value={form.pDescriptor}
                      onChange={(e) => set('pDescriptor', e.target.value)}
                      placeholder="Tuaran"
                      style={{ flex: 1, minWidth: 0 }}
                    />
                  </div>
                </Field>

                <Field label="SI Number" error={errors.siNumber} hint="fill this or Contract No.">
                  <MonoInput value={form.siNumber} onChange={(e) => set('siNumber', e.target.value)} style={ring('siNumber')} />
                </Field>

                <Field label="Contract No." error={errors.contractNo} hint="fill this or SI Number">
                  <MonoInput value={form.contractNo} onChange={(e) => set('contractNo', e.target.value)} style={ring('contractNo')} />
                </Field>
              </div>
            </Section>

            {/* Cargo */}
            <Section title="Cargo">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Field label="Boxes" required error={errors.boxes}>
                  <MonoInput
                    type="number"
                    min={0}
                    step="1"
                    value={form.boxes || ''}
                    onChange={(e) => set('boxes', parseFloat(e.target.value) || 0)}
                    placeholder="90"
                    style={ring('boxes')}
                  />
                </Field>

                <Field label="Packing">
                  <input
                    value={form.packingDesc}
                    onChange={(e) => set('packingDesc', e.target.value)}
                    placeholder="Metal Boxes (MB5)"
                  />
                </Field>

                <Field label="Boxes / Container" required error={errors.boxesPerContainer}>
                  <MonoInput
                    type="number"
                    min={0}
                    step="0.0001"
                    value={form.boxesPerContainer || ''}
                    onChange={(e) => set('boxesPerContainer', parseFloat(e.target.value) || 0)}
                    style={ring('boxesPerContainer')}
                  />
                </Field>

                <Field label="M/Tons / Container" required error={errors.mtPerContainer}>
                  <MonoInput
                    type="number"
                    min={0}
                    step="0.0001"
                    value={form.mtPerContainer || ''}
                    onChange={(e) => set('mtPerContainer', parseFloat(e.target.value) || 0)}
                    style={ring('mtPerContainer')}
                  />
                </Field>

                <Derived label="Tonnage">
                  {preview && form.boxes > 0 ? (
                    <>
                      <span style={{ color: 'var(--primary)' }}>{fmt2(preview.tonnage)} MT</span>
                      <span style={{ color: 'var(--muted-foreground)' }}>
                        {' '}= {fmt4(preview.containers)} × {form.mtPerContainer}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: 'var(--muted-foreground)' }}>—</span>
                  )}
                </Derived>

                <Field label="Product" required error={errors.productDesc}>
                  <input
                    value={form.productDesc}
                    onChange={(e) => set('productDesc', e.target.value)}
                    placeholder="SMR 20 Rubber"
                    style={ring('productDesc')}
                  />
                </Field>
              </div>
            </Section>

            {/* Feeder */}
            <Section title="First Carrier" subtitle="Inbound feeder vessel, arrival and B/L">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Field label="Vessel Name" required error={errors.feederVessel}>
                  <input
                    value={form.feederVessel}
                    onChange={(e) => set('feederVessel', e.target.value)}
                    style={ring('feederVessel')}
                  />
                </Field>

                <Field label="Voyage Number">
                  <Prefixed prefix="Voy">
                    <MonoInput
                      value={form.feederVoyage}
                      onChange={(e) => set('feederVoyage', e.target.value)}
                      style={{ border: 'none', borderRadius: 0, background: 'transparent', flex: 1, minWidth: 0 }}
                    />
                  </Prefixed>
                </Field>

                <Field label="Arrival Date">
                  <input
                    type="date"
                    value={form.feederArrivalDate}
                    onChange={(e) => set('feederArrivalDate', e.target.value)}
                    style={ring('feederArrivalDate')}
                  />
                </Field>

                <Field label="B/L Number" required error={errors.blNumber}>
                  <MonoInput
                    value={form.blNumber}
                    onChange={(e) => set('blNumber', e.target.value)}
                    style={ring('blNumber')}
                  />
                </Field>
              </div>
            </Section>

            {/* Outward */}
            <Section title="Outward Vessel" subtitle="Onward routing and the dated B/L">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Field label="Vessel Name">
                  <input
                    value={form.oceanVessel}
                    onChange={(e) => set('oceanVessel', e.target.value)}
                    style={ring('oceanVessel')}
                  />
                </Field>

                <Field label="Voyage Number">
                  <Prefixed prefix="Voy" style={ring('oceanVoyage')}>
                    <MonoInput
                      value={form.oceanVoyage}
                      onChange={(e) => set('oceanVoyage', e.target.value)}
                      style={{ border: 'none', borderRadius: 0, background: 'transparent', flex: 1, minWidth: 0 }}
                    />
                  </Prefixed>
                </Field>

                <Field label="Destination" required error={errors.destination}>
                  <input
                    value={form.destination}
                    onChange={(e) => set('destination', e.target.value)}
                    placeholder="Savannah, USA"
                    style={ring('destination')}
                  />
                </Field>

                <Field label="B/L Dated">
                  <input type="date" value={form.blDate} onChange={(e) => set('blDate', e.target.value)} style={ring('blDate')} />
                </Field>
              </div>
            </Section>

            {/* Charge */}
            <Section title="Charge" subtitle="The single charge line on the customer copy">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Field label="Description">
                  <input
                    value={form.chargeDesc}
                    onChange={(e) => set('chargeDesc', e.target.value)}
                    placeholder="Transhipment Charge"
                  />
                </Field>

                <Field label="Currency">
                  <select value={currency} onChange={(e) => set('currency', e.target.value)}>
                    {['SGD', 'USD', 'MYR', 'EUR', 'GBP', 'JPY', 'CNY'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>

                <Field label={`Rate / M/Ton (${currency})`} required error={errors.ratePerMt}>
                  <MonoInput
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.ratePerMt || ''}
                    onChange={(e) => set('ratePerMt', parseFloat(e.target.value) || 0)}
                    style={ring('ratePerMt')}
                  />
                </Field>

                <Derived label="Total">
                  {preview && preview.totalAmount > 0 ? (
                    <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
                      {currency} {fmt2(preview.totalAmount)}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--muted-foreground)' }}>—</span>
                  )}
                </Derived>
              </div>

              {preview && preview.totalAmount > 0 && (
                <p className="text-xs mt-4 pt-3" style={{ color: 'var(--muted-foreground)', borderTop: '1px solid var(--border)' }}>
                  {preview.amountInWords}
                </p>
              )}
            </Section>

            {/* Costing */}
            <CostingSection
              preview={preview}
              costs={costs}
              currency={currency}
              shipmentType={form.shipmentType}
              onEdit={(lines) => setCosts(lines)}
              onReset={() => setCosts(null)}
            />

            {/* Remarks */}
            <Section title="Remarks" subtitle="Printed in small italics under the payment lines">
              <textarea rows={3} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} placeholder="Optional note…" />
            </Section>

            <div className="flex items-center justify-between pb-10">
              {editing ? (
                <GhostButton type="button" onClick={onCancel}>Cancel</GhostButton>
              ) : (
                <GhostButton type="button" onClick={handleClear}>Clear</GhostButton>
              )}
              <PrimaryButton type="submit" disabled={saving} className="px-8">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Debit Note'}
              </PrimaryButton>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function defaultsFrom(store: Store): Partial<DebitNoteInput> {
  const s = store.settings
  if (!s) return {}
  return {
    boxesPerContainer: s.defaultBoxesPerContainer,
    mtPerContainer: s.defaultMtPerContainer,
    ratePerMt: s.defaultRatePerMt,
    currency: s.defaultCurrency,
    packingDesc: s.defaultPackingDesc,
    productDesc: s.defaultProductDesc,
    chargeDesc: s.defaultChargeDesc,
    customerId: store.customers.find((c) => c.active)?.id ?? 0,
  }
}

function Prefixed({
  prefix,
  children,
  style,
}: {
  prefix: string
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div
      className="flex items-center"
      style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--secondary)', ...style }}
    >
      <span
        className="px-3 py-2 text-xs font-semibold shrink-0 select-none"
        style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', background: 'var(--secondary)', borderRight: '1px solid var(--border)' }}
      >
        {prefix}
      </span>
      {children}
    </div>
  )
}

/**
 * The accountant copy's numbers, live. Starts from the rate card in Settings;
 * a per-note override only appears once the user edits a rate here, which keeps
 * the common case ("just use the card") free of clutter.
 */
function CostingSection({
  preview,
  costs,
  currency,
  shipmentType,
  onEdit,
  onReset,
}: {
  preview: Preview | null
  costs: CostLine[] | null
  currency: string
  shipmentType: ShipmentType
  onEdit: (lines: CostLine[]) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const lines = preview?.costs.lines ?? []

  function setRate(code: string, category: string, rate: number) {
    onEdit(lines.map((l) => (l.code === code && l.category === category ? { ...l, rate } : l)))
  }

  const cardLabel = shipmentType === 'BREAKBULK' ? 'Breakbulk' : 'Container'
  return (
    <Section
      title="Costing"
      subtitle={
        costs
          ? 'Rates overridden for this note only — the card in Settings is untouched'
          : `Priced from the ${cardLabel} rate card`
      }
      right={
        <div className="flex items-center gap-2">
          {costs && (
            <button type="button" onClick={onReset} className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Reset to card
            </button>
          )}
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs" style={{ color: 'var(--primary)' }}>
            {open ? 'Hide rates' : 'Edit rates'}
          </button>
        </div>
      }
    >
      {!preview || preview.totalAmount === 0 ? (
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          Enter the cargo and rate above to see the costing.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            {COST_CATEGORIES.map((cat) => (
              <div key={cat}>
                <div className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted-foreground)', fontSize: 9 }}>
                  {CATEGORY_LABEL[cat]}
                </div>
                <div className="flex flex-col gap-1">
                  {lines
                    .filter((l) => l.category === cat)
                    .map((l) => (
                      <div key={cat + l.code} className="flex items-center justify-between gap-2" style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 10 }}>
                        <span style={{ color: 'var(--muted-foreground)' }}>{l.label || l.code}</span>
                        {open ? (
                          <input
                            type="number"
                            step="0.01"
                            value={l.rate}
                            onChange={(e) => setRate(l.code, l.category, parseFloat(e.target.value) || 0)}
                            style={{ width: 66, padding: '2px 5px', fontSize: 10, fontFamily: 'var(--font-jetbrains)', textAlign: 'right' }}
                          />
                        ) : (
                          <span>{fmt2(l.amount)}</span>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ))}

            <div className="flex flex-col gap-1.5">
              <div className="text-xs tracking-widest uppercase mb-0.5" style={{ color: 'var(--muted-foreground)', fontSize: 9 }}>
                Summary
              </div>
              {(
                [
                  ['Port Charges', preview.costs.port],
                  ['Transport', preview.costs.transport],
                  ['Misc', preview.costs.misc],
                ] as const
              ).map(([label, value]) => (
                <Row key={label} label={label} value={fmt2(value)} />
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 5 }}>
                <Row label="Total cost" value={fmt2(preview.costs.totalCost)} bold />
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 5, marginTop: 2 }}>
                <Row
                  label="Profit"
                  value={fmt2(preview.costs.profit)}
                  bold
                  colour={preview.costs.profit < 0 ? '#e05252' : 'var(--primary)'}
                />
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--muted-foreground)', fontSize: 9 }}>
                {currency} · accountant copy only
              </div>
            </div>
          </div>

          {open && (
            <p className="text-xs mt-4 pt-3" style={{ color: 'var(--muted-foreground)', borderTop: '1px solid var(--border)' }}>
              Rates are per container unless the card says otherwise; change the basis in Settings → Rate Card.
            </p>
          )}
        </>
      )}
    </Section>
  )
}

function Row({ label, value, bold, colour }: { label: string; value: string; bold?: boolean; colour?: string }) {
  return (
    <div className="flex items-center justify-between gap-2" style={{ fontSize: 11 }}>
      <span style={{ color: bold ? 'var(--foreground)' : 'var(--muted-foreground)', fontWeight: bold ? 600 : 400 }}>
        {label}
      </span>
      <span style={{ fontFamily: 'var(--font-jetbrains)', fontWeight: bold ? 600 : 400, color: colour ?? 'var(--foreground)' }}>
        {value}
      </span>
    </div>
  )
}
