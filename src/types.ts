// Mirrors the serde shapes in `src-tauri/src/models.rs`. Rust owns every
// derived figure, so anything computed (containers, tonnage, amounts, profit)
// is read-only here — the form sends inputs and renders what comes back.

export type CostCategory = 'PORT' | 'TRANSPORT' | 'MISC'
export type CostBasis = 'PER_CONTAINER' | 'PER_BOX' | 'PER_MT' | 'FLAT'
/** The customer-facing charge is identical either way; only which rate card
 * seeds the accountant-only cost lines differs. */
export type ShipmentType = 'CONTAINER' | 'BREAKBULK'
export type NoteStatus = 'issued' | 'filed'

export const COST_CATEGORIES: CostCategory[] = ['PORT', 'TRANSPORT', 'MISC']

export const CATEGORY_LABEL: Record<CostCategory, string> = {
  PORT: 'Port Charges',
  TRANSPORT: 'Transport',
  MISC: 'Misc',
}

export const BASIS_LABEL: Record<CostBasis, string> = {
  PER_CONTAINER: 'per container',
  PER_BOX: 'per box',
  PER_MT: 'per M/Ton',
  FLAT: 'flat',
}

export interface Settings {
  companyName: string
  addressLine: string
  registrationNo: string
  paymentLine1: string
  paymentLine2: string
  signatoryName: string
  signatoryTitle: string
  coverLetterIntro: string
  defaultPackingDesc: string
  defaultProductDesc: string
  defaultBoxesPerContainer: number
  defaultMtPerContainer: number
  defaultChargeDesc: string
  defaultRatePerMt: number
  defaultCurrency: string
  email: string
  /** The cover letter's own two "sticky" fields — last customer and addressee. */
  coverLetterCustomerId: number | null
  coverLetterAttnName: string
}

export interface Customer {
  id: number
  name: string
  addressLine1: string
  addressLine2: string
  addressLine3: string
  addressLine4: string
  addressLine5: string
  attention: string
  active: boolean
}

export interface RateDefault {
  id: number
  shipmentType: ShipmentType
  category: CostCategory
  code: string
  label: string
  basis: CostBasis
  rate: number
  sortOrder: number
  active: boolean
}

export interface CostLine {
  category: CostCategory
  code: string
  label: string
  basis: CostBasis
  rate: number
  amount: number
  sortOrder: number
}

export interface Preset {
  id: number
  customerId: number | null
  buyerName: string
  destination: string
  siNumber: string
  productDesc: string
  packingDesc: string
  currency: string
  ratePerMt: number
  boxesPerContainer: number
  mtPerContainer: number
  contractNo: string
  boxes: number
  oceanVessel: string
  oceanVoyage: string
}

/** A saved cover letter, with the DN numbers it enclosed. */
export interface CoverLetterSummary {
  id: number
  customerId: number
  customerName: string
  attnName: string
  letterDate: string
  createdAt: string
  dnNumbers: string[]
}

/** A prior note's feeder call, offered back when the vessel + voyage match. */
export interface FeederMatch {
  feederArrivalDate: string
  blPrefix: string
}

/** A prior note's outward call, offered back when the outward vessel +
 * voyage match. */
export interface OutwardMatch {
  blDate: string
  destination: string
}

/** What the form sends. Everything derived is absent by design. */
export interface DebitNoteInput {
  dnNumber: string
  yearMonth: string
  dnDate: string
  customerId: number
  buyerName: string
  customerInvoiceRef: string
  siNumber: string
  contractNo: string
  boxes: number
  packingDesc: string
  boxesPerContainer: number
  mtPerContainer: number
  productDesc: string
  shipmentType: ShipmentType
  feederVessel: string
  feederVoyage: string
  feederArrivalDate: string
  blNumber: string
  /** e.g. `153/26`, beside "Your Invoice No." */
  pNumber: string
  /** The free-text box beside the P No. (e.g. `Riverside Estate`) */
  pDescriptor: string
  oceanVessel: string
  oceanVoyage: string
  destination: string
  blDate: string
  chargeDesc: string
  currency: string
  ratePerMt: number
  costs?: CostLine[] | null
  remarks: string
}

export interface DebitNote extends Omit<DebitNoteInput, 'costs'> {
  id: number
  runningNo: number
  status: NoteStatus
  filedAt: string | null
  customer: Customer
  containers: number
  tonnage: number
  chargeAmount: number
  totalAmount: number
  amountInWords: string
  costs: CostLine[]
  costPort: number
  costTransport: number
  costMisc: number
  totalCost: number
  profit: number
  createdAt: string
  updatedAt: string
}

export interface DebitNoteSummary {
  id: number
  dnNumber: string
  yearMonth: string
  dnDate: string
  status: NoteStatus
  customerName: string
  buyerName: string
  customerInvoiceRef: string
  siNumber: string
  contractNo: string
  blNumber: string
  pNumber: string
  feederVessel: string
  oceanVessel: string
  destination: string
  productDesc: string
  shipmentType: ShipmentType
  boxes: number
  containers: number
  tonnage: number
  currency: string
  totalAmount: number
  totalCost: number
  profit: number
}

export interface CostSummary {
  lines: CostLine[]
  port: number
  transport: number
  misc: number
  totalCost: number
  profit: number
}

/** Live figures for the form, priced by the same Rust code that stores them. */
export interface Preview {
  containers: number
  tonnage: number
  chargeAmount: number
  totalAmount: number
  amountInWords: string
  costs: CostSummary
}

export interface MonthStat {
  yearMonth: string
  label: string
  count: number
  tonnage: number
  revenue: number
  cost: number
  profit: number
}

export interface NameStat {
  name: string
  count: number
  tonnage: number
  revenue: number
  profit: number
}

export interface Analytics {
  totalNotes: number
  totalTonnage: number
  totalRevenue: number
  totalCost: number
  totalProfit: number
  months: MonthStat[]
  buyers: NameStat[]
  vessels: NameStat[]
  destinations: NameStat[]
  products: NameStat[]
}

/** One currency's revenue/cost/profit breakdown, for the director's Analytics
 * tab. Kept separate per currency rather than blended — a SGD + USD total
 * would just be wrong, not approximate. */
export interface CurrencyAnalytics {
  currency: string
  totalNotes: number
  totalTonnage: number
  totalRevenue: number
  totalCost: number
  totalProfit: number
  months: MonthStat[]
  buyers: NameStat[]
}

export interface DirectorAnalytics {
  currencies: CurrencyAnalytics[]
}

export const emptyCustomer = (): Customer => ({
  id: 0,
  name: '',
  addressLine1: '',
  addressLine2: '',
  addressLine3: '',
  addressLine4: '',
  addressLine5: '',
  attention: '',
  active: true,
})
