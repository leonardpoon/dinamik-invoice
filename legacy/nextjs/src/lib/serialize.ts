import { Prisma } from "@prisma/client";

/**
 * Prisma returns Decimal objects and Date objects, neither of which can be
 * passed from a Server Component to a Client Component. This converts a
 * query result into plain JSON-safe values (Decimal -> number, Date -> ISO).
 */
export type Plain<T> = T extends Prisma.Decimal
  ? number
  : T extends Date
    ? string
    : T extends Array<infer U>
      ? Plain<U>[]
      : T extends object
        ? { [K in keyof T]: Plain<T[K]> }
        : T;

export function plain<T>(value: T): Plain<T> {
  if (value === null || value === undefined) return value as Plain<T>;
  if (value instanceof Prisma.Decimal) return value.toNumber() as Plain<T>;
  if (value instanceof Date) return value.toISOString() as Plain<T>;
  if (Array.isArray(value)) return value.map(plain) as Plain<T>;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = plain(v);
    return out as Plain<T>;
  }
  return value as Plain<T>;
}
