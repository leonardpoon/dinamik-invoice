/**
 * Pure calculation helpers shared by the browser form (live preview) and the
 * server action (authoritative values stored in MySQL). Mirrors the formulas
 * in the original Excel template:
 *
 *   containers = boxes / boxesPerContainer          (C18/16)
 *   tonnage    = containers * mtPerContainer          (C18/16*20.16)
 *   charge     = tonnage * ratePerMt                  (I18*J26)
 *   cost line  = rate * containers | boxes | tonnage | 1
 */

export type CostBasis = "PER_CONTAINER" | "PER_BOX" | "PER_MT" | "FLAT";
export type CostCategory = "PORT" | "TRANSPORT" | "MISC";

export const COST_CATEGORY_LABEL: Record<CostCategory, string> = {
  PORT: "Port Charges",
  TRANSPORT: "Transport",
  MISC: "Misc",
};

export const COST_BASIS_LABEL: Record<CostBasis, string> = {
  PER_CONTAINER: "per container",
  PER_BOX: "per box",
  PER_MT: "per M/Ton",
  FLAT: "flat",
};

export interface CostLineInput {
  category: CostCategory;
  code: string;
  label: string;
  basis: CostBasis;
  rate: number;
  sortOrder: number;
}

export interface CostLineComputed extends CostLineInput {
  amount: number;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export interface CargoInput {
  boxes: number;
  boxesPerContainer: number;
  mtPerContainer: number;
  ratePerMt: number;
}

export interface CargoComputed {
  containers: number;
  tonnage: number;
  chargeAmount: number;
  totalAmount: number;
}

export function computeCargo(input: CargoInput): CargoComputed {
  const boxes = num(input.boxes);
  const bpc = num(input.boxesPerContainer);
  const mpc = num(input.mtPerContainer);
  const rate = num(input.ratePerMt);

  const containers = bpc > 0 ? boxes / bpc : 0;
  const tonnageRaw = containers * mpc;
  // Excel shows tonnage to 2 dp and multiplies the unrounded value; keep 3 dp stored.
  const tonnage = round3(tonnageRaw);
  const chargeAmount = round2(tonnageRaw * rate);
  return {
    containers: round4(containers),
    tonnage,
    chargeAmount,
    totalAmount: chargeAmount,
  };
}

export function computeCostLine(
  line: CostLineInput,
  ctx: { containers: number; boxes: number; tonnage: number },
): CostLineComputed {
  const rate = num(line.rate);
  let amount = 0;
  switch (line.basis) {
    case "PER_CONTAINER":
      amount = rate * ctx.containers;
      break;
    case "PER_BOX":
      amount = rate * ctx.boxes;
      break;
    case "PER_MT":
      amount = rate * ctx.tonnage;
      break;
    case "FLAT":
      amount = rate;
      break;
  }
  return { ...line, rate, amount: round2(amount) };
}

export function computeCosts(
  lines: CostLineInput[],
  ctx: { containers: number; boxes: number; tonnage: number },
) {
  const computed = lines.map((l) => computeCostLine(l, ctx));
  const byCategory: Record<CostCategory, number> = { PORT: 0, TRANSPORT: 0, MISC: 0 };
  for (const c of computed) byCategory[c.category] = round2(byCategory[c.category] + c.amount);
  const totalCost = round2(byCategory.PORT + byCategory.TRANSPORT + byCategory.MISC);
  return { lines: computed, byCategory, totalCost };
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}
