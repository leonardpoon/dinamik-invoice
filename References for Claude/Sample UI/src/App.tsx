import { useState, useEffect } from 'react';
import { useInvoiceStore } from './store';
import InvoiceForm from './components/InvoiceForm';
import Dashboard from './components/Dashboard';
import CurrentInvoices from './components/CurrentInvoices';
import InvoiceHistory from './components/InvoiceHistory';
import FilingReport from './components/FilingReport';
import SettingsPanel from './components/SettingsPanel';
import { loadSettings, saveSettings } from './utils/settings';
import type { AppSettings } from './utils/settings';
import type { Invoice } from './types';

type Tab = 'dashboard' | 'new' | 'current' | 'history' | 'filing';

// Apply saved theme before first render so there's no flash
const _initTheme = localStorage.getItem('theme') === 'light';
document.documentElement.classList.toggle('light', _initTheme);

const NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'dashboard',
    label: 'Analytics',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    id: 'new',
    label: 'New Invoice',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </svg>
    ),
  },
  {
    id: 'current',
    label: 'Current',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: 'history',
    label: 'History',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="12 8 12 12 14 14" />
        <path d="M3.05 11a9 9 0 1 0 .5-4H1" />
        <polyline points="1 3 1 7 5 7" />
      </svg>
    ),
  },
  {
    id: 'filing',
    label: 'Filing',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
];

function CreatedModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="rounded-lg p-8 w-80 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="text-xs tracking-widest uppercase mb-1" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)' }}>
          Invoice Generated
        </p>
        <h3 className="text-xl font-serif mb-1" style={{ color: 'var(--primary)' }}>{invoice.id}</h3>
        <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
          {invoice.firstVesselName} · {invoice.buyersName}
        </p>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm rounded"
            style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
          >
            Close
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm font-semibold rounded"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            New Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [formKey, setFormKey] = useState(0);
  const [justCreated, setJustCreated] = useState<Invoice | null>(null);
  const [light, setLight] = useState(() => localStorage.getItem('theme') === 'light');
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const { invoices, createInvoice } = useInvoiceStore();

  function handleSaveSettings(s: AppSettings) {
    saveSettings(s);
    setSettings(s);
  }

  useEffect(() => {
    document.documentElement.classList.toggle('light', light);
    localStorage.setItem('theme', light ? 'light' : 'dark');
  }, [light]);

  function toggleLight() {
    setLight(l => !l);
  }

  const now = new Date();
  const currentPrefix = `D${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
  const currentCount = invoices.filter(i => i.id.startsWith(currentPrefix)).length;

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--background)' }}>
      {/* Top nav */}
      <header
        className="flex items-center justify-between px-6 shrink-0"
        style={{ height: 52, background: 'var(--card)', borderBottom: '1px solid var(--border)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: 'var(--primary)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--primary-foreground)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 20h20" /><path d="M5 20V8l7-5 7 5v12" />
            </svg>
          </div>
          <span className="text-sm font-semibold font-serif tracking-wide">MarineInvoice</span>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-0.5">
          {NAV.map(n => {
            const isActive = tab === n.id;
            return (
              <button
                key={n.id}
                onClick={() => { if (n.id === 'new') setFormKey(k => k + 1); setTab(n.id); }}
                className="flex items-center gap-2 px-4 py-1.5 rounded text-sm transition-colors relative"
                style={{
                  background: isActive ? 'var(--secondary)' : 'transparent',
                  color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
                }}
              >
                {n.icon}
                <span className="font-medium">{n.label}</span>
                {n.id === 'current' && currentCount > 0 && (
                  <span
                    className="text-xs rounded-full px-1.5 leading-none py-0.5 font-semibold"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: 9 }}
                  >
                    {currentCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Status + theme toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)' }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#4caf7a' }} />
            {invoices.length} records
          </div>
          <button
            onClick={toggleLight}
            className="w-8 h-8 rounded flex items-center justify-center transition-colors"
            style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}
            title={light ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {light ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Main — full height below nav, settings sidebar sits alongside */}
      <main className="flex-1 overflow-hidden flex flex-row">
        {/* Tab content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {tab === 'dashboard' && (
            <div className="flex-1 overflow-auto">
              <Dashboard invoices={invoices} onNavigate={t => setTab(t as Tab)} />
            </div>
          )}

          {tab === 'new' && (
            <div className="flex-1 overflow-auto">
              <InvoiceForm
                key={formKey}
                onCreate={createInvoice}
                onCreated={inv => setJustCreated(inv)}
                settings={settings}
              />
            </div>
          )}

          {tab === 'current' && (
            <CurrentInvoices
              invoices={invoices}
              onNavigateNew={() => setTab('new')}
            />
          )}

          {tab === 'history' && (
            <InvoiceHistory invoices={invoices} />
          )}

          {tab === 'filing' && (
            <FilingReport invoices={invoices} />
          )}
        </div>

        {/* Persistent settings sidebar */}
        <SettingsPanel settings={settings} onSave={handleSaveSettings} />
      </main>

      {justCreated && (
        <CreatedModal
          invoice={justCreated}
          onClose={() => { setJustCreated(null); }}
        />
      )}
    </div>
  );
}
