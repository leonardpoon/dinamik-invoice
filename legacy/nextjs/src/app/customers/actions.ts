"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  addressLine1: z.string().trim().max(200).default(""),
  addressLine2: z.string().trim().max(200).default(""),
  addressLine3: z.string().trim().max(200).default(""),
  addressLine4: z.string().trim().max(200).default(""),
  addressLine5: z.string().trim().max(200).default(""),
  attention: z.string().trim().max(200).default(""),
  active: z.string().optional().transform((s) => s === "on" || s === "true"),
});

export type SaveCustomerResult = { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function saveCustomer(id: number | null, formData: FormData): Promise<SaveCustomerResult> {
  const raw: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") raw[k] = v;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const data = parsed.data;
  if (id === null) {
    await prisma.customer.create({ data });
  } else {
    await prisma.customer.update({ where: { id }, data });
  }
  revalidatePath("/customers");
  revalidatePath("/debit-notes");
  redirect("/customers");
}
