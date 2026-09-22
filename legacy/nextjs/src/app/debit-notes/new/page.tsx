import Link from "next/link";
import DebitNoteForm from "@/components/DebitNoteForm";
import { loadDebitNoteFormProps } from "@/lib/form-props";

export const dynamic = "force-dynamic";

export default async function NewDebitNotePage() {
  const props = await loadDebitNoteFormProps(null);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/debit-notes" className="text-sm text-slate-500 hover:underline">
          ← Debit Notes
        </Link>
        <h1 className="text-xl font-semibold">New Debit Note</h1>
      </div>
      {props.customers.length === 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 text-amber-800 px-4 py-2 text-sm">
          No customers yet.{" "}
          <Link href="/customers/new" className="underline">
            Add a customer
          </Link>{" "}
          first.
        </div>
      )}
      <DebitNoteForm id={null} {...props} />
    </div>
  );
}
