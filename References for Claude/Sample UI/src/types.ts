export type InvoiceStatus = 'issued' | 'filed';

export interface Invoice {
  // System-generated
  id: string;              // D202609-01 (filing reference)
  sequenceNumber: number;
  issueDate: string;
  status: InvoiceStatus;
  filed: boolean;
  filedAt?: string;
  notes: string;

  // User-entered: core
  debitNumber: string;     // DN202609-01 (composed: DN + YYYYMM + seq)
  invoiceNumber: string;   // free-text invoice number entered by user
  buyersName: string;
  siNumber: string;        // SI Number

  // Cargo
  grade: string;
  metricTonnes: number;
  unitConversionFactor: number;  // MT / factor = units (e.g. 1.26)
  units: number;                 // derived: metricTonnes / unitConversionFactor

  // Financial
  fixedRate: number;   // rate per MT
  totalRate: number;   // derived: metricTonnes * fixedRate
  currency: string;

  // First carrier
  firstVesselName: string;
  firstVoyageNumber: string;
  arrivalDate: string;

  // Bill of Lading
  blNumber: string;
  blDated: string;

  // Outward
  outwardVesselName: string;
  outwardVoyageNumber: string;
  destination: string;
}

export type InvoiceFormData = Omit<Invoice, 'id' | 'sequenceNumber' | 'issueDate' | 'units' | 'totalRate' | 'filed' | 'filedAt' | 'status'>;
