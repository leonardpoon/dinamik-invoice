import { useState, useMemo, useEffect } from 'react';
import type { InvoiceFormData, Invoice } from '../types';
import type { AppSettings } from '../utils/settings';

const PRESETS_KEY = 'maritime_buyer_presets';

interface BuyerPreset {
  buyerName: string;
  destination: string;
  siNumber: string;
  grade: string;
  currency: string;
  fixedRate: number;
  unitConversionFactor: number;
}

// Yellow: only these two fields are copied from preset and flagged for review
const PRESET_FIELDS: (keyof InvoiceFormData)[] = ['buyersName', 'destination'];

// Red: required fields that are always blank after a preset is applied
const ALWAYS_BLANK: (keyof InvoiceFormData)[] = [
  'metricTonnes', 'firstVesselName', 'arrivalDate', 'blNumber', 'blDated',
];

// Grade is stored as raw middle part ("20"), composed as "SMR 20 Rubber" on submit/preset save
function composeGrade(raw: string): string {
  const t = raw.trim();
  return t ? 'SMR ' + t + ' Rubber' : '';
}
function decomposeGrade(full: string): string {
  return full.replace(/^SMR\s+/, '').replace(/\s+Rubber$/i, '').trim();
}

function loadPresets(): BuyerPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]');
    // Migrate old format where key was `name` not `buyerName`
    return (raw as Record<string, unknown>[]).map(p => ({
      buyerName: (p.buyerName ?? p.name ?? '') as string,
      destination: (p.destination ?? '') as string,
      siNumber: (p.siNumber ?? '') as string,
      grade: (p.grade ?? '') as string,
      currency: (p.currency ?? 'SGD') as string,
      fixedRate: (p.fixedRate ?? 0) as number,
      unitConversionFactor: (p.unitConversionFactor ?? 1.26) as number,
    }));
  } catch {
    return [];
  }
}

function savePreset(preset: BuyerPreset) {
  const all = loadPresets().filter(
    p => !(p.buyerName === preset.buyerName && p.destination === preset.destination),
  );
  localStorage.setItem(PRESETS_KEY, JSON.stringify([preset, ...all]));
}

function deletePreset(buyerName: string, destination: string) {
  const all = loadPresets().filter(
    p => !(p.buyerName === buyerName && p.destination === destination),
  );
  localStorage.setItem(PRESETS_KEY, JSON.stringify(all));
}

// Group presets: buyer → destinations[]
interface BuyerGroup {
  buyerName: string;
  destinations: BuyerPreset[];
}

function groupPresets(presets: BuyerPreset[]): BuyerGroup[] {
  const map: Record<string, BuyerPreset[]> = {};
  presets.forEach(p => {
    if (!map[p.buyerName]) map[p.buyerName] = [];
    map[p.buyerName].push(p);
  });
  return Object.keys(map)
    .sort((a, b) => a.localeCompare(b))
    .map(buyerName => ({
      buyerName,
      destinations: map[buyerName].slice().sort((a, b) => a.destination.localeCompare(b.destination)),
    }));
}

const EMPTY: InvoiceFormData = {
  debitNumber: '',
  invoiceNumber: '',
  buyersName: '',
  siNumber: '',
  grade: '',
  metricTonnes: 0,
  unitConversionFactor: 1.26,
  fixedRate: 54,
  currency: 'SGD',
  firstVesselName: '',
  firstVoyageNumber: '',
  arrivalDate: '',
  blNumber: '',
  blDated: '',
  outwardVesselName: '',
  outwardVoyageNumber: '',
  destination: '',
  notes: '',
};

