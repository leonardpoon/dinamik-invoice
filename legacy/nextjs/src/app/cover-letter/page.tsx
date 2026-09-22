import Link from "next/link";
import { listCustomers, listDebitNotesForCoverLetter } from "@/lib/queries";
import { fmtDate, fmtMoney, fmtYearMonth, toInputDate, todayUtc } from "@/lib/format";

export const dynamic = "force-dynamic";

function ymFromInput(s: string | undefined, fallback: string): string {
  // <input type="month"> gives yyyy-mm
  const m = /^(\d{4})-(\d{2})$/.exec(s ?? "");
  return m ? `${m[1]}${m[2]}` : fallback;
}

export default async function CoverLetterPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; from?: string; to?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const customers = await listCustomers();
  const today = todayUtc();
  const thisYm = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, "0")}`;

  const customerId = sp.customer ? Number(sp.customer) : customers[0]?.id;
  const fromYm = ymFromInput(sp.from, thisYm);
  const toYm = ymFromInput(sp.to, fromYm);
  const date = sp.date || toInputDate(today);

  const customer = customers.find((c) => c.id === customerId);
  const notes = customer ? await listDebitNotesForCoverLetter(customer.id, fromYm, toYm) : [];
  const total = notes.reduce((a, n) => a + n.totalAmount, 0);

  const pdfQuery = new URLSearchParams({
    customer: String(customerId ?? ""),
    from: `${fromYm.slice(0, 4)}-${fromYm.slice(4)}`,
    to: `${toYm.slice(0, 4)}-${toYm.slice(4)}`,
    date,
  }).toString();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Cover Letter</h1>
        <p className="text-sm text-slate-500">
          Lists every debit note issued to a customer in the chosen months. It updates automatically as debit notes are added or edited.
        </p>
      </div>

      <form className="card p-3 flex flex-wrap gap-3 items-end">
        <div className="min-w-64">
          <label className="label">Customer</label>
          <select name="customer" defaultValue={customerId ?? ""} className="input">
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From month</label>
          <input type="month" name="from" defaultValue={`${fromYm.slice(0, 4)}-${fromYm.slice(4)}`} className="input" />
        </div>
        <div>
          <label className="label">To month</label>
          <input type="month" name="to" defaultValue={`${toYm.slice(0, 4)}-${toYm.slice(4)}`} className="input" />
        </div>
        <div>
          <label className="label">Letter date</label>
          <input type="date" name="date" defaultValue={date} className="input" />
        </div>
        <button className="btn btn-secondary">Update</button>
        {customer && notes.length > 0 && (
          <>
            <a href={`/cover-letter/pdf?${pdfQuery}&download=1`} className="btn btn-primary">
              Download PDF
            </a>
            <a href={`/cover-letter/pdf?${pdfQuery}`} target="_blank" className="btn btn-secondary">
              Open PDF
            </a>
          </>
        )}
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card overflow-hidden">
          {customer && notes.length > 0 ? (
            <iframe src={`/cover-letter/pdf?${pdfQuery}`} title="Cover letter preview" className="w-full h-[850px]" />
          ) : (
            <div className="p-10 text-center text-slate-500 text-sm">
              {customer ? (
                <>
                  No debit notes for {customer.name} between {fmtYearMonth(fromYm)} and {fmtYearMonth(toYm)}.
                </>
              ) : (
                <>
                  No customers yet.{" "}
                  <Link href="/customers/new" className="underline">
                    Add one
                  </Link>
                  .
                </>
              )}
            </div>
          )}
        </div>
        <div className="card">
          <h2 className="card-title">Debit notes enclosed ({notes.length})</h2>
          <table className="table">
            <thead>
              <tr>
                <th>DN No.</th>
                <th>Date</th>
                <th className="num">S$</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((n) => (
                <tr key={n.id}>
                  <td>
                    <Link href={`/debit-notes/${n.id}`} className="text-emerald-700 hover:underline">
                      {n.dnNumber}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{fmtDate(n.dnDate)}</td>
                  <td className="num">{fmtMoney(n.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
            {notes.length > 0 && (
              <tfoot>
                <tr className="font-semibold bg-slate-50">
                  <td colSpan={2}>Total</td>
                  <td className="num">{fmtMoney(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
