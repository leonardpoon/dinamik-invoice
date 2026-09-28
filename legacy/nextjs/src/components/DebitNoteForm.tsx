"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  COST_BASIS_LABEL,
  COST_CATEGORY_LABEL,
  computeCargo,
  computeCosts,
  type CostBasis,
  type CostCategory,
  type CostLineInput,
} from "@/lib/calc";
import { fmtMoney } from "@/lib/format";
import { amountToWords } from "@/lib/words";
import { saveDebitNote, suggestDnNumber, type SaveDebitNoteResult } from "@/app/debit-notes/actions";

export interface DebitNoteFormValues {
  dnNumber: string;
  dnDate: string;
  customerId: string;
  customerInvoiceRef: string;
  buyerName: string;
  contractNo: string;
  boxes: string;
  packingDesc: string;
  boxesPerContainer: string;
  mtPerContainer: string;
  productDesc: string;
  feederVessel: string;
  feederVoyage: string;
  feederArrivalDate: string;
  blNumber: string;
  blRef: string;
  oceanVessel: string;
  oceanVoyage: string;
  destination: string;
  blDate: string;
  chargeDesc: string;
  ratePerMt: string;
  remarks: string;
}

export interface CostLineForm {
  key: string;
  category: CostCategory;
  code: string;
  label: string;
  basis: CostBasis;
  rate: string;
  sortOrder: number;
}

interface Props {
  id: number | null;
  initial: DebitNoteFormValues;
  initialCosts: CostLineForm[];
  rateCard: CostLineForm[];
  customers: { id: number; name: string }[];
  buyers: string[];
  destinations: string[];
  feederVessels: string[];
  oceanVessels: string[];
}

const CATEGORIES: CostCategory[] = ["PORT", "TRANSPORT", "MISC"];
const BASES: CostBasis[] = ["PER_CONTAINER", "PER_BOX", "PER_MT", "FLAT"];

let keySeq = 0;
export function newKey() {
  keySeq += 1;
  return `k${Date.now()}_${keySeq}`;
}

