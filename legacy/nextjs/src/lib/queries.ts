import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { plain } from "@/lib/serialize";

export async function getSettings() {
  const s = await prisma.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  return plain(s);
}
export type SettingsPlain = Awaited<ReturnType<typeof getSettings>>;

export async function getRateCard() {
  const rows = await prisma.costRateDefault.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
  return plain(rows);
}
export type RateCardPlain = Awaited<ReturnType<typeof getRateCard>>;

export async function listCustomers(includeInactive = false) {
  const rows = await prisma.customer.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: "asc" },
  });
  return plain(rows);
}
export type CustomerPlain = Awaited<ReturnType<typeof listCustomers>>[number];

export async function listBuyers() {
  const rows = await prisma.buyer.findMany({ orderBy: { name: "asc" } });
  return plain(rows);
}

export async function listDestinations(): Promise<string[]> {
  const rows = await prisma.debitNote.findMany({
    distinct: ["destination"],
    select: { destination: true },
    orderBy: { destination: "asc" },
  });
  return rows.map((r) => r.destination).filter(Boolean);
}

export async function listVessels(): Promise<{ feeder: string[]; ocean: string[] }> {
  const [f, o] = await Promise.all([
    prisma.debitNote.findMany({ distinct: ["feederVessel"], select: { feederVessel: true } }),
    prisma.debitNote.findMany({ distinct: ["oceanVessel"], select: { oceanVessel: true } }),
  ]);
  return {
    feeder: f.map((r) => r.feederVessel).filter(Boolean).sort(),
    ocean: o.map((r) => r.oceanVessel).filter(Boolean).sort(),
  };
}

export const debitNoteInclude = {
  customer: true,
  buyer: true,
  costs: { orderBy: [{ category: "asc" }, { sortOrder: "asc" }] },
} satisfies Prisma.DebitNoteInclude;

export async function getDebitNote(id: number) {
  const dn = await prisma.debitNote.findUnique({ where: { id }, include: debitNoteInclude });
  return dn ? plain(dn) : null;
}
export type DebitNotePlain = NonNullable<Awaited<ReturnType<typeof getDebitNote>>>;

export interface DebitNoteFilters {
  q?: string;
  yearMonth?: string;
  customerId?: number;
  destination?: string;
}

export async function listDebitNotes(filters: DebitNoteFilters = {}) {
  const where: Prisma.DebitNoteWhereInput = {};
  if (filters.yearMonth) where.yearMonth = filters.yearMonth;
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.destination) where.destination = filters.destination;
  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { dnNumber: { contains: q } },
      { customerInvoiceRef: { contains: q } },
      { blNumber: { contains: q } },
      { contractNo: { contains: q } },
      { feederVessel: { contains: q } },
      { oceanVessel: { contains: q } },
      { destination: { contains: q } },
      { buyer: { name: { contains: q } } },
    ];
  }
  const rows = await prisma.debitNote.findMany({
    where,
    include: { customer: true, buyer: true },
    orderBy: [{ dnDate: "desc" }, { dnNumber: "desc" }],
    take: 500,
  });
  return plain(rows);
}
export type DebitNoteRow = Awaited<ReturnType<typeof listDebitNotes>>[number];

export async function listYearMonths(): Promise<string[]> {
  const rows = await prisma.debitNote.findMany({
    distinct: ["yearMonth"],
    select: { yearMonth: true },
    orderBy: { yearMonth: "desc" },
  });
  return rows.map((r) => r.yearMonth);
}

/** Next running number for the month: DN + YYYYMM + "-" + NN */
export async function nextDnNumber(yearMonth: string): Promise<{ dnNumber: string; runningNo: number }> {
  const agg = await prisma.debitNote.aggregate({ where: { yearMonth }, _max: { runningNo: true } });
  const runningNo = (agg._max.runningNo ?? 0) + 1;
  return { dnNumber: formatDnNumber(yearMonth, runningNo), runningNo };
}

export function formatDnNumber(yearMonth: string, runningNo: number): string {
  return `DN${yearMonth}-${String(runningNo).padStart(2, "0")}`;
}

/** Cover letter: every debit note for a customer whose DN date falls in [from, to] (inclusive months). */
export async function listDebitNotesForCoverLetter(customerId: number, fromYm: string, toYm: string) {
  const rows = await prisma.debitNote.findMany({
    where: { customerId, yearMonth: { gte: fromYm, lte: toYm } },
    orderBy: [{ yearMonth: "asc" }, { runningNo: "asc" }, { dnNumber: "asc" }],
    select: { id: true, dnNumber: true, dnDate: true, totalAmount: true, yearMonth: true },
  });
  return plain(rows);
}
