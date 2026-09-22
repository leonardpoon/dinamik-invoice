"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { computeCargo, computeCosts, type CostLineInput } from "@/lib/calc";
import { parseInputDate, yearMonthOf } from "@/lib/format";
import { amountToWords } from "@/lib/words";
import { formatDnNumber, nextDnNumber } from "@/lib/queries";

const numStr = (label: string, opts: { min?: number; positive?: boolean } = {}) =>
  z
    .string()
    .trim()
    .transform((s) => (s === "" ? NaN : Number(s)))
    .refine((n) => Number.isFinite(n), `${label} must be a number`)
    .refine((n) => (opts.positive ? n > 0 : true), `${label} must be greater than 0`)
    .refine((n) => (opts.min !== undefined ? n >= opts.min : true), `${label} must be at least ${opts.min}`);

const costLineSchema = z.object({
  category: z.enum(["PORT", "TRANSPORT", "MISC"]),
  code: z.string().trim().min(1).max(20),
  label: z.string().trim().max(100).default(""),
  basis: z.enum(["PER_CONTAINER", "PER_BOX", "PER_MT", "FLAT"]),
  rate: z.number().finite(),
  sortOrder: z.number().int().default(0),
});

const schema = z.object({
  dnNumber: z.string().trim().max(30).default(""),
  dnDate: z.string().trim().min(1, "Debit note date is required"),
  customerId: numStr("Customer", { positive: true }),
  customerInvoiceRef: z.string().trim().max(100).default(""),
  buyerName: z.string().trim().max(200).default(""),
  contractNo: z.string().trim().max(100).default(""),

  boxes: numStr("Boxes", { positive: true }),
  packingDesc: z.string().trim().min(1, "Packing description is required").max(100),
  boxesPerContainer: numStr("Boxes per container", { positive: true }),
  mtPerContainer: numStr("M/Tons per container", { positive: true }),
  productDesc: z.string().trim().max(100).default(""),

  feederVessel: z.string().trim().max(100).default(""),
  feederVoyage: z.string().trim().max(50).default(""),
  feederArrivalDate: z.string().trim().default(""),
  blNumber: z.string().trim().max(100).default(""),
  blRef: z.string().trim().max(100).default(""),

  oceanVessel: z.string().trim().max(100).default(""),
  oceanVoyage: z.string().trim().max(50).default(""),
  destination: z.string().trim().max(100).default(""),
  blDate: z.string().trim().default(""),

  chargeDesc: z.string().trim().min(1, "Charge description is required").max(100),
  ratePerMt: numStr("Rate per M/Ton", { min: 0 }),
  remarks: z.string().trim().max(1000).default(""),
  costs: z.string().default("[]"),
});

export type SaveDebitNoteResult = { ok: false; error: string; fieldErrors?: Record<string, string> };

function formToObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}

