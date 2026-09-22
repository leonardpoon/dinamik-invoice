"use client";

import { useState, useTransition } from "react";
import { saveRateCard, type ActionResult } from "@/app/settings/actions";
import { COST_BASIS_LABEL, COST_CATEGORY_LABEL, type CostBasis, type CostCategory } from "@/lib/calc";
import type { RateCardPlain } from "@/lib/queries";

interface Line {
  key: string;
  id: number | null;
  category: CostCategory;
  code: string;
  label: string;
  basis: CostBasis;
  rate: string;
  sortOrder: number;
}

const CATEGORIES: CostCategory[] = ["PORT", "TRANSPORT", "MISC"];
const BASES: CostBasis[] = ["PER_CONTAINER", "PER_BOX", "PER_MT", "FLAT"];
let seq = 0;

export default function RateCardEditor({ initial }: { initial: RateCardPlain }) {
  const [lines, setLines] = useState<Line[]>(
    initial.map((r) => ({ key: `r${r.id}`, id: r.id, category: r.category, code: r.code, label: r.label, basis: r.basis, rate: String(r.rate), sortOrder: r.sortOrder })),
  );
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  const update = (key: string, patch: Partial<Line>) => setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setLines((p) => p.filter((l) => l.key !== key));
  const add = (category: CostCategory) =>
    setLines((p) => [
      ...p,
      {
        key: `n${++seq}`,
        id: null,
        category,
        code: "",
        label: "",
        basis: "PER_CONTAINER",
        rate: "0",
        sortOrder: (Math.max(0, ...p.filter((l) => l.category === category).map((l) => l.sortOrder)) || 0) + 10,
      },
    ]);
  const move = (key: string, dir: -1 | 1) =>
    setLines((p) => {
      const cat = p.find((l) => l.key === key)?.category;
      const inCat = p.filter((l) => l.category === cat);
      const idx = inCat.findIndex((l) => l.key === key);
      const j = idx + dir;
      if (j < 0 || j >= inCat.length) return p;
      const a = inCat[idx];
      const b = inCat[j];
      return p.map((l) => (l.key === a.key ? { ...l, sortOrder: b.sortOrder } : l.key === b.key ? { ...l, sortOrder: a.sortOrder } : l));
    });

  const save = () =>
    start(async () => {
      const payload = lines.map((l) => ({
        id: l.id,
        category: l.category,
        code: l.code.trim().toUpperCase(),
        label: l.label,
        basis: l.basis,
        rate: Number(l.rate) || 0,
        sortOrder: l.sortOrder,
      }));
      setResult(await saveRateCard(JSON.stringify(payload)));
    });

  return (
    <div className="card">
      <div className="card-title flex items-center justify-between">
        <span>Cost rate card (defaults copied onto each new debit note)</span>
        <button type="button" onClick={save} disabled={pending} className="btn btn-primary text-xs py-1">
          {pending ? "Saving…" : "Save rate card"}
        </button>
      </div>
      <div className="p-4 space-y-4">
        {result && (
          <div
            className={`rounded px-3 py-2 text-sm border ${
              result.ok ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800"
            }`}
          >
            {result.ok ? result.message : result.error}
          </div>
        )}
        <p className="text-xs text-slate-500">
          Amount on a debit note = rate × containers (boxes ÷ boxes per container), × boxes, × tonnage, or a flat amount. Changing the
          card only affects debit notes created afterwards; existing notes keep their own costs.
        </p>
        {CATEGORIES.map((cat) => {
          const rows = lines.filter((l) => l.category === cat).sort((a, b) => a.sortOrder - b.sortOrder);
          return (
            <div key={cat} className="rounded border border-slate-200">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-600">
                {COST_CATEGORY_LABEL[cat]}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="text-left px-2 py-1 font-medium w-28">Code</th>
                    <th className="text-left px-2 py-1 font-medium">Description</th>
                    <th className="text-left px-2 py-1 font-medium w-36">Basis</th>
                    <th className="text-right px-2 py-1 font-medium w-28">Rate (S$)</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.key} className="border-t border-slate-100">
                      <td className="px-1 py-1">
                        <input className="input py-1 uppercase" value={l.code} onChange={(e) => update(l.key, { code: e.target.value.toUpperCase() })} />
                      </td>
                      <td className="px-1 py-1">
                        <input className="input py-1" value={l.label} onChange={(e) => update(l.key, { label: e.target.value })} />
                      </td>
                      <td className="px-1 py-1">
                        <select className="input py-1" value={l.basis} onChange={(e) => update(l.key, { basis: e.target.value as CostBasis })}>
                          {BASES.map((b) => (
                            <option key={b} value={b}>
                              {COST_BASIS_LABEL[b]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" step="any" className="input py-1 num" value={l.rate} onChange={(e) => update(l.key, { rate: e.target.value })} />
                      </td>
                      <td className="px-1 py-1 whitespace-nowrap text-slate-400">
                        <button type="button" className="px-1 hover:text-slate-800" onClick={() => move(l.key, -1)} title="Move up" aria-label="Move up">
                          ↑
                        </button>
                        <button type="button" className="px-1 hover:text-slate-800" onClick={() => move(l.key, 1)} title="Move down" aria-label="Move down">
                          ↓
                        </button>
                        <button type="button" className="px-1 hover:text-red-600" onClick={() => remove(l.key)} title="Remove" aria-label="Remove">
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-2 py-1.5 border-t border-slate-100">
                <button type="button" onClick={() => add(cat)} className="text-xs text-emerald-700 hover:underline">
                  + Add line
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
