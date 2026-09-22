"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthPoint, NamedPoint } from "@/lib/dashboard";
import { fmtMoney } from "@/lib/format";

// Validated reference palette (dataviz skill): slot 1 blue, slot 2 orange.
const SERIES_1 = "#2a78d6";
const SERIES_2 = "#eb6834";
const GRID = "#e1e0d9";
const AXIS = "#898781";

const tickStyle = { fontSize: 11, fill: AXIS };
const compact = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("en-SG", { maximumFractionDigits: 1 })}k` : String(v));

function Tip({ active, payload, label, unit }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; unit: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-slate-200 bg-white shadow px-3 py-2 text-xs">
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
          <span className="text-slate-600">{p.name}</span>
          <span className="ml-auto tabular-nums pl-3">
            {unit === "S$" ? "S$ " : ""}
            {fmtMoney(p.value, unit === "S$" ? 2 : unit === "" ? 0 : 2)}
            {unit && unit !== "S$" ? ` ${unit}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TonnageByMonth({ data }: { data: MonthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="35%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={tickStyle} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={compact} width={52} />
        <Tooltip content={<Tip unit="M/T" />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Bar dataKey="tonnage" name="Tonnage" fill={SERIES_1} maxBarSize={24} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RevenueCostByMonth({ data }: { data: MonthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={tickStyle} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={compact} width={52} />
        <Tooltip content={<Tip unit="S$" />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={8} />
        <Bar dataKey="revenue" name="Revenue" fill={SERIES_1} maxBarSize={20} radius={[4, 4, 0, 0]} />
        <Bar dataKey="cost" name="Cost" fill={SERIES_2} maxBarSize={20} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HorizontalTonnage({ data, height }: { data: NamedPoint[]; height?: number }) {
  const h = height ?? Math.max(120, data.length * 32 + 24);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={compact} />
        <YAxis type="category" dataKey="name" tick={tickStyle} axisLine={{ stroke: GRID }} tickLine={false} width={130} />
        <Tooltip content={<Tip unit="M/T" />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Bar
          dataKey="tonnage"
          name="Tonnage"
          fill={SERIES_1}
          maxBarSize={20}
          radius={[0, 4, 4, 0]}
          label={{ position: "right", fontSize: 11, fill: "#52514e", formatter: (v: unknown) => fmtMoney(Number(v), 1) }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
