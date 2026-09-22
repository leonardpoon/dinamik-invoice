"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveCustomer, type SaveCustomerResult } from "@/app/customers/actions";

export interface CustomerFormValues {
  name: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  addressLine4: string;
  addressLine5: string;
  attention: string;
  active: boolean;
}

export default function CustomerForm({ id, initial }: { id: number | null; initial: CustomerFormValues }) {
  const [state, formAction, pending] = useActionState<SaveCustomerResult | null, FormData>(
    async (_prev, fd) => saveCustomer(id, fd),
    null,
  );
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="card max-w-2xl">
      <h2 className="card-title">{id === null ? "New customer" : "Customer details"}</h2>
      <div className="p-4 space-y-3">
        {state && !state.ok && <div className="rounded border border-red-300 bg-red-50 text-red-800 px-3 py-2 text-sm">{state.error}</div>}
        <div>
          <label className="label">Name (printed in bold on the debit note)</label>
          <input name="name" defaultValue={initial.name} className={`input ${fe.name ? "input-error" : ""}`} required />
          {fe.name && <p className="text-xs text-red-600 mt-1">{fe.name}</p>}
        </div>
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <div key={n}>
            <label className="label">Address line {n}</label>
            <input name={`addressLine${n}`} defaultValue={initial[`addressLine${n}`]} className="input" />
          </div>
        ))}
        <div>
          <label className="label">Attention (used on the cover letter)</label>
          <input name="attention" defaultValue={initial.attention} className="input" placeholder="Ms Chia Ching Lian" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={initial.active} /> Active (shown when creating debit notes)
        </label>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "Saving…" : "Save"}
          </button>
          <Link href="/customers" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}
