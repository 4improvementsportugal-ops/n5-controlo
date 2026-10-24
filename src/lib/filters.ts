// Seletor global de software e período (Painel geral e navegação, regras comuns)
export type PeriodKey = "7d" | "30d" | "90d" | "mes" | "mes_anterior";

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "mes", label: "Mês atual" },
  { key: "mes_anterior", label: "Mês anterior" },
  { key: "7d", label: "Últimos 7 dias" },
  { key: "30d", label: "Últimos 30 dias" },
  { key: "90d", label: "Últimos 90 dias" },
];

export interface Range { from: Date; to: Date; prevFrom: Date; prevTo: Date; key: PeriodKey }

export function resolveRange(key: string | undefined, now = new Date()): Range {
  const k = (PERIODS.some((p) => p.key === key) ? key : "mes") as PeriodKey;
  const startOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 1));
  let from: Date, to: Date;
  if (k === "mes") { from = startOfMonth(now.getUTCFullYear(), now.getUTCMonth()); to = now; }
  else if (k === "mes_anterior") { from = startOfMonth(now.getUTCFullYear(), now.getUTCMonth() - 1); to = startOfMonth(now.getUTCFullYear(), now.getUTCMonth()); }
  else { const days = Number(k.replace("d", "")); to = now; from = new Date(now.getTime() - days * 864e5); }
  const span = to.getTime() - from.getTime();
  return { from, to, prevFrom: new Date(from.getTime() - span), prevTo: from, key: k };
}

export interface Filters { software: string | null; range: Range }

export function readFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const sw = typeof sp.sw === "string" && sp.sw !== "todos" ? sp.sw : null;
  return { software: sw, range: resolveRange(typeof sp.periodo === "string" ? sp.periodo : undefined) };
}
