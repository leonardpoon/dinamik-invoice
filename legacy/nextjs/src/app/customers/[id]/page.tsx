import Link from "next/link";
import { notFound } from "next/navigation";
import CustomerForm from "@/components/CustomerForm";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.customer.findUnique({ where: { id: Number(id) } });
  if (!c) notFound();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/customers" className="text-sm text-slate-500 hover:underline">
          ← Customers
        </Link>
        <h1 className="text-xl font-semibold">{c.name}</h1>
      </div>
      <CustomerForm
        id={c.id}
        initial={{
          name: c.name,
          addressLine1: c.addressLine1,
          addressLine2: c.addressLine2,
          addressLine3: c.addressLine3,
          addressLine4: c.addressLine4,
          addressLine5: c.addressLine5,
          attention: c.attention,
          active: c.active,
        }}
      />
    </div>
  );
}
