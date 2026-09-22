import Link from "next/link";
import { notFound } from "next/navigation";
import DebitNoteForm from "@/components/DebitNoteForm";
import { loadDebitNoteFormProps } from "@/lib/form-props";
import { getDebitNote } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EditDebitNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dn = await getDebitNote(Number(id));
  if (!dn) notFound();
  const props = await loadDebitNoteFormProps(dn);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/debit-notes/${dn.id}`} className="text-sm text-slate-500 hover:underline">
          ← {dn.dnNumber}
        </Link>
        <h1 className="text-xl font-semibold">Edit {dn.dnNumber}</h1>
      </div>
      <DebitNoteForm id={dn.id} {...props} />
    </div>
  );
}
