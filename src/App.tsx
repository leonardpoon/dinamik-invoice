// The Sample UI's shell: one top bar, five tabs, a persistent settings rail.
//
// The Cover Letter tab is the addition — it is the second sheet of the workbook
// this app replaces, so it belongs alongside the notes rather than hidden in a
// menu.

import { useCallback, useEffect, useState } from 'react'

import { api, errorMessage } from './api'
import Analytics from './components/Analytics'
import CoverLetter from './components/CoverLetter'
import Current from './components/Current'
import Filing from './components/Filing'
import History from './components/History'
import NoteForm from './components/NoteForm'
import SettingsPanel from './components/SettingsPanel'
import UpdateChecker from './components/UpdateChecker'
import { useStore } from './store'
import type { DebitNote, DebitNoteSummary } from './types'
import { ConfirmDialog, Icon, Spinner, Toast, currentYearMonth } from './ui'

type Tab = 'dashboard' | 'new' | 'current' | 'history' | 'filing' | 'cover'

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Analytics', icon: 'chart' },
  { id: 'new', label: 'Create Debit Note', icon: 'filePlus' },
  { id: 'current', label: 'Current', icon: 'calendar' },
  { id: 'history', label: 'History', icon: 'clock' },
  { id: 'filing', label: 'Filing', icon: 'fileText' },
  { id: 'cover', label: 'Cover Letter', icon: 'mail' },
]

// Applied before first paint so the window never flashes the wrong theme.
document.documentElement.classList.toggle('light', localStorage.getItem('theme') === 'light')