interface Props {
  onCreate: (data: InvoiceFormData) => Invoice;
  onCreated: (invoice: Invoice) => void;
  settings?: AppSettings;
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>
        {label}{required && <span style={{ color: 'var(--primary)' }}> *</span>}
        {hint && <span className="ml-1 normal-case tracking-normal font-normal" style={{ opacity: 0.6 }}>({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="p-6 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="pb-3 mb-5" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="text-base font-serif">{title}</h3>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function MonoInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 12, ...props.style }} />;
}

function currentYYYYMM() {
  const d = new Date();
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0');
}

// Amber — fields copied from preset (review before submitting)
const HIGHLIGHT_STYLE: React.CSSProperties = {
  boxShadow: '0 0 0 2px rgba(251,191,36,0.55)',
  borderColor: 'rgba(251,191,36,0.7)',
};

// Red — fields that are blank and need to be filled after a preset is applied
const BLANK_STYLE: React.CSSProperties = {
  boxShadow: '0 0 0 2px rgba(224,82,82,0.45)',
  borderColor: 'rgba(224,82,82,0.65)',
};

export default function InvoiceForm({ onCreate, onCreated, settings }: Props) {
  const getEmpty = (): InvoiceFormData => ({
    ...EMPTY,
    unitConversionFactor: settings?.defaultUnitConversionFactor ?? EMPTY.unitConversionFactor,
    fixedRate: settings?.defaultFixedRate ?? EMPTY.fixedRate,
    currency: settings?.defaultCurrency ?? EMPTY.currency,
  });

  const [form, setForm] = useState<InvoiceFormData>(getEmpty);
  const [errors, setErrors] = useState<Partial<Record<keyof InvoiceFormData, string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [presets, setPresets] = useState<BuyerPreset[]>(loadPresets);
  const [highlighted, setHighlighted] = useState<string[]>([]); // amber: copied from preset
  const [blankFields, setBlankFields] = useState<string[]>([]);  // blue: needs filling
  const [seqBlank, setSeqBlank] = useState(false);               // blue ring on DN seq input
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [expandedBuyers, setExpandedBuyers] = useState<string[]>([]);

  // Invoice number composition
  const [invMonth, setInvMonth] = useState(currentYYYYMM);
  const [invSeq, setInvSeq] = useState('');

  const groups = useMemo(() => groupPresets(presets), [presets]);

  function set<K extends keyof InvoiceFormData>(key: K, value: InvoiceFormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }));
    if (highlighted.includes(key as string)) setHighlighted(prev => prev.filter(f => f !== key));
    if (blankFields.includes(key as string)) setBlankFields(prev => prev.filter(f => f !== key));
  }

  function applyPreset(p: BuyerPreset) {
    setForm(prev => ({
      ...prev,
      buyersName: p.buyerName,
      destination: p.destination,
      siNumber: p.siNumber,
      grade: decomposeGrade(p.grade),
      currency: p.currency,
      fixedRate: p.fixedRate,
      unitConversionFactor: p.unitConversionFactor,
      // vessel fields intentionally not touched
    }));
    setHighlighted(PRESET_FIELDS as string[]);
    // Red: always-blank required fields + preset fields that came through empty
    const blanks: string[] = (ALWAYS_BLANK as string[]).slice();
    if (!p.siNumber) blanks.push('siNumber');
    if (!p.grade) blanks.push('grade');
    setBlankFields(blanks);
    setSeqBlank(!invSeq.trim());
    setActivePreset(p.buyerName + '::' + p.destination);
    setErrors({});
  }

  function removePreset(buyerName: string, destination: string) {
    deletePreset(buyerName, destination);
    const updated = loadPresets();
    setPresets(updated);
    if (activePreset === buyerName + '::' + destination) {
      setActivePreset(null);
    }
  }

