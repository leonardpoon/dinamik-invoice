import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dinamik Invoice",
  description: "Debit note generator for Dinamik Shipping Pte Ltd",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/debit-notes", label: "Debit Notes" },
  { href: "/cover-letter", label: "Cover Letter" },
  { href: "/customers", label: "Customers" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="bg-slate-900 text-white">
          <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-8">
            <Link href="/" className="font-semibold tracking-wide">
              DINAMIK <span className="text-slate-400 font-normal">Invoice</span>
            </Link>
            <nav className="flex gap-1 text-sm">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="px-3 py-1.5 rounded hover:bg-slate-700 text-slate-200 hover:text-white"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto">
              <Link
                href="/debit-notes/new"
                className="text-sm bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-medium px-3 py-1.5 rounded"
              >
                + New Debit Note
              </Link>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 flex-1">{children}</main>
      </body>
    </html>
  );
}