export default function App() {
  const store = useStore()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [formKey, setFormKey] = useState(0)
  const [editing, setEditing] = useState<DebitNote | null>(null)
  const [created, setCreated] = useState<{ id: number; dnNumber: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<DebitNoteSummary | null>(null)
  const [toast, setToast] = useState<{ message: string; kind: 'error' | 'ok' } | null>(null)
  const [light, setLight] = useState(() => localStorage.getItem('theme') === 'light')

  useEffect(() => {
    document.documentElement.classList.toggle('light', light)
    localStorage.setItem('theme', light ? 'light' : 'dark')
  }, [light])

  const notify = useCallback((message: string, kind: 'error' | 'ok') => {
    setToast({ message, kind })
  }, [])

  const goNew = useCallback(() => {
    setEditing(null)
    setFormKey((k) => k + 1)
    setTab('new')
  }, [])

  const startEdit = useCallback(
    async (id: number) => {
      try {
        const note = await api.getNote(id)
        setEditing(note)
        setFormKey((k) => k + 1)
        setTab('new')
      } catch (e) {
        notify(errorMessage(e), 'error')
      }
    },
    [notify],
  )

  async function doDelete() {
    if (!confirmDelete) return
    const note = confirmDelete
    setConfirmDelete(null)
    try {
      await store.deleteNote(note.id)
      notify(`${note.dnNumber} deleted`, 'ok')
    } catch (e) {
      notify(errorMessage(e), 'error')
    }
  }

  const currentCount = store.notes.filter((n) => n.yearMonth === currentYearMonth()).length
  const unfiled = store.notes.filter((n) => n.status !== 'filed').length

  if (!store.ready) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--background)' }}>
        <Spinner label="Opening the register…" />
      </div>
    )
  }

  if (store.loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 px-10 text-center" style={{ background: 'var(--background)' }}>
        <Icon name="file" size={40} strokeWidth={1} style={{ color: '#e05252' }} />
        <p className="text-base">The register could not be opened</p>
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{store.loadError}</p>
        <button
          onClick={() => void store.reload()}
          className="px-5 py-2.5 text-sm font-semibold rounded"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--background)' }}>
      <header
        className="flex items-center justify-between px-6 shrink-0 gap-6"
        style={{ height: 52, background: 'var(--card)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            <Icon name="anchor" size={13} strokeWidth={2.5} />
          </div>
          <span className="text-sm font-semibold font-serif tracking-wide">Dinamik Invoice</span>
        </div>

        <nav className="flex items-center gap-0.5">
          {NAV.map((n) => {
            const active = tab === n.id
            const badge =
              n.id === 'current' && currentCount > 0
                ? currentCount
                : n.id === 'filing' && unfiled > 0
                  ? unfiled
                  : null
            return (
              <button
                key={n.id}
                onClick={() => {
                  if (n.id === 'new') {
                    goNew()
                    return
                  }
                  setTab(n.id)
                }}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded text-sm transition-colors"
                style={{
                  background: active ? 'var(--secondary)' : 'transparent',
                  color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
                }}
              >
                <Icon name={n.icon} size={15} strokeWidth={1.8} />
                <span className="font-medium">{n.label}</span>
                {badge !== null && (
                  <span
                    className="rounded-full px-1.5 leading-none py-0.5 font-semibold"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: 9 }}
                  >
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <UpdateChecker notify={notify} />
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)' }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#4caf7a' }} />
            {store.notes.length} records
          </div>
          <button
            onClick={() => setLight((l) => !l)}
            className="w-8 h-8 rounded flex items-center justify-center transition-colors"
            style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}
            title={light ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            <Icon name={light ? 'moon' : 'sun'} size={15} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-row">
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {tab === 'dashboard' && (
            <div className="flex-1 min-w-0 overflow-auto">
              <Analytics
                notes={store.notes}
                onNew={goNew}
                onOpenCurrent={() => setTab('current')}
                onEdit={startEdit}
              />
            </div>
          )}

          {tab === 'new' && (
            <NoteForm
              key={formKey}
              store={store}
              editing={editing ?? undefined}
              notify={notify}
              onCancel={() => {
                setEditing(null)
                setTab('current')
              }}
              onSaved={(id, dnNumber) => {
                if (editing) {
                  setEditing(null)
                  notify(`${dnNumber} updated`, 'ok')
                  setTab('current')
                } else {
                  setCreated({ id, dnNumber })
                }
              }}
            />
          )}

          {tab === 'current' && (
            <Current store={store} onEdit={startEdit} onNew={goNew} onDelete={setConfirmDelete} notify={notify} />
          )}

          {tab === 'history' && <History store={store} onEdit={startEdit} onDelete={setConfirmDelete} notify={notify} />}

          {tab === 'filing' && <Filing store={store} notify={notify} />}

          {tab === 'cover' && <CoverLetter store={store} notify={notify} />}
        </div>

        <SettingsPanel store={store} notify={notify} />
      </main>

      {created && (
        <CreatedModal
          dnNumber={created.dnNumber}
          onAnother={() => {
            setCreated(null)
            goNew()
          }}
          onView={() => {
            setCreated(null)
            setTab('current')
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${confirmDelete.dnNumber}?`}
          body="The debit note and its costing lines are removed from the register. This cannot be undone, and the running number is not reused."
          confirmLabel="Delete"
          onConfirm={() => void doDelete()}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </div>
  )
}

function CreatedModal({
  dnNumber,
  onAnother,
  onView,
}: {
  dnNumber: string
  onAnother: () => void
  onView: () => void
}) {
  // Disappears on its own after 5 seconds, same as the toast notifications —
  // viewing the new note is the more useful default than sitting on "New".
  useEffect(() => {
    const t = setTimeout(onView, 5000)
    return () => clearTimeout(t)
  }, [onView])

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onView()
      }}
    >
      <div className="rounded-lg p-8 w-80 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)' }}
        >
          <Icon name="check" size={22} strokeWidth={2.5} />
        </div>
        <p className="text-xs tracking-widest uppercase mb-1" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-jetbrains)' }}>
          Debit Note Created
        </p>
        <h3 className="text-xl font-serif mb-1" style={{ color: 'var(--primary)' }}>{dnNumber}</h3>
        <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
          Buyer profile saved · added to the filing register
        </p>
        <div className="flex gap-2">
          <button
            onClick={onView}
            className="flex-1 py-2 text-sm rounded"
            style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
          >
            View &amp; print
          </button>
          <button
            onClick={onAnother}
            className="flex-1 py-2 text-sm font-semibold rounded"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            New note
          </button>
        </div>
      </div>
    </div>
  )
}
