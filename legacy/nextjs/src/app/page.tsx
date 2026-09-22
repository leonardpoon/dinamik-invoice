import Link from "next/link";
import { HorizontalTonnage, RevenueCostByMonth, TonnageByMonth } from "@/components/DashboardCharts";
import { byBuyer, byCustomer, byDestination, byVessel, listYears, monthlySeries, recentDebitNotes, totals } from "@/lib/dashboard";
import { fmtDate, fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const sp = await searchParams;
  const years = await listYears();
  const currentYear = new Date().getFullYear();
  const year = Number(sp.year) || years[0] || currentYear;
  const yearOptions = years.includes(currentYear) ? years : [currentYear, ...years];

  const [months, dest, buyers, customers, vessels, recent, tot] = await Promise.all([
    monthlySeries(year),
    byDestination(year),
    byBuyer(year),
    byCustomer(year),
    byVessel(year),
    recentDebitNotes(8),
    totals(year),
  ]);

  const nowYm = `${currentYear}${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = months.find((m) => m.yearMonth === nowYm);
  const margin = tot.revenue > 0 ? (tot.profit / tot.revenue) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <form className="ml-auto flex items-center gap-2 text-sm">
          <label className="text-slate-600">Year</label>
          <select name="year" defaultValue={year} className="input w-28">
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary">Go</button>
        </form>
      </div>

      {tot.count === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          No debit notes for {year} yet.{" "}
          <Link href="/debit-notes/new" className="text-emerald-700 underline">
            Create one
          </Link>{" "}
          to start seeing analytics.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Tile label={`Debit notes ${year}`} value={String(tot.count)} sub={thisMonth ? `${thisMonth.count} this month` : undefined} />
            <Tile label="Tonnage (M/T)" value={fmtMoney(tot.tonnage, 1)} sub={thisMonth ? `${fmtMoney(thisMonth.tonnage, 1)} this month` : undefined} />
            <Tile label="Containers" value={fmtMoney(tot.containers, 1)} sub={`${fmtMoney(tot.boxes, 0)} boxes`} />
            <Tile label="Revenue (S$)" value={fmtMoney(tot.revenue, 0)} sub={thisMonth ? `${fmtMoney(thisMonth.revenue, 0)} this month` : undefined} />
            <Tile label="Cost (S$)" value={fmtMoney(tot.cost, 0)} />
            <Tile label="Profit (S$)" value={fmtMoney(tot.profit, 0)} sub={`${fmtMoney(margin, 1)} % margin`} tone={tot.profit < 0 ? "bad" : "good"} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title={`Tonnage shipped per month, ${year}`}>
              <TonnageByMonth data={months} />
            </Card>
            <Card title={`Revenue vs cost per month, ${year} (S$)`}>
              <RevenueCostByMonth data={months} />
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card title="Tonnage by destination port">
              <HorizontalTonnage data={dest} />
              <SmallTable rows={dest} />
            </Card>
            <Card title="Tonnage by buyer">
              <HorizontalTonnage data={buyers} />
              <SmallTable rows={buyers} />
            </Card>
            <Card title="Tonnage by ocean vessel">
              <HorizontalTonnage data={vessels} />
              <SmallTable rows={vessels} />
            </Card>
            <Card title="Revenue by customer">
              <SmallTable rows={customers} money />
            </Card>
          </div>

          <Card title="Monthly figures">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="num">DNs</th>
                    <th className="num">Boxes</th>
                    <th className="num">M/Tons</th>
                    <th className="num">Revenue S$</th>
                    <th className="num">Cost S$</th>
                    <th className="num">Profit S$</th>
                    <th className="num">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {months
                    .filter((m) => m.count > 0)
                    .map((m) => (
                      <tr key={m.yearMonth}>
                        <td>
                          <Link href={`/debit-notes?ym=${m.yearMonth}`} className="text-emerald-700 hover:underline">
                            {m.label} {year}
                          </Link>
                        </td>
                        <td className="num">{m.count}</td>
                        <td className="num">{fmtMoney(m.boxes, 0)}</td>
                        <td className="num">{fmtMoney(m.tonnage)}</td>
                        <td className="num">{fmtMoney(m.revenue)}</td>
                        <td className="num">{fmtMoney(m.cost)}</td>
                        <td className={`num ${m.profit < 0 ? "text-red-600" : ""}`}>{fmtMoney(m.profit)}</td>
                        <td className="num">{m.revenue > 0 ? `${fmtMoney((m.profit / m.revenue) * 100, 1)} %` : "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Card title="Recent debit notes">
        <table className="table">
          <thead>
            <tr>
              <th>DN No.</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Buyer</th>
              <th>Destination</th>
              <th className="num">M/Tons</th>
              <th className="num">Amount S$</th>
              <th className="num">Profit S$</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-slate-500 py-6">
                  Nothing yet.
                </td>
              </tr>
            )}
            {recent.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/debit-notes/${r.id}`} className="text-emerald-700 hover:underline font-medium">
                    {r.dnNumber}
                  </Link>
                </td>
                <td className="whitespace-nowrap">{fmtDate(r.dnDate)}</td>
                <td>{r.customer.name}</td>
                <td>{r.buyer?.name ?? ""}</td>
                <td>{r.destination}</td>
                <td className="num">{fmtMoney(r.tonnage)}</td>
                <td className="num">{fmtMoney(r.totalAmount)}</td>
                <td className={`num ${r.profit < 0 ? "text-red-600" : ""}`}>{fmtMoney(r.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="card-title">{title}</h2>
      <div className="p-3">{children}</div>
    </section>
  );
}

function SmallTable({ rows, money }: { rows: { name: string; count: number; tonnage: number; revenue: number; profit: number }[]; money?: boolean }) {
  return (
    <table className="w-full text-xs mt-2">
      <thead>
        <tr className="text-slate-500">
          <th className="text-left font-medium py-1">Name</th>
          <th className="text-right font-medium py-1">DNs</th>
          <th className="text-right font-medium py-1">{money ? "Revenue" : "M/T"}</th>
          <th className="text-right font-medium py-1">Profit</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-t border-slate-100">
            <td className="py-1 pr-2 truncate max-w-40">{r.name}</td>
            <td className="py-1 text-right tabular-nums">{r.count}</td>
            <td className="py-1 text-right tabular-nums">{money ? fmtMoney(r.revenue, 0) : fmtMoney(r.tonnage, 1)}</td>
            <td className={`py-1 text-right tabular-nums ${r.profit < 0 ? "text-red-600" : ""}`}>{fmtMoney(r.profit, 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
