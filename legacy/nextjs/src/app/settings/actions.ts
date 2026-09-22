"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const num = (label: string, min = 0) =>
  z
    .string()
    .trim()
    .transform((s) => Number(s))
    .refine((n) => Number.isFinite(n) && n >= min, `${label} must be a number ≥ ${min}`);

const settingsSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  addressLine: z.string().trim().max(500).default(""),
  registrationNo: z.string().trim().max(200).default(""),
  paymentLine1: z.string().trim().max(300).default(""),
  paymentLine2: z.string().trim().max(300).default(""),
  signatoryName: z.string().trim().max(100).default(""),
  signatoryTitle: z.string().trim().max(100).default(""),
  coverLetterIntro: z.string().trim().max(500).default(""),
  defaultPackingDesc: z.string().trim().max(100).default(""),
  defaultProductDesc: z.string().trim().max(100).default(""),
  defaultBoxesPerContainer: num("Boxes per container", 0.0001),
  defaultMtPerContainer: num("M/Tons per container", 0.0001),
  defaultChargeDesc: z.string().trim().max(100).default(""),
  defaultRatePerMt: num("Rate per M/Ton"),
});

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

function toObject(fd: FormData) {
  const raw: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") raw[k] = v;
  return raw;
}

export async function saveSettings(formData: FormData): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(toObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`).join("; ") };
  }
  await prisma.setting.upsert({ where: { id: 1 }, update: parsed.data, create: { id: 1, ...parsed.data } });
  revalidatePath("/settings");
  revalidatePath("/debit-notes");
  return { ok: true, message: "Settings saved." };
}

const rateLineSchema = z.object({
  id: z.number().int().nullable(),
  category: z.enum(["PORT", "TRANSPORT", "MISC"]),
  code: z.string().trim().min(1, "Code is required").max(20),
  label: z.string().trim().max(100).default(""),
  basis: z.enum(["PER_CONTAINER", "PER_BOX", "PER_MT", "FLAT"]),
  rate: z.number().finite(),
  sortOrder: z.number().int(),
});

/** Replaces the whole rate card with the submitted lines (lines removed in the UI are deleted). */
export async function saveRateCard(linesJson: string): Promise<ActionResult> {
  let lines: z.infer<typeof rateLineSchema>[];
  try {
    lines = z.array(rateLineSchema).parse(JSON.parse(linesJson));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid rate card." };
  }
  const seen = new Set<string>();
  for (const l of lines) {
    const key = `${l.category}:${l.code.toUpperCase()}`;
    if (seen.has(key)) return { ok: false, error: `Duplicate code ${l.code} in ${l.category}.` };
    seen.add(key);
  }

  await prisma.$transaction(async (tx) => {
    await tx.costRateDefault.deleteMany({});
    if (lines.length) {
      await tx.costRateDefault.createMany({
        data: lines.map((l) => ({
          category: l.category,
          code: l.code.toUpperCase(),
          label: l.label,
          basis: l.basis,
          rate: l.rate,
          sortOrder: l.sortOrder,
          active: true,
        })),
      });
    }
  });
  revalidatePath("/settings");
  revalidatePath("/debit-notes/new");
  return { ok: true, message: "Rate card saved." };
}
