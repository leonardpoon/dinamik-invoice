import type jsPDFType from 'jspdf';
import type { Invoice } from '../types';

const DARK = '#0d0f14';
const GOLD = '#c9a84c';
const LIGHT = '#e8e6e0';
const MUTED = '#6b6760';
const BORDER = '#252830';
const CARD = '#13161e';

function fmtDate(d: string): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtNum(n: number, dec = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function drawInvoice(doc: jsPDFType, invoice: Invoice, copyType: 'CUSTOMER COPY' | 'ACCOUNTANT COPY') {
  const W = 210;
  const H = 297;
  const L = 15;
  const R = W - L;

  // Background
  doc.setFillColor(DARK);
  doc.rect(0, 0, W, H, 'F');

  // Header
  doc.setFillColor(CARD);
  doc.rect(0, 0, W, 46, 'F');
  doc.setFillColor(GOLD);
  doc.rect(0, 0, 4, 46, 'F');
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.3);
  doc.line(0, 46, W, 46);

  // Invoice number (user's DN number)
  doc.setFont('courier', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(GOLD);
  doc.text(invoice.debitNumber || invoice.id, L + 8, 18);

  // Filing ID
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED);
  const refLine = 'Filing Ref: ' + invoice.id
    + (invoice.invoiceNumber ? '   Inv: ' + invoice.invoiceNumber : '')
    + '   Issued: ' + fmtDate(invoice.issueDate);
  doc.text(refLine, L + 8, 25);

  // Buyer
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(LIGHT);
  doc.text(invoice.buyersName, L + 8, 33);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED);
  doc.text('SI: ' + (invoice.siNumber || '—'), L + 8, 39);

  // Copy type badge
  const badgeBg = copyType === 'CUSTOMER COPY' ? '#1a3a2a' : '#1a1d27';
  const badgeFg = copyType === 'CUSTOMER COPY' ? '#4caf7a' : GOLD;
  doc.setFillColor(badgeBg);
  doc.roundedRect(R - 38, 28, 38, 10, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(badgeFg);
  doc.text(copyType, R - 19, 34.5, { align: 'center' });

  let y = 54;

  // Two-col meta helper
  function metaBlock(x: number, label: string, value: string, maxW = 85): number {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(MUTED);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(LIGHT);
    const lines = doc.splitTextToSize(value || '—', maxW);
    doc.text(lines, x, y + 5);
    return lines.length * 4.5 + 5;
  }

  const col1 = L;
  const col2 = W / 2 + 4;

  const h1 = metaBlock(col1, 'First Carrier Vessel', invoice.firstVesselName + (invoice.firstVoyageNumber ? '  Voy. ' + invoice.firstVoyageNumber : ''));
  const h2 = metaBlock(col2, 'Arrival Date', fmtDate(invoice.arrivalDate));
  y += Math.max(h1, h2) + 5;

  const h3 = metaBlock(col1, 'B/L Number', invoice.blNumber);
  const h4 = metaBlock(col2, 'B/L Dated', fmtDate(invoice.blDated));
  y += Math.max(h3, h4) + 5;

  const h5 = metaBlock(col1, 'Outward Vessel', invoice.outwardVesselName + (invoice.outwardVoyageNumber ? '  Voy. ' + invoice.outwardVoyageNumber : ''));
  const h6 = metaBlock(col2, 'Destination', invoice.destination);
  y += Math.max(h5, h6) + 5;

  y += 2;
  doc.setDrawColor(BORDER);
  doc.line(L, y, R, y);
  y += 8;

  // Cargo table
  doc.setFillColor(CARD);
  doc.rect(L, y - 2, R - L, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED);
  const cargoColW = (R - L) / 4;
  ['GRADE', 'METRIC TONNES', 'UNITS', 'RATE / MT'].forEach((h, i) => {
    doc.text(h, L + 2 + i * cargoColW, y + 4.5);
  });
  y += 10;

  doc.setFillColor('#131619');
  doc.rect(L, y - 2, R - L, 10, 'F');
  const cargoVals = [
    invoice.grade,
    fmtNum(invoice.metricTonnes, 2) + ' MT',
    fmtNum(invoice.units, 4),
    invoice.currency + ' ' + fmtNum(invoice.fixedRate),
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(LIGHT);
  cargoVals.forEach((v, i) => {
    doc.text(v, L + 2 + i * cargoColW, y + 5);
  });
  y += 14;

  // Formula line
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED);
  doc.text(
    fmtNum(invoice.metricTonnes, 2) + ' MT  /  ' + invoice.unitConversionFactor + '  =  ' + fmtNum(invoice.units, 4) + ' units',
    L + 2, y
  );
  y += 8;

  doc.setDrawColor(BORDER);
  doc.line(L, y, R, y);
  y += 8;

  // Total rate
  doc.setFillColor(CARD);
  doc.roundedRect(L, y - 2, R - L, 14, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(LIGHT);
  doc.text('TOTAL RATE', L + 4, y + 7);
  doc.setFont('courier', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(GOLD);
  const totalStr = invoice.currency + ' ' + fmtNum(invoice.totalRate);
  doc.text(totalStr, R - 4, y + 8, { align: 'right' });
  y += 20;

  // Accountant-only block
  if (copyType === 'ACCOUNTANT COPY') {
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(L, y, R, y);
    doc.setLineDashPattern([], 0);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(GOLD);
    doc.text('INTERNAL — ACCOUNTANT USE ONLY', L, y);
    y += 7;

    const fields = [
      ['Filing ID', invoice.id],
      ['Debit Number', invoice.debitNumber || '—'],
      ['Invoice Number', invoice.invoiceNumber || '—'],
      ['Sequence', String(invoice.sequenceNumber)],
      ['Status', invoice.status.toUpperCase()],
      ['Unit Factor', String(invoice.unitConversionFactor)],
    ];
    const colW = (R - L) / 4;
    fields.forEach((f, i) => {
      const cx = L + i * colW;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(MUTED);
      doc.text(f[0].toUpperCase(), cx, y);
      doc.setFont('courier', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(LIGHT);
      doc.text(f[1], cx, y + 5);
    });
    y += 16;

    // Signature lines
    ['Prepared by', 'Verified by', 'Approved by'].forEach((label, i) => {
      const sx = L + i * ((R - L) / 3);
      doc.setDrawColor(BORDER);
      doc.setLineWidth(0.3);
      doc.line(sx, y + 12, sx + (R - L) / 3 - 6, y + 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(MUTED);
      doc.text(label, sx, y + 17);
    });
  }

  // Notes
  if (invoice.notes) {
    const noteY = H - 35;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(MUTED);
    doc.text('NOTES', L, noteY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(LIGHT);
    const noteLines = doc.splitTextToSize(invoice.notes, R - L);
    doc.text(noteLines, L, noteY + 5);
  }

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(MUTED);
  doc.text(invoice.id + ' · ' + copyType + ' · Generated ' + fmtDate(invoice.issueDate), W / 2, H - 8, { align: 'center' });
  doc.setFillColor(GOLD);
  doc.rect(0, H - 3, W, 3, 'F');
}

export async function generateInvoicePDF(invoice: Invoice): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawInvoice(doc, invoice, 'CUSTOMER COPY');
  doc.addPage();
  drawInvoice(doc, invoice, 'ACCOUNTANT COPY');
  doc.save((invoice.debitNumber || invoice.id) + '.pdf');
}

export async function getInvoicePDFBlobUrlsBySide(invoice: Invoice): Promise<{ customer: string; accountant: string }> {
  const { default: jsPDF } = await import('jspdf');

  const cDoc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawInvoice(cDoc, invoice, 'CUSTOMER COPY');

  const aDoc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawInvoice(aDoc, invoice, 'ACCOUNTANT COPY');

  return {
    customer: URL.createObjectURL(cDoc.output('blob')),
    accountant: URL.createObjectURL(aDoc.output('blob')),
  };
}
