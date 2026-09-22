// The Sample UI's building blocks, pulled out of the components that repeated
// them: section cards, labelled fields, stat tiles, the mini bars and the icon
// set. Everything reads its colour from the theme variables in `index.css`, so
// light mode needs no second implementation.

import { useEffect, useRef, useState } from 'react'

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// --- formatting -------------------------------------------------------------

export function fmt2(n: number): string {
  return (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmt3(n: number): string {
  return (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
}

export function fmt4(n: number): string {
  return (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
}

export function fmtInt(n: number): string {
  return (n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/** Compact money for headline tiles: 48,988.80 -> 49.0K */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toFixed(0)
}

export function fmtDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** `202609` -> `September 2026` */
export function monthLabel(yearMonth: string): string {
  if (!/^\d{6}$/.test(yearMonth)) return yearMonth
  const m = parseInt(yearMonth.slice(4), 10)
  if (m < 1 || m > 12) return yearMonth
  return `${MONTH_NAMES[m - 1]} ${yearMonth.slice(0, 4)}`
}

export function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** `202609` <-> the `YYYY-MM` an `<input type="month">` speaks. */
export const toMonthInput = (ym: string) => (ym.length === 6 ? `${ym.slice(0, 4)}-${ym.slice(4)}` : '')
export const fromMonthInput = (v: string) => v.replace('-', '')

// --- layout -----------------------------------------------------------------

export function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="p-6 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="pb-3 mb-5 flex items-end justify-between gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h3 className="text-base font-serif">{title}</h3>
          {subtitle && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{subtitle}</p>
          )}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

export function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>
        {label}
        {required && <span style={{ color: 'var(--primary)' }}> *</span>}
        {hint && <span className="ml-1 normal-case tracking-normal font-normal" style={{ opacity: 0.6 }}>({hint})</span>}
      </label>
      {children}
      {error && <span className="text-xs" style={{ color: '#e05252' }}>{error}</span>}
    </div>
  )
}

export function MonoInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 12, ...props.style }} />
}

/** A read-only box showing a value the backend derived, in the form's rhythm. */
export function Derived({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>
        {label} <span className="normal-case tracking-normal font-normal opacity-60">(computed)</span>
      </label>
      <div
        className="px-3 py-2 rounded"
        style={{
          background: 'var(--muted)',
          border: '1px solid var(--border)',
          fontFamily: 'var(--font-jetbrains)',
          fontSize: 12,
          minHeight: 35,
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="p-5 rounded flex flex-col gap-1" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)' }}>
        {label}
      </div>
      <div
        className="text-2xl font-semibold leading-tight"
        style={{ fontFamily: 'var(--font-jetbrains)', color: accent ? 'var(--primary)' : 'var(--foreground)' }}
      >
        {value}
      </div>
      {sub && <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{sub}</div>}
    </div>
  )
}

export function MiniBar({ pct, color = 'var(--primary)' }: { pct: number; color?: string }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--border)' }}>
      <div className="h-full rounded-full" style={{ width: Math.max(0, Math.min(100, pct)) + '%', background: color }} />
    </div>
  )
}

export function Panel({ width, children }: { width: number; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col shrink-0 overflow-hidden"
      style={{ width, borderRight: '1px solid var(--border)', background: 'var(--card)' }}
    >
      {children}
    </div>
  )
}

export function PanelHeader({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow: string
  title: string
  sub?: string
  children?: React.ReactNode
}) {
  return (
    <div className="px-4 py-4 shrink-0 flex flex-col gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div>
        <p className="text-xs tracking-widest uppercase mb-0.5" style={{ color: 'var(--primary)', fontFamily: 'var(--font-jetbrains)' }}>
          {eyebrow}
        </p>
        <h2 className="text-base font-serif font-light">{title}</h2>
        {sub && <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>{sub}</p>}
      </div>
      {children}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  sub,
  right,
}: {
  eyebrow: string
  title: string
  sub?: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-end justify-between mb-8 gap-4">
      <div>
        <p className="text-xs tracking-widest uppercase mb-1" style={{ color: 'var(--primary)', fontFamily: 'var(--font-jetbrains)' }}>
          {eyebrow}
        </p>
        <h1 className="text-3xl font-serif font-light">{title}</h1>
        {sub && <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function PrimaryButton({
  children,
  className = '',
  style,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={'px-5 py-2.5 text-sm font-semibold rounded disabled:opacity-40 ' + className}
      style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', ...style }}
    >
      {children}
    </button>
  )
}

export function GhostButton({
  children,
  className = '',
  style,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={'px-5 py-2.5 text-sm rounded transition-colors disabled:opacity-40 ' + className}
      style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)', ...style }}
    >
      {children}
    </button>
  )
}

export function Empty({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-20 text-center">
      <Icon name="file" size={30} style={{ color: 'var(--border)' }} />
      <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{title}</p>
      {sub && <p className="text-xs opacity-60" style={{ color: 'var(--muted-foreground)' }}>{sub}</p>}
      {action}
    </div>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }}
      />
      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
    </div>
  )
}