export default function DebitNoteForm(props: Props) {
  const { id } = props;
  const [v, setV] = useState<DebitNoteFormValues>(props.initial);
  const [costs, setCosts] = useState<CostLineForm[]>(props.initialCosts);
  const [suggested, setSuggested] = useState<string>("");

  const [state, formAction, pending] = useActionState<SaveDebitNoteResult | null, FormData>(
    async (_prev, fd) => saveDebitNote(id, fd),
    null,
  );
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  // Suggest the next running number for the chosen month (new notes only).
  useEffect(() => {
    if (id !== null || !v.dnDate) return;
    let cancelled = false;
    suggestDnNumber(v.dnDate).then((s) => {
      if (!cancelled) setSuggested(s);
    });
    return () => {
      cancelled = true;
    };
  }, [id, v.dnDate]);

  const cargo = useMemo(
    () =>
      computeCargo({
        boxes: +v.boxes,
        boxesPerContainer: +v.boxesPerContainer,
        mtPerContainer: +v.mtPerContainer,
        ratePerMt: +v.ratePerMt,
      }),
    [v.boxes, v.boxesPerContainer, v.mtPerContainer, v.ratePerMt],
  );

  const costCalc = useMemo(() => {
    const lines: CostLineInput[] = costs.map((c) => ({
      category: c.category,
      code: c.code,
      label: c.label,
      basis: c.basis,
      rate: +c.rate || 0,
      sortOrder: c.sortOrder,
    }));
    return computeCosts(lines, { containers: cargo.containers, boxes: +v.boxes || 0, tonnage: cargo.tonnage });
  }, [costs, cargo, v.boxes]);

  const profit = Math.round((cargo.totalAmount - costCalc.totalCost) * 100) / 100;
  const margin = cargo.totalAmount > 0 ? (profit / cargo.totalAmount) * 100 : 0;

  const set = (k: keyof DebitNoteFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  const updateCost = (key: string, patch: Partial<CostLineForm>) =>
    setCosts((p) => p.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const removeCost = (key: string) => setCosts((p) => p.filter((c) => c.key !== key));
  const addCost = (category: CostCategory) =>
    setCosts((p) => [
      ...p,
      {
        key: newKey(),
        category,
        code: "",
        label: "",
        basis: "PER_CONTAINER",
        rate: "0",
        sortOrder: (Math.max(0, ...p.filter((c) => c.category === category).map((c) => c.sortOrder)) || 0) + 10,
      },
    ]);
  const resetToRateCard = () => setCosts(props.rateCard.map((c) => ({ ...c, key: newKey() })));

  const costsJson = JSON.stringify(
    costs.map((c) => ({
      category: c.category,
      code: c.code,
      label: c.label,
      basis: c.basis,
      rate: +c.rate || 0,
      sortOrder: c.sortOrder,
    })),
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="costs" value={costsJson} />

      {state && !state.ok && (
        <div className="rounded border border-red-300 bg-red-50 text-red-800 px-4 py-2 text-sm">{state.error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ---------- Document ---------- */}
        <section className="card lg:col-span-1">
          <h2 className="card-title">Document</h2>
          <div className="p-4 grid grid-cols-2 gap-3">
            <Field label="Debit Note No." error={fe.dnNumber} hint={id === null ? "Leave blank to auto-assign" : undefined}>
              <input
                name="dnNumber"
                className={cls("input", fe.dnNumber)}
                value={v.dnNumber}
                onChange={set("dnNumber")}
                placeholder={id === null && suggested ? `Auto: ${suggested}` : "DN202609-01"}
              />
            </Field>
            <Field label="Date" error={fe.dnDate}>
              <input type="date" name="dnDate" className={cls("input", fe.dnDate)} value={v.dnDate} onChange={set("dnDate")} required />
            </Field>
            <Field label="Bill to (Customer)" error={fe.customerId} className="col-span-2">
              <select name="customerId" className={cls("input", fe.customerId)} value={v.customerId} onChange={set("customerId")} required>
                <option value="">Select customer…</option>
                {props.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Your Invoice No." error={fe.customerInvoiceRef} className="col-span-2">
              <input name="customerInvoiceRef" className="input" value={v.customerInvoiceRef} onChange={set("customerInvoiceRef")} placeholder="88011" />
            </Field>
            <Field label="Buyer / Consignee" className="col-span-2">
              <input name="buyerName" list="buyers" className="input" value={v.buyerName} onChange={set("buyerName")} placeholder="Meridian Tyre Manufacturing Pte Ltd" />
              <datalist id="buyers">
                {props.buyers.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>
            <Field label="Contract No." className="col-span-2">
              <input name="contractNo" className="input" value={v.contractNo} onChange={set("contractNo")} placeholder="410275" />
            </Field>
          </div>
        </section>

        {/* ---------- Cargo ---------- */}
        <section className="card lg:col-span-1">
          <h2 className="card-title">Cargo</h2>
          <div className="p-4 grid grid-cols-2 gap-3">
            <Field label="Boxes" error={fe.boxes}>
              <input type="number" step="any" min="0" name="boxes" className={cls("input num", fe.boxes)} value={v.boxes} onChange={set("boxes")} required />
            </Field>
            <Field label="Packing" error={fe.packingDesc}>
              <input name="packingDesc" className={cls("input", fe.packingDesc)} value={v.packingDesc} onChange={set("packingDesc")} required />
            </Field>
            <Field label="Boxes per container" error={fe.boxesPerContainer}>
              <input type="number" step="any" min="0" name="boxesPerContainer" className={cls("input num", fe.boxesPerContainer)} value={v.boxesPerContainer} onChange={set("boxesPerContainer")} required />
            </Field>
            <Field label="M/Tons per container" error={fe.mtPerContainer}>
              <input type="number" step="any" min="0" name="mtPerContainer" className={cls("input num", fe.mtPerContainer)} value={v.mtPerContainer} onChange={set("mtPerContainer")} required />
            </Field>
            <Field label="Product" className="col-span-2">
              <input name="productDesc" className="input" value={v.productDesc} onChange={set("productDesc")} placeholder="SMR 20 Rubber" />
            </Field>
            <div className="col-span-2 grid grid-cols-2 gap-3 rounded bg-slate-50 border border-slate-200 p-3 text-sm">
              <Stat label="Containers" value={fmtMoney(cargo.containers, 4)} />
              <Stat label="Tonnage (M/Tons)" value={fmtMoney(cargo.tonnage, 2)} />
            </div>
          </div>
        </section>

        {/* ---------- Charge ---------- */}
        <section className="card lg:col-span-1">
          <h2 className="card-title">Charge (SGD)</h2>
          <div className="p-4 grid grid-cols-2 gap-3">
            <Field label="Description" error={fe.chargeDesc} className="col-span-2">
              <input name="chargeDesc" className={cls("input", fe.chargeDesc)} value={v.chargeDesc} onChange={set("chargeDesc")} required />
            </Field>
            <Field label="Rate per M/Ton (S$)" error={fe.ratePerMt}>
              <input type="number" step="0.01" min="0" name="ratePerMt" className={cls("input num", fe.ratePerMt)} value={v.ratePerMt} onChange={set("ratePerMt")} required />
            </Field>
            <Field label="Amount (S$)">
              <input className="input num" value={fmtMoney(cargo.chargeAmount)} readOnly disabled />
            </Field>
            <div className="col-span-2 rounded bg-slate-50 border border-slate-200 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-slate-600">Total</span>
                <span className="text-lg font-semibold tabular-nums">S$ {fmtMoney(cargo.totalAmount)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600 italic">Singapore Dollars {amountToWords(cargo.totalAmount)}</p>
            </div>
          </div>
        </section>
      </div>

      {/* ---------- Shipment ---------- */}
      <section className="card">
        <h2 className="card-title">Shipment</h2>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <Field label="Ex (feeder vessel)" className="col-span-2">
            <input name="feederVessel" list="feederVessels" className="input" value={v.feederVessel} onChange={set("feederVessel")} placeholder="Coral Star" />
            <datalist id="feederVessels">{props.feederVessels.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
          <Field label="Voyage">
            <input name="feederVoyage" className="input" value={v.feederVoyage} onChange={set("feederVoyage")} placeholder="2609W" />
          </Field>
          <Field label="Arrived">
            <input type="date" name="feederArrivalDate" className="input" value={v.feederArrivalDate} onChange={set("feederArrivalDate")} />
          </Field>
          <Field label="B/L No." className="col-span-2">
            <input name="blNumber" className="input" value={v.blNumber} onChange={set("blNumber")} placeholder="MVSS2609W-XYZ01" />
          </Field>
          <Field label="B/L ref (in brackets)" className="col-span-2">
            <input name="blRef" className="input" value={v.blRef} onChange={set("blRef")} placeholder="205/26 Riverside Estate" />
          </Field>
          <Field label="Shipped per (ocean vessel)" className="col-span-2">
            <input name="oceanVessel" list="oceanVessels" className="input" value={v.oceanVessel} onChange={set("oceanVessel")} placeholder="Pacific Voyager" />
            <datalist id="oceanVessels">{props.oceanVessels.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
          <Field label="Voyage">
            <input name="oceanVoyage" className="input" value={v.oceanVoyage} onChange={set("oceanVoyage")} placeholder="12E" />
          </Field>
          <Field label="B/L dated">
            <input type="date" name="blDate" className="input" value={v.blDate} onChange={set("blDate")} />
          </Field>
          <Field label="Destination (To)" className="col-span-2">
            <input name="destination" list="destinations" className="input" value={v.destination} onChange={set("destination")} placeholder="Savannah, USA" />
            <datalist id="destinations">{props.destinations.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
          <Field label="Remarks (internal, not printed)" className="col-span-2">
            <input name="remarks" className="input" value={v.remarks} onChange={set("remarks")} />
          </Field>
        </div>
      </section>

      {/* ---------- Costing ---------- */}
      <section className="card">
        <div className="card-title flex items-center justify-between">
          <span>Costing (printed on accounts copy only)</span>
          <button type="button" onClick={resetToRateCard} className="btn btn-secondary text-xs py-1">
            Reset to rate card
          </button>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {CATEGORIES.map((cat) => {
            const rows = costs.filter((c) => c.category === cat);
            return (
              <div key={cat} className="rounded border border-slate-200">
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                  <span className="text-xs font-semibold uppercase text-slate-600">{COST_CATEGORY_LABEL[cat]}</span>
                  <span className="text-sm font-semibold tabular-nums">{fmtMoney(costCalc.byCategory[cat])}</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="text-left px-2 py-1 font-medium">Code</th>
                      <th className="text-left px-2 py-1 font-medium">Basis</th>
                      <th className="text-right px-2 py-1 font-medium">Rate</th>
                      <th className="text-right px-2 py-1 font-medium">Amount</th>
                      <th className="w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => {
                      const computed = costCalc.lines.find(
                        (l) => l.category === c.category && l.code === c.code && l.sortOrder === c.sortOrder,
                      );
                      return (
                        <tr key={c.key} className="border-t border-slate-100">
                          <td className="px-1 py-1">
                            <input
                              className="input py-1 px-1.5 text-xs uppercase"
                              value={c.code}
                              onChange={(e) => updateCost(c.key, { code: e.target.value.toUpperCase() })}
                              placeholder="CODE"
                            />
                          </td>
                          <td className="px-1 py-1">
                            <select
                              className="input py-1 px-1 text-xs"
                              value={c.basis}
                              onChange={(e) => updateCost(c.key, { basis: e.target.value as CostBasis })}
                            >
                              {BASES.map((b) => (
                                <option key={b} value={b}>
                                  {COST_BASIS_LABEL[b]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-1 py-1">
                            <input
                              type="number"
                              step="any"
                              className="input py-1 px-1.5 text-xs num w-20"
                              value={c.rate}
                              onChange={(e) => updateCost(c.key, { rate: e.target.value })}
                            />
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmtMoney(computed?.amount ?? 0)}</td>
                          <td className="px-1 py-1 text-center">
                            <button
                              type="button"
                              onClick={() => removeCost(c.key)}
                              className="text-slate-400 hover:text-red-600"
                              title="Remove line"
                              aria-label="Remove line"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-2 py-1.5 border-t border-slate-100">
                  <button type="button" onClick={() => addCost(cat)} className="text-xs text-emerald-700 hover:underline">
                    + Add line
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded bg-slate-50 border border-slate-200 p-3 text-sm">
            <Stat label="Revenue" value={`S$ ${fmtMoney(cargo.totalAmount)}`} />
            <Stat label="Total cost" value={`S$ ${fmtMoney(costCalc.totalCost)}`} />
            <Stat label="Profit" value={`S$ ${fmtMoney(profit)}`} strong tone={profit < 0 ? "bad" : "good"} />
            <Stat label="Margin" value={`${fmtMoney(margin, 1)} %`} />
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3 sticky bottom-0 bg-slate-50/90 backdrop-blur py-3 border-t border-slate-200">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Saving…" : id === null ? "Create debit note" : "Save changes"}
        </button>
        <Link href={id === null ? "/debit-notes" : `/debit-notes/${id}`} className="btn btn-secondary">
          Cancel
        </Link>
        <span className="ml-auto text-sm text-slate-600">
          Total <strong className="tabular-nums">S$ {fmtMoney(cargo.totalAmount)}</strong> · Profit{" "}
          <strong className={`tabular-nums ${profit < 0 ? "text-red-600" : "text-emerald-700"}`}>S$ {fmtMoney(profit)}</strong>
        </span>
      </div>
    </form>
  );
}

function cls(base: string, error?: string) {
  return error ? `${base} input-error` : base;
}

function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {error ? <p className="text-xs text-red-600 mt-1">{error}</p> : hint ? <p className="text-xs text-slate-400 mt-1">{hint}</p> : null}
    </div>
  );
}

function Stat({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "good" | "bad" }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`tabular-nums ${strong ? "font-semibold" : ""} ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : ""}`}>
        {value}
      </div>
    </div>
  );
}