  function toggleBuyer(name: string) {
    setExpandedBuyers(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name],
    );
  }

  const units = useMemo(() => {
    if (!form.metricTonnes || !form.unitConversionFactor) return 0;
    return parseFloat((form.metricTonnes / form.unitConversionFactor).toFixed(4));
  }, [form.metricTonnes, form.unitConversionFactor]);

  const composedDebitNumber = invSeq.trim()
    ? 'DN' + invMonth + '-' + invSeq.trim()
    : '';

  function validate(): boolean {
    const e: Partial<Record<keyof InvoiceFormData, string>> = {};
    if (!form.buyersName.trim()) e.buyersName = 'Required';
    if (!invSeq.trim()) e.debitNumber = 'Required';
    if (!form.siNumber.trim()) e.siNumber = 'Required';
    if (!form.grade.trim()) e.grade = 'Required';
    if (form.metricTonnes <= 0) e.metricTonnes = 'Must be > 0';
    if (form.fixedRate <= 0) e.fixedRate = 'Must be > 0';
    if (!form.firstVesselName.trim()) e.firstVesselName = 'Required';
    if (!form.arrivalDate) e.arrivalDate = 'Required';
    if (!form.blNumber.trim()) e.blNumber = 'Required';
    if (!form.blDated) e.blDated = 'Required';
    if (!form.destination.trim()) e.destination = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (form.buyersName.trim()) {
      const preset: BuyerPreset = {
        buyerName: form.buyersName.trim(),
        destination: form.destination.trim(),
        siNumber: form.siNumber,
        grade: composeGrade(form.grade),
        currency: form.currency,
        fixedRate: form.fixedRate,
        unitConversionFactor: form.unitConversionFactor,
      };
      savePreset(preset);
      setPresets(loadPresets());
    }
    const invoice = onCreate({ ...form, debitNumber: composedDebitNumber, grade: composeGrade(form.grade) });
    setSubmitted(true);
    onCreated(invoice);
  }

  function handleReset() {
    setForm(getEmpty());
    setErrors({});
    setSubmitted(false);
    setHighlighted([]);
    setBlankFields([]);
    setSeqBlank(false);
    setActivePreset(null);
    setInvMonth(currentYYYYMM());
    setInvSeq('');
  }

  const fmtNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  function Err({ field }: { field: keyof InvoiceFormData }) {
    return errors[field] ? <span className="text-xs" style={{ color: '#e05252' }}>{errors[field]}</span> : null;
  }

  // Amber: copied from preset
  function hl(field: keyof InvoiceFormData, base?: React.CSSProperties): React.CSSProperties {
    if (highlighted.includes(field as string)) return { ...base, ...HIGHLIGHT_STYLE };
    if (blankFields.includes(field as string)) return { ...base, ...BLANK_STYLE };
    return base ?? {};
  }

  // Blue: blank field needing attention (for non-form-state fields like invSeq)
  function seqStyle(base?: React.CSSProperties): React.CSSProperties {
    return seqBlank ? { ...base, ...BLANK_STYLE } : (base ?? {});
  }

  return (
    <div className="flex flex-1 overflow-hidden h-full">

      {/* ── Left: Preset panel ── */}
      <div
        className="flex flex-col shrink-0 overflow-hidden"
        style={{ width: 240, borderRight: '1px solid var(--border)', background: 'var(--card)' }}
      >
        <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-xs tracking-widest uppercase mb-0.5" style={{ color: 'var(--primary)', fontFamily: 'var(--font-jetbrains)', fontSize: 9 }}>
            Saved Profiles
          </p>
          <h3 className="text-sm font-serif font-light">Presets</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
            Auto-saved on submit
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center gap-2" style={{ color: 'var(--muted-foreground)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <p className="text-xs leading-relaxed">Submit your first invoice to save a buyer profile</p>
            </div>
          ) : groups.map(group => {
            const isExpanded = expandedBuyers.includes(group.buyerName);
            const isActiveBuyer = group.destinations.some(d => activePreset === group.buyerName + '::' + d.destination);

            return (
              <div key={group.buyerName} style={{ borderBottom: '1px solid var(--border)' }}>
                {/* Buyer header */}
                <button
                  type="button"
                  onClick={() => toggleBuyer(group.buyerName)}
                  className="w-full flex items-center gap-2 px-3 py-3 text-left transition-colors"
                  style={{
                    background: isActiveBuyer
                      ? 'color-mix(in srgb, var(--primary) 8%, var(--card))'
                      : 'transparent',
                  }}
                >
                  <svg
                    width="8" height="8" viewBox="0 0 10 10" fill="none"
                    style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', color: 'var(--muted-foreground)', flexShrink: 0 }}
                  >
                    <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate" style={{ color: isActiveBuyer ? 'var(--primary)' : 'var(--foreground)' }}>
                      {group.buyerName}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontSize: 9 }}>
                      {group.destinations.length} destination{group.destinations.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </button>

                {/* Destination rows */}
                {isExpanded && group.destinations.map(p => {
                  const key = p.buyerName + '::' + p.destination;
                  const isActive = activePreset === key;
                  return (
                    <div
                      key={key}
                      className="flex items-stretch group"
                      style={{
                        background: isActive
                          ? 'color-mix(in srgb, var(--primary) 12%, var(--card))'
                          : 'var(--secondary)',
                        borderTop: '1px solid var(--border)',
                        borderLeft: `3px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
                      }}
                    >
                      {/* Main click area */}
                      <div
                        className="flex-1 px-3 py-2.5 cursor-pointer min-w-0"
                        onClick={() => applyPreset(p)}
                      >
                        <div className="text-xs font-medium truncate" style={{ color: isActive ? 'var(--primary)' : 'var(--foreground)' }}>
                          {p.destination || '— no destination —'}
                        </div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)', fontSize: 9 }}>
                          {p.currency} · {p.fixedRate}/MT{p.grade ? ' · ' + p.grade : ''}
                        </div>
                      </div>
                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => removePreset(p.buyerName, p.destination)}
                        className="w-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        style={{ color: '#e05252' }}
                        title="Remove preset"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Legend — shown whenever a preset is active */}
        {activePreset && (
          <div
            className="px-3 py-3 flex flex-col gap-2 shrink-0"
            style={{ borderTop: '1px solid var(--border)', background: 'var(--secondary)' }}
          >
            <div className="flex items-start gap-2">
              <div className="w-2.5 h-2.5 rounded-sm shrink-0 mt-0.5" style={{ background: 'rgba(251,191,36,0.85)', boxShadow: '0 0 4px rgba(251,191,36,0.4)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
                Copied from preset — review before submitting
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-2.5 h-2.5 rounded-sm shrink-0 mt-0.5" style={{ background: 'rgba(224,82,82,0.85)', boxShadow: '0 0 4px rgba(224,82,82,0.4)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
                Required — needs to be filled in
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Right: Form ── */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="mb-8">
            <p className="text-xs tracking-widest uppercase mb-1" style={{ color: 'var(--primary)', fontFamily: 'var(--font-jetbrains)' }}>
              New Document
            </p>
            <h1 className="text-3xl font-serif font-light">Create Invoice</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
              System filing ID assigned automatically · Enter your DN invoice number below
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-8">

            {/* Buyer */}
            <Section title="Buyer">
              <Field label="Buyer's Name" required>
                <input
                  value={form.buyersName}
                  onChange={e => set('buyersName', e.target.value)}
                  placeholder="Company name"
                  style={hl('buyersName', errors.buyersName ? { borderColor: '#e05252' } : {})}
                />
                <Err field="buyersName" />
              </Field>
            </Section>

            {/* Invoice Identity */}
            <Section title="Invoice Identity">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Field label="Debit Number" required hint="DN-YYYYMM-no.">
                  <div className="flex flex-col gap-1">
                    <div
                      className="flex items-center gap-0"
                      style={seqStyle({
                        border: `1px solid ${errors.debitNumber ? '#e05252' : 'var(--border)'}`,
                        borderRadius: 6, overflow: 'hidden', background: 'var(--input, var(--secondary))',
                      })}
                    >
                      <span className="px-3 py-2 text-xs font-bold shrink-0 select-none" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 10%, transparent)', borderRight: '1px solid var(--border)' }}>
                        DN
                      </span>
                      <input
                        type="month"
                        value={invMonth.slice(0, 4) + '-' + invMonth.slice(4)}
                        onChange={e => setInvMonth(e.target.value.replace('-', ''))}
                        style={{ border: 'none', borderRadius: 0, background: 'transparent', fontFamily: 'var(--font-jetbrains)', fontSize: 12, width: 130, paddingLeft: 8, paddingRight: 4 }}
                      />
                      <span className="text-xs shrink-0 select-none" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)', borderLeft: '1px solid var(--border)', padding: '0 6px' }}>—</span>
                      <MonoInput
                        value={invSeq}
                        onChange={e => { setInvSeq(e.target.value); if (e.target.value.trim()) setSeqBlank(false); if (errors.debitNumber) setErrors(prev => ({ ...prev, debitNumber: undefined })); }}
                        placeholder="01"
                        style={{ border: 'none', borderRadius: 0, background: 'transparent', flex: 1, minWidth: 0 }}
                      />
                    </div>
                    {composedDebitNumber && (
                      <div className="text-xs px-1" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--primary)', fontSize: 10 }}>
                        → {composedDebitNumber}
                      </div>
                    )}
                    <Err field="debitNumber" />
                  </div>
                </Field>

                <Field label="Invoice Number">
                  <MonoInput
                    value={form.invoiceNumber}
                    onChange={e => set('invoiceNumber', e.target.value)}
                    placeholder=""
                  />
                </Field>

                <Field label="SI Number" required>
                  <MonoInput
                    value={form.siNumber}
                    onChange={e => set('siNumber', e.target.value)}
                    placeholder=""
                    style={hl('siNumber', errors.siNumber ? { borderColor: '#e05252' } : {})}
                  />
                  <Err field="siNumber" />
                </Field>
              </div>
            </Section>

            {/* Cargo */}
            <Section title="Cargo" subtitle="Grade, weight and unit breakdown">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Field label="Grade" required>
                  <div
                    className="flex items-center gap-0"
                    style={{ border: `1px solid ${errors.grade ? '#e05252' : 'var(--border)'}`, borderRadius: 6, overflow: 'hidden', background: 'var(--input, var(--secondary))', ...(highlighted.includes('grade') ? HIGHLIGHT_STYLE : {}) }}
                  >
                    <span className="px-3 py-2 text-xs font-semibold shrink-0 select-none" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', background: 'var(--secondary)', borderRight: '1px solid var(--border)' }}>
                      SMR
                    </span>
                    <MonoInput
                      value={form.grade}
                      onChange={e => set('grade', e.target.value)}
                      placeholder="20"
                      style={{ border: 'none', borderRadius: 0, background: 'transparent', flex: 1, minWidth: 0 }}
                    />
                    <span className="px-3 py-2 text-xs font-semibold shrink-0 select-none" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', background: 'var(--secondary)', borderLeft: '1px solid var(--border)' }}>
                      Rubber
                    </span>
                  </div>
                  <Err field="grade" />
                </Field>

                <Field label="Metric Tonnes" required>
                  <MonoInput
                    type="number" min={0} step="0.01"
                    value={form.metricTonnes || ''}
                    onChange={e => set('metricTonnes', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    style={hl('metricTonnes', errors.metricTonnes ? { borderColor: '#e05252' } : {})}
                  />
                  <Err field="metricTonnes" />
                </Field>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>
                    Units <span className="normal-case tracking-normal font-normal opacity-60">(computed)</span>
                  </label>
                  <div
                    className="px-3 py-2 rounded text-sm"
                    style={{ background: 'var(--muted)', border: '1px solid var(--border)', fontFamily: 'var(--font-jetbrains)', fontSize: 12 }}
                  >
                    {form.metricTonnes > 0
                      ? <><span style={{ color: 'var(--primary)' }}>{fmtNum(units)}</span><span style={{ color: 'var(--muted-foreground)' }}> = {fmtNum(form.metricTonnes)} MT ÷ {form.unitConversionFactor}</span></>
                      : <span style={{ color: 'var(--muted-foreground)' }}>—</span>
                    }
                  </div>
                </div>
              </div>
            </Section>

            {/* First Carrier */}
            <Section title="First Carrier" subtitle="Inbound vessel, arrival date, and B/L number">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Field label="Vessel Name" required>
                  <input
                    value={form.firstVesselName}
                    onChange={e => set('firstVesselName', e.target.value)}
                    placeholder=""
                    style={hl('firstVesselName', errors.firstVesselName ? { borderColor: '#e05252' } : {})}
                  />
                  <Err field="firstVesselName" />
                </Field>

                <Field label="Voyage Number">
                  <div className="flex items-center gap-0" style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--input, var(--secondary))' }}>
                    <span className="px-3 py-2 text-xs font-semibold shrink-0 select-none" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', background: 'var(--secondary)', borderRight: '1px solid var(--border)' }}>
                      Voy:
                    </span>
                    <MonoInput
                      value={form.firstVoyageNumber}
                      onChange={e => set('firstVoyageNumber', e.target.value)}
                      placeholder=""
                      style={{ border: 'none', borderRadius: 0, background: 'transparent', flex: 1 }}
                    />
                  </div>
                </Field>

                <Field label="Arrival Date" required>
                  <input
                    type="date"
                    value={form.arrivalDate}
                    onChange={e => set('arrivalDate', e.target.value)}
                    style={hl('arrivalDate', errors.arrivalDate ? { borderColor: '#e05252' } : {})}
                  />
                  <Err field="arrivalDate" />
                </Field>

                <Field label="B/L Number" required>
                  <MonoInput
                    value={form.blNumber}
                    onChange={e => set('blNumber', e.target.value)}
                    placeholder=""
                    style={hl('blNumber', errors.blNumber ? { borderColor: '#e05252' } : {})}
                  />
                  <Err field="blNumber" />
                </Field>
              </div>
            </Section>

            {/* Outward Vessel */}
            <Section title="Outward Vessel" subtitle="Onward routing details and B/L dated">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Field label="Vessel Name">
                  <input
                    value={form.outwardVesselName}
                    onChange={e => set('outwardVesselName', e.target.value)}
                    placeholder=""
                  />
                </Field>

                <Field label="Voyage Number">
                  <div className="flex items-center gap-0" style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--input, var(--secondary))' }}>
                    <span className="px-3 py-2 text-xs font-semibold shrink-0 select-none" style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', background: 'var(--secondary)', borderRight: '1px solid var(--border)' }}>
                      Voy:
                    </span>
                    <MonoInput
                      value={form.outwardVoyageNumber}
                      onChange={e => set('outwardVoyageNumber', e.target.value)}
                      placeholder=""
                      style={{ border: 'none', borderRadius: 0, background: 'transparent', flex: 1 }}
                    />
                  </div>
                </Field>

                <Field label="Destination" required>
                  <input
                    value={form.destination}
                    onChange={e => set('destination', e.target.value)}
                    placeholder=""
                    style={hl('destination', errors.destination ? { borderColor: '#e05252' } : {})}
                  />
                  <Err field="destination" />
                </Field>

                <Field label="B/L Dated" required>
                  <input
                    type="date"
                    value={form.blDated}
                    onChange={e => set('blDated', e.target.value)}
                    style={hl('blDated', errors.blDated ? { borderColor: '#e05252' } : {})}
                  />
                  <Err field="blDated" />
                </Field>
              </div>
            </Section>

            {/* Notes */}
            <section className="p-6 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <div className="pb-3 mb-4" style={{ borderBottom: '1px solid var(--border)' }}>
                <h3 className="text-base font-serif">Notes</h3>
              </div>
              <textarea
                rows={3}
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Additional notes or remarks…"
              />
            </section>

            <div className="flex items-center justify-between pb-8">
              <button
                type="button"
                onClick={handleReset}
                className="px-5 py-2.5 text-sm rounded transition-colors"
                style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
              >
                Clear
              </button>
              <button
                type="submit"
                className="px-8 py-2.5 text-sm font-semibold rounded"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                Generate Invoice
              </button>
            </div>
          </form>
        </div>

        {submitted && (
          <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="rounded-lg p-8 w-80 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="text-lg font-serif mb-1">Invoice Generated</h3>
              <p className="text-sm mb-5" style={{ color: 'var(--muted-foreground)' }}>Buyer profile saved · Added to filing register</p>
              <button onClick={handleReset} className="w-full py-2 text-sm font-semibold rounded" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                Create Another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