export async function saveDebitNote(id: number | null, formData: FormData): Promise<SaveDebitNoteResult> {
  const parsed = schema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;

  const dnDate = parseInputDate(v.dnDate);
  if (!dnDate) return { ok: false, error: "Invalid debit note date.", fieldErrors: { dnDate: "Invalid date" } };
  const feederArrivalDate = v.feederArrivalDate ? parseInputDate(v.feederArrivalDate) : null;
  const blDate = v.blDate ? parseInputDate(v.blDate) : null;

  let costLines: CostLineInput[];
  try {
    costLines = z.array(costLineSchema).parse(JSON.parse(v.costs || "[]"));
  } catch {
    return { ok: false, error: "Cost lines are invalid." };
  }

  const cargo = computeCargo(v);
  const costs = computeCosts(costLines, { containers: cargo.containers, boxes: v.boxes, tonnage: cargo.tonnage });
  const profit = Math.round((cargo.totalAmount - costs.totalCost) * 100) / 100;

  const customer = await prisma.customer.findUnique({ where: { id: v.customerId } });
  if (!customer) return { ok: false, error: "Customer not found.", fieldErrors: { customerId: "Select a customer" } };

  let buyerId: number | null = null;
  if (v.buyerName) {
    const buyer = await prisma.buyer.upsert({
      where: { name: v.buyerName },
      update: {},
      create: { name: v.buyerName },
    });
    buyerId = buyer.id;
  }

  const yearMonth = yearMonthOf(dnDate);

  const baseData = {
    dnDate,
    yearMonth,
    customerId: v.customerId,
    customerInvoiceRef: v.customerInvoiceRef,
    buyerId,
    contractNo: v.contractNo,
    boxes: v.boxes,
    packingDesc: v.packingDesc,
    boxesPerContainer: v.boxesPerContainer,
    mtPerContainer: v.mtPerContainer,
    containers: cargo.containers,
    tonnage: cargo.tonnage,
    productDesc: v.productDesc,
    feederVessel: v.feederVessel,
    feederVoyage: v.feederVoyage,
    feederArrivalDate,
    blNumber: v.blNumber,
    blRef: v.blRef,
    oceanVessel: v.oceanVessel,
    oceanVoyage: v.oceanVoyage,
    destination: v.destination,
    blDate,
    chargeDesc: v.chargeDesc,
    ratePerMt: v.ratePerMt,
    chargeAmount: cargo.chargeAmount,
    totalAmount: cargo.totalAmount,
    amountInWords: amountToWords(cargo.totalAmount),
    totalCost: costs.totalCost,
    profit,
    remarks: v.remarks,
  };

  const costCreate = costs.lines.map((c) => ({
    category: c.category,
    code: c.code,
    label: c.label,
    basis: c.basis,
    rate: c.rate,
    amount: c.amount,
    sortOrder: c.sortOrder,
  }));

  let savedId = id;

  // Retry a few times in case two users grab the same running number at once.
  for (let attempt = 0; attempt < 5; attempt++) {
    let dnNumber = v.dnNumber;
    let runningNo = parseRunningNo(dnNumber, yearMonth);
    if (!dnNumber) {
      const next = await nextDnNumber(yearMonth);
      dnNumber = next.dnNumber;
      runningNo = next.runningNo;
    }

    try {
      if (id === null) {
        const created = await prisma.debitNote.create({
          data: { ...baseData, dnNumber, runningNo, costs: { create: costCreate } },
          select: { id: true },
        });
        savedId = created.id;
      } else {
        await prisma.$transaction([
          prisma.debitNoteCost.deleteMany({ where: { debitNoteId: id } }),
          prisma.debitNote.update({
            where: { id },
            data: { ...baseData, dnNumber, runningNo, costs: { create: costCreate } },
          }),
        ]);
      }
      break;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        if (v.dnNumber) {
          return {
            ok: false,
            error: `Debit note number ${v.dnNumber} already exists.`,
            fieldErrors: { dnNumber: "Already in use" },
          };
        }
        if (attempt === 4) return { ok: false, error: "Could not allocate a debit note number, please retry." };
        continue;
      }
      throw e;
    }
  }

  revalidatePath("/");
  revalidatePath("/debit-notes");
  revalidatePath("/cover-letter");
  redirect(`/debit-notes/${savedId}?saved=1`);
}

/** If the user typed "DN202609-07" and it matches the month, keep the running number so the sequence continues. */
function parseRunningNo(dnNumber: string, yearMonth: string): number {
  const m = /^DN(\d{6})-(\d+)$/i.exec(dnNumber);
  if (m && m[1] === yearMonth) return parseInt(m[2], 10);
  return 0;
}

export async function deleteDebitNote(id: number): Promise<void> {
  await prisma.debitNote.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/debit-notes");
  revalidatePath("/cover-letter");
  redirect("/debit-notes");
}

export async function suggestDnNumber(dnDate: string): Promise<string> {
  const d = parseInputDate(dnDate);
  if (!d) return "";
  const ym = yearMonthOf(d);
  const next = await nextDnNumber(ym);
  return formatDnNumber(ym, next.runningNo);
}
