import Link from "next/link";
import { listCustomers, listDebitNotes, listDestinations, listYearMonths } from "@/lib/queries";
import { fmtDate, fmtMoney, fmtYearMonth } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DebitNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ym?: string; customer?: string; dest?: string }>;
}) {
  const sp = await searchParams;
  const filters = {
    q: sp.q || undefined,
    yearMonth: sp.ym || undefined,
    customerId: sp.customer ? Number(sp.customer) : undefined,
    destination: sp.dest || undefined,
  };
  const [rows, customers, months, destinations] = await Promise.all([
    listDebitNotes(filters),
    listCustomers(true),
    listYearMonths(),
    listDestinations(),
  ]);

  const totals = rows.reduce(
    (a, r) => ({ tonnage: a.tonnage + r.tonnage, amount: a.amount + r.totalAmount, cost: a.cost + r.totalCost, profit: a.profit + r.profit }),
    { tonnage: 0, amount: 0, cost: 0, profit: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Debit Notes</h1>
        <Link href="/debit-notes/new" className="btn btn-primary">
          + New Debit Note
        </Link>
      </div>

      <form className="card p-3 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-48">
          <label className="label">Search</label>
          <input name="q" defaultValue={sp.q ?? ""} className="input" placeholder="DN no, invoice no, B/L, vessel, buyer…" />
        </div>
        <div>
          <label className="label">Month</label>
          <select name="ym" defaultValue={sp.ym ?? ""} className="input">
            <option value="">All</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {fmtYearMonth(m)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Customer</label>
          <select name="customer" defaultValue={sp.customer ?? ""} className="input">
            <option value="">All</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Destination</label>
          <select name="dest" defaultValue={sp.dest ?? ""} className="input">
            <option value="">All</option>
            {destinations.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-secondary">Filter</button>
        <Link href="/debit-notes" className="btn text-slate-500">
          Clear
        </Link>
      </form>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>DN No.</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Buyer</th>
              <th>Inv. No.</th>
              <th>Vessel</th>
              <th>Destination</th>
              <th className="num">Boxes</th>
              <th className="num">M/Tons</th>
              <th className="num">Amount S$</th>
              <th className="num">Cost S$</th>
              <th className="num">Profit S$</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="text-center text-slate-500 py-8">
                  No debit notes yet.{" "}
                  <Link href="/debit-notes/new" className="text-emerald-700 underline">
                    Create the first one
                  </Link>
                  .
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td>
                  <Link href={`/debit-notes/${r.id}`} className="font-medium text-emerald-700 hover:underline">
                    {r.dnNumber}
                  </Link>
                </td>
                <td className="whitespace-nowrap">{fmtDate(r.dnDate)}</td>
                <td>{r.customer.name}</td>
                <td>{r.buyer?.name ?? ""}</td>
                <td>{r.customerInvoiceRef}</td>
                <td className="whitespace-nowrap">
                  {r.oceanVessel} {r.oceanVoyage}
                </td>
                <td>{r.destination}</td>
                <td className="num">{fmtMoney(r.boxes, 0)}</td>
                <td className="num">{fmtMoney(r.tonnage)}</td>
                <td className="num">{fmtMoney(r.totalAmount)}</td>
                <td className="num">{fmtMoney(r.totalCost)}</td>
                <td className={`num ${r.profit < 0 ? "text-red-600" : ""}`}>{fmtMoney(r.profit)}</td>
                <td className="whitespace-nowrap">
                  <a href={`/debit-notes/${r.id}/pdf`} target="_blank" className="text-xs text-slate-600 hover:text-emerald-700 underline">
                    PDF
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="font-semibold bg-slate-50">
                <td colSpan={7}>
                  {rows.length} debit note{rows.length === 1 ? "" : "s"}
                </td>
                <td></td>
                <td className="num">{fmtMoney(totals.tonnage)}</td>
                <td className="num">{fmtMoney(totals.amount)}</td>
                <td className="num">{fmtMoney(totals.cost)}</td>
                <td className="num">{fmtMoney(totals.profit)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
