import { prisma } from "@/lib/prisma";
import { plain } from "@/lib/serialize";
import { fmtYearMonth } from "@/lib/format";

export interface MonthPoint {
  yearMonth: string;
  label: string;
  count: number;
  boxes: number;
  tonnage: number;
  revenue: number;
  cost: number;
  profit: number;
}

export interface NamedPoint {
  name: string;
  count: number;
  tonnage: number;
  revenue: number;
  profit: number;
}

function n(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const x = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(x) ? x : 0;
}

export async function listYears(): Promise<number[]> {
  const rows = await prisma.debitNote.findMany({ distinct: ["yearMonth"], select: { yearMonth: true } });
  const years = new Set(rows.map((r) => Number(r.yearMonth.slice(0, 4))));
  return [...years].sort((a, b) => b - a);
}

/** Every month of the year, zero-filled, so the chart axis is complete. */
export async function monthlySeries(year: number): Promise<MonthPoint[]> {
  const rows = await prisma.debitNote.groupBy({
    by: ["yearMonth"],
    where: { yearMonth: { startsWith: String(year) } },
    _count: { _all: true },
    _sum: { boxes: true, tonnage: true, totalAmount: true, totalCost: true, profit: true },
  });
  const map = new Map(rows.map((r) => [r.yearMonth, r]));
  const out: MonthPoint[] = [];
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}${String(m).padStart(2, "0")}`;
    const r = map.get(ym);
    out.push({
      yearMonth: ym,
      label: fmtYearMonth(ym).slice(0, 3),
      count: r?._count._all ?? 0,
      boxes: n(r?._sum.boxes),
      tonnage: n(r?._sum.tonnage),
      revenue: n(r?._sum.totalAmount),
      cost: n(r?._sum.totalCost),
      profit: n(r?._sum.profit),
    });
  }
  return out;
}

export async function byDestination(year: number, limit = 8): Promise<NamedPoint[]> {
  const rows = await prisma.debitNote.groupBy({
    by: ["destination"],
    where: { yearMonth: { startsWith: String(year) } },
    _count: { _all: true },
    _sum: { tonnage: true, totalAmount: true, profit: true },
    orderBy: { _sum: { tonnage: "desc" } },
  });
  return foldOther(
    rows.map((r) => ({
      name: r.destination || "(not specified)",
      count: r._count._all,
      tonnage: n(r._sum.tonnage),
      revenue: n(r._sum.totalAmount),
      profit: n(r._sum.profit),
    })),
    limit,
  );
}

export async function byBuyer(year: number, limit = 8): Promise<NamedPoint[]> {
  const rows = await prisma.debitNote.groupBy({
    by: ["buyerId"],
    where: { yearMonth: { startsWith: String(year) } },
    _count: { _all: true },
    _sum: { tonnage: true, totalAmount: true, profit: true },
    orderBy: { _sum: { tonnage: "desc" } },
  });
  const ids = rows.map((r) => r.buyerId).filter((x): x is number => x !== null);
  const buyers = await prisma.buyer.findMany({ where: { id: { in: ids } } });
  const names = new Map(buyers.map((b) => [b.id, b.name]));
  return foldOther(
    rows.map((r) => ({
      name: (r.buyerId && names.get(r.buyerId)) || "(no buyer)",
      count: r._count._all,
      tonnage: n(r._sum.tonnage),
      revenue: n(r._sum.totalAmount),
      profit: n(r._sum.profit),
    })),
    limit,
  );
}

export async function byCustomer(year: number, limit = 8): Promise<NamedPoint[]> {
  const rows = await prisma.debitNote.groupBy({
    by: ["customerId"],
    where: { yearMonth: { startsWith: String(year) } },
    _count: { _all: true },
    _sum: { tonnage: true, totalAmount: true, profit: true },
    orderBy: { _sum: { totalAmount: "desc" } },
  });
  const customers = await prisma.customer.findMany({ where: { id: { in: rows.map((r) => r.customerId) } } });
  const names = new Map(customers.map((c) => [c.id, c.name]));
  return foldOther(
    rows.map((r) => ({
      name: names.get(r.customerId) ?? `#${r.customerId}`,
      count: r._count._all,
      tonnage: n(r._sum.tonnage),
      revenue: n(r._sum.totalAmount),
      profit: n(r._sum.profit),
    })),
    limit,
  );
}

export async function byVessel(year: number, limit = 8): Promise<NamedPoint[]> {
  const rows = await prisma.debitNote.groupBy({
    by: ["oceanVessel"],
    where: { yearMonth: { startsWith: String(year) } },
    _count: { _all: true },
    _sum: { tonnage: true, totalAmount: true, profit: true },
    orderBy: { _sum: { tonnage: "desc" } },
  });
  return foldOther(
    rows.map((r) => ({
      name: r.oceanVessel || "(not specified)",
      count: r._count._all,
      tonnage: n(r._sum.tonnage),
      revenue: n(r._sum.totalAmount),
      profit: n(r._sum.profit),
    })),
    limit,
  );
}

function foldOther(points: NamedPoint[], limit: number): NamedPoint[] {
  if (points.length <= limit) return points;
  const head = points.slice(0, limit - 1);
  const rest = points.slice(limit - 1);
  head.push(
    rest.reduce(
      (a, p) => ({ name: "Other", count: a.count + p.count, tonnage: a.tonnage + p.tonnage, revenue: a.revenue + p.revenue, profit: a.profit + p.profit }),
      { name: "Other", count: 0, tonnage: 0, revenue: 0, profit: 0 },
    ),
  );
  return head;
}

export async function recentDebitNotes(limit = 8) {
  const rows = await prisma.debitNote.findMany({
    include: { customer: true, buyer: true },
    orderBy: [{ dnDate: "desc" }, { id: "desc" }],
    take: limit,
  });
  return plain(rows);
}

export async function totals(year: number) {
  const r = await prisma.debitNote.aggregate({
    where: { yearMonth: { startsWith: String(year) } },
    _count: { _all: true },
    _sum: { boxes: true, tonnage: true, totalAmount: true, totalCost: true, profit: true, containers: true },
  });
  return {
    count: r._count._all,
    boxes: n(r._sum.boxes),
    containers: n(r._sum.containers),
    tonnage: n(r._sum.tonnage),
    revenue: n(r._sum.totalAmount),
    cost: n(r._sum.totalCost),
    profit: n(r._sum.profit),
  };
}
