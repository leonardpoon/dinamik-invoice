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
  CoverLetterSummary,
  Customer,
  DebitNote,
  DebitNoteInput,
  DebitNoteSummary,
  DirectorAnalytics,
  FeederMatch,
  Preset,
  Preview,
  RateDefault,
  Settings,
  ShipmentType,
} from './types'

export const api = {
  getSettings: () => invoke<Settings>('get_settings'),
  saveSettings: (settings: Settings) => invoke<Settings>('save_settings', { settings }),

  listCustomers: () => invoke<Customer[]>('list_customers'),
  saveCustomer: (customer: Customer) => invoke<number>('save_customer', { customer }),
  deleteCustomer: (id: number) => invoke<void>('delete_customer', { id }),

  getRateCard: (shipmentType: ShipmentType) => invoke<RateDefault[]>('get_rate_card', { shipmentType }),
  saveRateCard: (shipmentType: ShipmentType, lines: RateDefault[]) =>
    invoke<RateDefault[]>('save_rate_card', { shipmentType, lines }),

  listPresets: () => invoke<Preset[]>('list_presets'),
  savePreset: (preset: Preset) => invoke<Preset[]>('save_preset', { preset }),
  deletePreset: (id: number) => invoke<Preset[]>('delete_preset', { id }),

  listNotes: () => invoke<DebitNoteSummary[]>('list_notes'),
  getNote: (id: number) => invoke<DebitNote>('get_note', { id }),
  nextDnNumber: (yearMonth: string) => invoke<string>('next_dn_number', { yearMonth }),
  feederMatch: (feederVessel: string, feederVoyage: string, excludeId?: number) =>
    invoke<FeederMatch | null>('feeder_match', { feederVessel, feederVoyage, excludeId: excludeId ?? null }),
  createNote: (input: DebitNoteInput) => invoke<DebitNote>('create_note', { input }),
  updateNote: (id: number, input: DebitNoteInput) => invoke<DebitNote>('update_note', { id, input }),
  deleteNote: (id: number) => invoke<void>('delete_note', { id }),
  setNoteFiled: (id: number, filed: boolean) => invoke<DebitNote>('set_note_filed', { id, filed }),

  previewFigures: (input: {
    boxes: number
    boxesPerContainer: number
    mtPerContainer: number
    ratePerMt: number
    shipmentType: ShipmentType
    /** Omit to price with the current rate card; pass lines to override it. */
    costs?: CostLine[]
  }) => invoke<Preview>('preview_figures', { input }),

  analytics: (yearMonth?: string) => invoke<Analytics>('analytics', { yearMonth: yearMonth ?? null }),
  directorAnalytics: () => invoke<DirectorAnalytics>('director_analytics'),
  overviewReportPdf: (yearMonth?: string) => invoke<string>('overview_report_pdf', { yearMonth: yearMonth ?? null }),
  directorReportPdf: (currency: string) => invoke<string>('director_report_pdf', { currency }),

  notePdf: (id: number) => invoke<string>('note_pdf', { id }),
  notePdfCopy: (id: number, copy: 'customer' | 'accountant') =>
    invoke<string>('note_pdf_copy', { id, copy }),
  filingReportPdf: (yearMonth: string, noteIds: number[]) =>
    invoke<string>('filing_report_pdf', { yearMonth, noteIds }),

  coverLetterEligibleNotes: (customerId: number) =>
    invoke<DebitNoteSummary[]>('cover_letter_eligible_notes', { customerId }),
  coverLetterPreviewPdf: (customerId: number, noteIds: number[], attnName: string, letterDate?: string) =>
    invoke<string>('cover_letter_preview_pdf', { customerId, noteIds, attnName, letterDate: letterDate ?? null }),
  saveCoverLetter: (customerId: number, noteIds: number[], attnName: string, letterDate?: string) =>
    invoke<string>('save_cover_letter', { customerId, noteIds, attnName, letterDate: letterDate ?? null }),
  listCoverLetters: () => invoke<CoverLetterSummary[]>('list_cover_letters'),
  coverLetterPdfById: (id: number) => invoke<string>('cover_letter_pdf_by_id', { id }),
  deleteCoverLetter: (id: number) => invoke<void>('delete_cover_letter', { id }),
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
