import Link from "next/link";
import CustomerForm from "@/components/CustomerForm";

export default function NewCustomerPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/customers" className="text-sm text-slate-500 hover:underline">
          ← Customers
        </Link>
        <h1 className="text-xl font-semibold">New Customer</h1>
      </div>
      <CustomerForm
        id={null}
        initial={{ name: "", addressLine1: "", addressLine2: "", addressLine3: "", addressLine4: "", addressLine5: "", attention: "", active: true }}
      />
    </div>
  );
}
