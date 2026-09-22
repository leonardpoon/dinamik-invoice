import { useState, useEffect } from 'react';
import type { AppSettings } from '../utils/settings';
import CurrencySelect from './CurrencySelect';

interface Props {
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-xs tracking-widest uppercase font-semibold shrink-0" style={{ color: 'var(--primary)', fontFamily: 'var(--font-jetbrains)' }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
    </div>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {sub && <div className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPanel({ settings, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AppSettings>({ ...settings });
  const [saved, setSaved] = useState(false);

  // Sync draft when settings change externally
  useEffect(() => { setDraft({ ...settings }); }, [settings]);

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave() {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div
      className="flex-col shrink-0 overflow-hidden transition-all duration-200"
      style={{
        width: open ? 320 : 40,
        borderLeft: '1px solid var(--border)',
        background: open ? 'var(--card)' : 'transparent',
        display: 'flex',
      }}
    >
      {/* Collapsed strip — always visible */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-3 w-full transition-colors"
          style={{ color: '#f97316' }}
          title="Open settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span
            className="text-xs font-semibold tracking-widest uppercase select-none"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.12em' }}
          >
            Settings
          </span>
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <p className="text-xs tracking-widest uppercase" style={{ color: 'var(--primary)', fontFamily: 'var(--font-jetbrains)', fontSize: 9 }}>Configuration</p>
              <h3 className="text-sm font-serif font-light mt-0.5">Settings</h3>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded flex items-center justify-center"
              style={{ color: 'var(--muted-foreground)', background: 'var(--secondary)' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto px-4 py-5 flex flex-col gap-5">
            <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
              Pre-fills every new invoice. Override per invoice as needed.
            </p>

            <Divider label="Cargo" />

            <Row label="Unit Conversion Factor" sub="MT ÷ factor = units">
              <input
                type="number"
                min={0.0001}
                step={0.0001}
                value={draft.defaultUnitConversionFactor}
                onChange={e => set('defaultUnitConversionFactor', parseFloat(e.target.value) || 1)}
                style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 12 }}
              />
              <div className="text-xs px-0.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)', fontSize: 10 }}>
                ÷ {draft.defaultUnitConversionFactor}
              </div>
            </Row>

            <Divider label="Financials" />

            <Row label="Default Currency">
              <CurrencySelect
                value={draft.defaultCurrency}
                onChange={v => set('defaultCurrency', v)}
              />
            </Row>

            <Row label="Fixed Rate / MT">
              <div className="flex items-center" style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                <span
                  className="px-2 py-2 text-xs font-semibold shrink-0"
                  style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--muted-foreground)', background: 'var(--secondary)', borderRight: '1px solid var(--border)' }}
                >
                  {draft.defaultCurrency}
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={draft.defaultFixedRate}
                  onChange={e => set('defaultFixedRate', parseFloat(e.target.value) || 0)}
                  style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 12, border: 'none', borderRadius: 0, background: 'transparent', flex: 1, minWidth: 0 }}
                />
                <span className="px-2 text-xs shrink-0" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)' }}>/MT</span>
              </div>
            </Row>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
            <button
              onClick={handleSave}
              className="w-full py-2 text-xs font-semibold rounded flex items-center justify-center gap-2 transition-all"
              style={{
                background: saved ? '#1a3a2a' : 'var(--primary)',
                color: saved ? '#4caf7a' : 'var(--primary-foreground)',
                border: saved ? '1px solid #2a5a3a' : 'none',
              }}
            >
              {saved ? (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Saved
                </>
              ) : 'Save Defaults'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
