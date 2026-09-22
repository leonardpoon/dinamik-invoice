const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Dates are stored as MySQL DATE (midnight UTC). Always read them in UTC. */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function fmtDateLong(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCDate()} ${MONTHS_LONG[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** yyyy-mm-dd for <input type="date"> */
export function toInputDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/** Parse yyyy-mm-dd into a UTC-midnight Date (what Prisma expects for @db.Date). */
export function parseInputDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function yearMonthOf(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "202609" -> "Sep 2026" */
export function fmtYearMonth(ym: string): string {
  if (!/^\d{6}$/.test(ym)) return ym;
  return `${MONTHS[+ym.slice(4, 6) - 1]} ${ym.slice(0, 4)}`;
}

export function fmtMoney(n: number | string | null | undefined, dp = 2): string {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? ""));
  if (!Number.isFinite(v)) return "";
  return v.toLocaleString("en-SG", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtNum(n: number | string | null | undefined, dp = 2): string {
  return fmtMoney(n, dp);
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}
