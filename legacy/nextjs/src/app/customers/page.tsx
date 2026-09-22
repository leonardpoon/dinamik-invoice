import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { debitNotes: true } } },
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Customers</h1>
        <Link href="/customers/new" className="btn btn-primary">
          + New Customer
        </Link>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Attention</th>
              <th className="num">Debit notes</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td>
                  <Link href={`/customers/${c.id}`} className="font-medium text-emerald-700 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="text-slate-600">
                  {[c.addressLine1, c.addressLine2, c.addressLine3, c.addressLine4, c.addressLine5].filter(Boolean).join(", ")}
                </td>
                <td>{c.attention}</td>
                <td className="num">{c._count.debitNotes}</td>
                <td>
                  {c.active ? (
                    <span className="text-xs rounded bg-emerald-100 text-emerald-800 px-2 py-0.5">Active</span>
                  ) : (
                    <span className="text-xs rounded bg-slate-200 text-slate-600 px-2 py-0.5">Inactive</span>
                  )}
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-slate-500 py-8">
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
