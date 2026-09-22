import Link from "next/link";
import { notFound } from "next/navigation";
import DeleteDebitNoteButton from "@/components/DeleteDebitNoteButton";
import { COST_CATEGORY_LABEL, type CostCategory } from "@/lib/calc";
import { fmtDate, fmtMoney } from "@/lib/format";
import { getDebitNote } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DebitNoteViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const dn = await getDebitNote(Number(id));
  if (!dn) notFound();

  const cats: CostCategory[] = ["PORT", "TRANSPORT", "MISC"];
  const margin = dn.totalAmount > 0 ? (dn.profit / dn.totalAmount) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/debit-notes" className="text-sm text-slate-500 hover:underline">
          ← Debit Notes
        </Link>
        <h1 className="text-xl font-semibold">{dn.dnNumber}</h1>
        <span className="text-sm text-slate-500">{fmtDate(dn.dnDate)}</span>
        <div className="ml-auto flex gap-2">
          <a href={`/debit-notes/${dn.id}/pdf?download=1`} className="btn btn-primary">
            Download PDF
          </a>
          <a href={`/debit-notes/${dn.id}/pdf`} target="_blank" className="btn btn-secondary">
            Open PDF
          </a>
          <Link href={`/debit-notes/${dn.id}/edit`} className="btn btn-secondary">
            Edit
          </Link>
          <DeleteDebitNoteButton id={dn.id} dnNumber={dn.dnNumber} />
        </div>
      </div>

      {sp.saved === "1" && (
        <div className="rounded border border-emerald-300 bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">
          Debit note saved. The PDF below contains the customer copy (page 1) and the accounts copy (page 2).
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card overflow-hidden" style={{ minHeight: 800 }}>
          <iframe src={`/debit-notes/${dn.id}/pdf#toolbar=1`} title="PDF preview" className="w-full h-[900px]" />
        </div>

        <div className="space-y-4">
          <section className="card">
            <h2 className="card-title">Summary</h2>
            <dl className="p-4 text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <Dt>Customer</Dt>
              <Dd>{dn.customer.name}</Dd>
              <Dt>Buyer</Dt>
              <Dd>{dn.buyer?.name ?? "—"}</Dd>
              <Dt>Your Inv. No.</Dt>
              <Dd>{dn.customerInvoiceRef || "—"}</Dd>
              <Dt>Contract</Dt>
              <Dd>{dn.contractNo || "—"}</Dd>
              <Dt>Cargo</Dt>
              <Dd>
                {fmtMoney(dn.boxes, 0)} {dn.packingDesc} · {fmtMoney(dn.tonnage)} M/Tons · {dn.productDesc}
              </Dd>
              <Dt>Containers</Dt>
              <Dd>{fmtMoney(dn.containers, 4)}</Dd>
              <Dt>Feeder</Dt>
              <Dd>
                {dn.feederVessel} {dn.feederVoyage} {dn.feederArrivalDate ? `· arrd ${fmtDate(dn.feederArrivalDate)}` : ""}
              </Dd>
              <Dt>B/L</Dt>
              <Dd>
                {dn.blNumber} {dn.blRef ? `(${dn.blRef})` : ""} {dn.blDate ? `· dated ${fmtDate(dn.blDate)}` : ""}
              </Dd>
              <Dt>Ocean</Dt>
              <Dd>
                {dn.oceanVessel} {dn.oceanVoyage} {dn.destination ? `→ ${dn.destination}` : ""}
              </Dd>
              <Dt>Charge</Dt>
              <Dd>
                {dn.chargeDesc} @ S$ {fmtMoney(dn.ratePerMt)} / M/Ton
              </Dd>
              {dn.remarks && (
                <>
                  <Dt>Remarks</Dt>
                  <Dd>{dn.remarks}</Dd>
                </>
              )}
            </dl>
          </section>

          <section className="card">
            <h2 className="card-title">Profitability (internal)</h2>
            <div className="p-4 text-sm space-y-2">
              <Row label="Revenue" value={`S$ ${fmtMoney(dn.totalAmount)}`} />
              {cats.map((cat) => (
                <Row
                  key={cat}
                  label={COST_CATEGORY_LABEL[cat]}
                  value={fmtMoney(dn.costs.filter((c) => c.category === cat).reduce((a, c) => a + c.amount, 0))}
                  muted
                />
              ))}
              <Row label="Total cost" value={`S$ ${fmtMoney(dn.totalCost)}`} />
              <div className="border-t border-slate-200 pt-2">
                <Row label="Profit" value={`S$ ${fmtMoney(dn.profit)}`} strong tone={dn.profit < 0 ? "bad" : "good"} />
                <Row label="Margin" value={`${fmtMoney(margin, 1)} %`} muted />
              </div>
            </div>
          </section>

          <p className="text-xs text-slate-400">
            Created {fmtDate(dn.createdAt)} · Updated {fmtDate(dn.updatedAt)}
          </p>
        </div>
      </div>
    </div>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="text-slate-500 whitespace-nowrap">{children}</dt>;
}
function Dd({ children }: { children: React.ReactNode }) {
  return <dd className="text-slate-900">{children}</dd>;
}
function Row({ label, value, strong, muted, tone }: { label: string; value: string; strong?: boolean; muted?: boolean; tone?: "good" | "bad" }) {
  return (
    <div className={`flex justify-between ${muted ? "text-slate-500 pl-3" : ""} ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : ""}`}>{value}</span>
    </div>
  );
}
