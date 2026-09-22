// Replaces the Sample UI's `localStorage` store.
//
// The whole register is small — one shipping agent's monthly paperwork — so it
// is loaded once and kept in memory; every mutation goes through Rust and then
// refreshes from it, which keeps the UI and the database from disagreeing.

import { useCallback, useEffect, useState } from 'react'

import { api, errorMessage } from './api'
import type {
  Customer,
  DebitNoteInput,
  DebitNoteSummary,
  Preset,
  RateDefault,
  Settings,
} from './types'

export interface Store {
  ready: boolean
  loadError: string | null

  settings: Settings | null
  customers: Customer[]
  rateCard: RateDefault[]
  presets: Preset[]
  notes: DebitNoteSummary[]

  reload: () => Promise<void>
  saveSettings: (s: Settings) => Promise<void>
  saveCustomer: (c: Customer) => Promise<number>
  deleteCustomer: (id: number) => Promise<void>
  saveRateCard: (lines: RateDefault[]) => Promise<void>
  savePreset: (p: Preset) => Promise<void>
  deletePreset: (id: number) => Promise<void>
  createNote: (input: DebitNoteInput) => Promise<DebitNoteSummary>
  updateNote: (id: number, input: DebitNoteInput) => Promise<void>
  deleteNote: (id: number) => Promise<void>
  setFiled: (id: number, filed: boolean) => Promise<void>
}

export function useStore(): Store {
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [rateCard, setRateCard] = useState<RateDefault[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [notes, setNotes] = useState<DebitNoteSummary[]>([])

  const reload = useCallback(async () => {
    try {
      const [s, c, r, p, n] = await Promise.all([
        api.getSettings(),
        api.listCustomers(),
        api.getRateCard(),
        api.listPresets(),
        api.listNotes(),
      ])
      setSettings(s)
      setCustomers(c)
      setRateCard(r)
      setPresets(p)
      setNotes(n)
      setLoadError(null)
    } catch (e) {
      setLoadError(errorMessage(e))
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const refreshNotes = useCallback(async () => {
    setNotes(await api.listNotes())
  }, [])

  return {
    ready,
    loadError,
    settings,
    customers,
    rateCard,
    presets,
    notes,

    reload,

    saveSettings: async (s) => {
      setSettings(await api.saveSettings(s))
    },

    saveCustomer: async (c) => {
      const id = await api.saveCustomer(c)
      setCustomers(await api.listCustomers())
      // A renamed customer shows on every one of its notes.
      await refreshNotes()
      return id
    },

    deleteCustomer: async (id) => {
      await api.deleteCustomer(id)
      setCustomers(await api.listCustomers())
    },

    saveRateCard: async (lines) => {
      setRateCard(await api.saveRateCard(lines))
    },

    savePreset: async (p) => {
      setPresets(await api.savePreset(p))
    },

    deletePreset: async (id) => {
      setPresets(await api.deletePreset(id))
    },

    createNote: async (input) => {
      const created = await api.createNote(input)
      const fresh = await api.listNotes()
      setNotes(fresh)
      const summary = fresh.find((n) => n.id === created.id)
      if (!summary) throw new Error('The debit note was saved but could not be read back')
      return summary
    },

    updateNote: async (id, input) => {
      await api.updateNote(id, input)
      await refreshNotes()
    },

    deleteNote: async (id) => {
      await api.deleteNote(id)
      await refreshNotes()
    },

    setFiled: async (id, filed) => {
      await api.setNoteFiled(id, filed)
      await refreshNotes()
    },
  }
}
