// Date utility helpers, locale-light.
export function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
export function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
export function fmtShortDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
export function daysUntil(s?: string | null): number {
  if (!s) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(s);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
export function money(n: number | undefined | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}
