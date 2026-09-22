import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import DebitNotePdf from "@/pdf/DebitNotePdf";
import { getDebitNote, getSettings } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [dn, settings] = await Promise.all([getDebitNote(Number(id)), getSettings()]);
  if (!dn) return new Response("Not found", { status: 404 });

  const buffer = await renderToBuffer(createElement(DebitNotePdf, { dn, settings }) as unknown as ReactElement<DocumentProps>);
  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = `${dn.dnNumber}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