/** A transient message strip. Errors stay until dismissed; successes fade. */
export function Toast({ message, kind, onClose }: { message: string; kind: 'error' | 'ok'; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  // Every notification clears itself after 5 seconds, or the moment the user
  // clicks anywhere outside it — whichever comes first.
  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDocClick)
    }
  }, [kind, message, onClose])

  return (
    <div
      ref={ref}
      className="fixed bottom-5 left-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded text-sm"
      style={{
        transform: 'translateX(-50%)',
        background: kind === 'error' ? '#3a1a1a' : '#1a3a2a',
        border: `1px solid ${kind === 'error' ? '#5a2a2a' : '#2a5a3a'}`,
        color: kind === 'error' ? '#e89090' : '#7fd1a4',
        maxWidth: 560,
      }}
      role="status"
    >
      <span className="flex-1">{message}</span>
      <button onClick={onClose} style={{ color: 'inherit', opacity: 0.7 }} aria-label="Dismiss">
        <Icon name="close" size={11} />
      </button>
    </div>
  )
}

/** Confirmation for the two destructive actions in the app. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-lg p-7 w-96" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <h3 className="text-lg font-serif mb-2">{title}</h3>
        <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>{body}</p>
        <div className="flex gap-2">
          <GhostButton className="flex-1" onClick={onCancel}>Cancel</GhostButton>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 text-sm font-semibold rounded"
            style={{ background: '#7a2a2a', color: '#f3d5d5' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Debounce a value, so typing in the form does not fire a call per keystroke. */
export function useDebounced<T>(value: T, ms = 220): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/**
 * Hold a PDF blob URL for `load`, revoking the previous one. Returns `null`
 * while a fetch is in flight so the caller can show a spinner.
 */
export function usePdfPreview(load: (() => Promise<string>) | null, deps: unknown[]) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = useRef<string | null>(null)

  useEffect(() => {
    if (!load) {
      setUrl(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    load()
      .then((next) => {
        if (cancelled) {
          URL.revokeObjectURL(next)
          return
        }
        if (current.current) URL.revokeObjectURL(current.current)
        current.current = next
        setUrl(next)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current)
    },
    [],
  )

  return { url, loading, error }
}

// --- icons ------------------------------------------------------------------

const PATHS: Record<string, React.ReactNode> = {
  chart: (<><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>),
  file: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>),
  filePlus: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></>),
  fileText: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>),
  calendar: (<><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>),
  clock: (<><polyline points="12 8 12 12 14 14" /><path d="M3.05 11a9 9 0 1 0 .5-4H1" /><polyline points="1 3 1 7 5 7" /></>),
  mail: (<><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>),
  download: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>),
  check: <polyline points="20 6 9 17 4 12" />,
  close: (<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>),
  search: (<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>),
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
  users: (<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  anchor: (<><path d="M2 20h20" /><path d="M5 20V8l7-5 7 5v12" /></>),
  sun: (<><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></>),
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  edit: (<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></>),
  trash: (<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>),
  plus: (<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>),
  print: (<><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>),
  archive: (<><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></>),
}

export function Icon({
  name,
  size = 14,
  strokeWidth = 2,
  style,
}: {
  name: keyof typeof PATHS | string
  size?: number
  strokeWidth?: number
  style?: React.CSSProperties
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      aria-hidden
    >
      {PATHS[name] ?? PATHS.file}
    </svg>
  )
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      style={{
        transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 0.15s',
        color: 'var(--muted-foreground)',
        flexShrink: 0,
      }}
      aria-hidden
    >
      <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
