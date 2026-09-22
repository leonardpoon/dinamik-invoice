import { useState, useCallback } from 'react';
import type { Invoice, InvoiceFormData } from './types';

const STORAGE_KEY = 'maritime_invoices_v2';

function generateInvoiceId(year: number, month: number, seq: number): string {
  const mm = String(month).padStart(2, '0');
  const nn = String(seq).padStart(2, '0');
  return 'D' + year + mm + '-' + nn;
}

function getNextSequence(invoices: Invoice[], year: number, month: number): number {
  const prefix = 'D' + year + String(month).padStart(2, '0') + '-';
  const existing = invoices
    .filter(inv => inv.id.startsWith(prefix))
    .map(inv => parseInt(inv.id.replace(prefix, ''), 10))
    .filter(n => !isNaN(n));
  return existing.length > 0 ? Math.max(...existing) + 1 : 1;
}

function loadFromStorage(): Invoice[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(invoices: Invoice[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
}

export function useInvoiceStore() {
  const [invoices, setInvoices] = useState<Invoice[]>(loadFromStorage);

  const persist = useCallback((next: Invoice[]) => {
    setInvoices(next);
    saveToStorage(next);
  }, []);

  const createInvoice = useCallback((data: InvoiceFormData): Invoice => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const seq = getNextSequence(invoices, year, month);

    const units = data.unitConversionFactor > 0
      ? parseFloat((data.metricTonnes / data.unitConversionFactor).toFixed(4))
      : 0;
    const totalRate = parseFloat((data.metricTonnes * data.fixedRate).toFixed(2));

    const invoice: Invoice = {
      ...data,
      id: generateInvoiceId(year, month, seq),
      sequenceNumber: seq,
      issueDate: now.toISOString().split('T')[0],
      units,
      totalRate,
      status: 'issued',
      filed: false,
    };
    persist([...invoices, invoice]);
    return invoice;
  }, [invoices, persist]);

  const toggleFiled = useCallback((id: string) => {
    persist(invoices.map(inv =>
      inv.id === id
        ? {
            ...inv,
            filed: !inv.filed,
            filedAt: !inv.filed ? new Date().toISOString() : undefined,
            status: (!inv.filed ? 'filed' : 'issued') as Invoice['status'],
          }
        : inv
    ));
  }, [invoices, persist]);

  const deleteInvoice = useCallback((id: string) => {
    persist(invoices.filter(inv => inv.id !== id));
  }, [invoices, persist]);

  return { invoices, createInvoice, toggleFiled, deleteInvoice };
}
