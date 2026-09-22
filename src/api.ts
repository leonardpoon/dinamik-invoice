// The only place the app talks to Rust.
//
// Every call is a `invoke` of a command registered in `src-tauri/src/lib.rs`.
// PDFs arrive as base64 and are turned into blob URLs here, so the components
// that show them never have to know where the bytes came from.

import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'

import type {
  Analytics,
  CostLine,
  Customer,
  DebitNote,
  DebitNoteInput,
  DebitNoteSummary,
  Preset,
  Preview,
  RateDefault,
  Settings,
} from './types'

export const api = {
  getSettings: () => invoke<Settings>('get_settings'),
  saveSettings: (settings: Settings) => invoke<Settings>('save_settings', { settings }),

  listCustomers: () => invoke<Customer[]>('list_customers'),
  saveCustomer: (customer: Customer) => invoke<number>('save_customer', { customer }),
  deleteCustomer: (id: number) => invoke<void>('delete_customer', { id }),

  getRateCard: () => invoke<RateDefault[]>('get_rate_card'),
  saveRateCard: (lines: RateDefault[]) => invoke<RateDefault[]>('save_rate_card', { lines }),

  listPresets: () => invoke<Preset[]>('list_presets'),
  savePreset: (preset: Preset) => invoke<Preset[]>('save_preset', { preset }),
  deletePreset: (id: number) => invoke<Preset[]>('delete_preset', { id }),

  listNotes: () => invoke<DebitNoteSummary[]>('list_notes'),
  getNote: (id: number) => invoke<DebitNote>('get_note', { id }),
  nextDnNumber: (yearMonth: string) => invoke<string>('next_dn_number', { yearMonth }),
  createNote: (input: DebitNoteInput) => invoke<DebitNote>('create_note', { input }),
  updateNote: (id: number, input: DebitNoteInput) => invoke<DebitNote>('update_note', { id, input }),
  deleteNote: (id: number) => invoke<void>('delete_note', { id }),
  setNoteFiled: (id: number, filed: boolean) => invoke<DebitNote>('set_note_filed', { id, filed }),

  previewFigures: (input: {
    boxes: number
    boxesPerContainer: number
    mtPerContainer: number
    ratePerMt: number
    /** Omit to price with the current rate card; pass lines to override it. */
    costs?: CostLine[]
  }) => invoke<Preview>('preview_figures', { input }),

  analytics: (yearMonth?: string) => invoke<Analytics>('analytics', { yearMonth: yearMonth ?? null }),

  notePdf: (id: number) => invoke<string>('note_pdf', { id }),
  notePdfCopy: (id: number, copy: 'customer' | 'accountant') =>
    invoke<string>('note_pdf_copy', { id, copy }),
  filingReportPdf: (yearMonth: string) => invoke<string>('filing_report_pdf', { yearMonth }),
  coverLetterPdf: (customerId: number, yearMonth: string, attnName: string, letterDate?: string) =>
    invoke<string>('cover_letter_pdf', { customerId, yearMonth, attnName, letterDate: letterDate ?? null }),
}

/** base64 -> a blob URL an `<iframe>` can render. Caller revokes it. */
export function pdfUrl(base64: string): string {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
}

/**
 * Ask where to put the file, write it, then open it in the system viewer.
 * Returns false when the user dismissed the dialog.
 */
export async function savePdf(base64: string, suggestedName: string): Promise<boolean> {
  const path = await save({
    defaultPath: suggestedName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!path) return false
  await invoke<string>('save_pdf', { path, dataBase64: base64 })
  // Opening it is the point of pressing Download — otherwise the file lands
  // somewhere and the user has to go find it.
  try {
    await openPath(path)
  } catch {
    // A PC with no PDF handler is not a failed save.
  }
  return true
}

/** Turn whatever Rust threw into a line the UI can show. */
export function errorMessage(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return String(e)
}
