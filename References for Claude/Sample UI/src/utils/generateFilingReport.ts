import type { Invoice } from '../types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtDate(d: string): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildFilingDoc(jsPDF: any, invoices: Invoice[], year: number, month: number) {

  const W = 210;
  const H = 297;
  const L = 15;
  const R = W - L;
  const TW = R - L;

  const DARK = '#0d0f14';
  const GOLD = '#c9a84c';
  const LIGHT = '#e8e6e0';
  const MUTED = '#6b6760';
  const BORDER = '#252830';
  const CARD = '#13161e';

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // Background
  doc.setFillColor(DARK);
  doc.rect(0, 0, W, H, 'F');

  // Gold top bar
  doc.setFillColor(GOLD);
  doc.rect(0, 0, W, 5, 'F');

  // Header block
  doc.setFillColor(CARD);
  doc.rect(0, 5, W, 30, 'F');
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.3);
  doc.line(0, 35, W, 35);

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(LIGHT);
  doc.text('Filing Register', L, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(MONTH_NAMES[month - 1] + ' ' + year, L, 26);

  // Period code top-right
  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(GOLD);
  const period = 'D' + year + String(month).padStart(2, '0');
  doc.text(period, R, 18, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED);
  doc.text('Printed: ' + fmtDate(new Date().toISOString().split('T')[0]) + '   Total: ' + invoices.length + ' invoice(s)', R, 26, { align: 'right' });

  // --- Table ---
  // Columns (TW = 180mm):
  //   Debit No. | Date | P No. | B/L No. | Outward Vessel
  const colDN      = 44;
  const colDate    = 26;
  const colPNo     = 30;
  const colBL      = 40;
  const colVessel  = TW - colDN - colDate - colPNo - colBL; // 40mm

  // Column x-offsets from L
  const xDN     = L;
  const xDate   = xDN   + colDN;
  const xPNo    = xDate + colDate;
  const xBL     = xPNo  + colPNo;
  const xVessel = xBL   + colBL;

  const COLS = [
    { label: 'DEBIT NO.',       x: xDN,     w: colDN },
    { label: 'DATE',            x: xDate,   w: colDate },
    { label: 'P NO.',           x: xPNo,    w: colPNo },
    { label: 'B/L NO.',         x: xBL,     w: colBL },
    { label: 'OUTWARD VESSEL',  x: xVessel, w: colVessel },
  ];

  let y = 42;
  const rowH = 11;
  const HDR_H = 8;

  // Table header
  doc.setFillColor(CARD);
  doc.rect(L, y, TW, HDR_H, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(MUTED);
  COLS.forEach(col => doc.text(col.label, col.x + 2, y + 5.5));

  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.3);
  doc.line(L, y + HDR_H, R, y + HDR_H);
  y += HDR_H;

  function drawRow(inv: (typeof invoices)[0] | null, idx: number) {
    if (idx % 2 === 0) {
      doc.setFillColor('#131619');
      doc.rect(L, y, TW, rowH, 'F');
    }

    if (inv) {
      // Debit No. — gold monospace
      doc.setFont('courier', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(GOLD);
      const dnText = inv.debitNumber || inv.id;
      doc.text(dnText, xDN + 2, y + 7);

      // Date
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(LIGHT);
      doc.text(fmtDate(inv.issueDate), xDate + 2, y + 7);

      // P No. (SI number)
      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(LIGHT);
      doc.text(inv.siNumber || '—', xPNo + 2, y + 7);

      // B/L No.
      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(LIGHT);
      const blText = inv.blNumber || '—';
      doc.text(blText, xBL + 2, y + 7);

      // Outward Vessel — truncate if needed
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(LIGHT);
      const vesselRaw = inv.outwardVesselName || '—';
      const vesselMax = colVessel - 4;
      let vesselText = vesselRaw;
      while (doc.getTextWidth(vesselText) > vesselMax && vesselText.length > 3) {
        vesselText = vesselText.slice(0, -1);
      }
      if (vesselText !== vesselRaw) vesselText = vesselText.slice(0, -1) + '…';
      doc.text(vesselText, xVessel + 2, y + 7);
    }

    // Row bottom border
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.2);
    doc.line(L, y + rowH, R, y + rowH);
  }

  // Data rows
  if (invoices.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text('No invoices for this period.', L + 2, y + 8);
  } else {
    invoices.forEach((inv, idx) => {
      if (y + rowH > H - 20) {
        doc.addPage();
        doc.setFillColor(DARK);
        doc.rect(0, 0, W, H, 'F');
        y = 15;
      }
      drawRow(inv, idx);
      y += rowH;
    });
  }

  // Blank rows for manual entries
  const blankRows = Math.min(8, Math.max(3, 20 - invoices.length));
  for (let i = 0; i < blankRows; i++) {
    if (y + rowH > H - 20) break;
    drawRow(null, invoices.length + i);
    y += rowH;
  }

  // Footer
  doc.setFillColor(GOLD);
  doc.rect(0, H - 3, W, 3, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(MUTED);
  doc.text(period + ' · Filing Register', W / 2, H - 6, { align: 'center' });

  return doc;
}

export async function generateFilingReport(invoices: Invoice[], year: number, month: number): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const doc = await buildFilingDoc(jsPDF, invoices, year, month);
  const period = 'D' + year + String(month).padStart(2, '0');
  doc.save('Filing-Register-' + period + '.pdf');
}

export async function getFilingReportBlobUrl(invoices: Invoice[], year: number, month: number): Promise<string> {
  const { default: jsPDF } = await import('jspdf');
  const doc = await buildFilingDoc(jsPDF, invoices, year, month);
  return URL.createObjectURL(doc.output('blob'));
}
