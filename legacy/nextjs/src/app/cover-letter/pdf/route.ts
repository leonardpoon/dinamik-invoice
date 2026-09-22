import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import CoverLetterPdf from "@/pdf/CoverLetterPdf";
import { getSettings, listCustomers, listDebitNotesForCoverLetter } from "@/lib/queries";
import { parseInputDate, todayUtc } from "@/lib/format";

export const dynamic = "force-dynamic";

function ym(s: string | null): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s ?? "");
  return m ? `${m[1]}${m[2]}` : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const customerId = Number(url.searchParams.get("customer"));
  const fromYm = ym(url.searchParams.get("from"));
  const toYm = ym(url.searchParams.get("to")) ?? fromYm;
  const date = parseInputDate(url.searchParams.get("date")) ?? todayUtc();
  if (!customerId || !fromYm || !toYm) return new Response("Missing parameters", { status: 400 });

  const [settings, customers] = await Promise.all([getSettings(), listCustomers(true)]);
  const customer = customers.find((c) => c.id === customerId);
  if (!customer) return new Response("Customer not found", { status: 404 });

  const notes = await listDebitNotesForCoverLetter(customer.id, fromYm, toYm);
  const buffer = await renderToBuffer(
    createElement(CoverLetterPdf, { settings, customer, date, dnNumbers: notes.map((n) => n.dnNumber) }) as unknown as ReactElement<DocumentProps>,
  );
  const download = url.searchParams.get("download") === "1";
  const filename = `Cover-Letter-${customer.name.replace(/[^\w]+/g, "-")}-${fromYm}${toYm !== fromYm ? `-${toYm}` : ""}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
