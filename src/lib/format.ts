const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const eur0 = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("pt-PT");
const dateFmt = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Lisbon" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon",
});

export const fmtEur = (cents: number | null | undefined) => (cents == null ? "–" : eur.format(cents / 100));
export const fmtEur0 = (cents: number | null | undefined) => (cents == null ? "–" : eur0.format(cents / 100));
export const fmtNum = (n: number | null | undefined) => (n == null ? "–" : num.format(n));
export const fmtPct = (x: number | null | undefined, digits = 1) =>
  x == null || !isFinite(x) ? "–" : `${(x * 100).toLocaleString("pt-PT", { maximumFractionDigits: digits })}%`;
export const fmtDate = (d: Date | string | null | undefined) => (d ? dateFmt.format(new Date(d)) : "–");
export const fmtDateTime = (d: Date | string | null | undefined) => (d ? dateTimeFmt.format(new Date(d)) : "–");

export function delta(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return (curr - prev) / Math.abs(prev);
}

export const LABELS = {
  feedbackType: { sugestao: "Sugestão", bug: "Bug", funciona_bem: "Funciona bem", funciona_mal: "Funciona mal" },
  feedbackStatus: {
    recebido: "Recebido", em_analise: "Em análise", planeado: "Planeado", em_desenvolvimento: "Em desenvolvimento",
    lancado: "Lançado", recusado: "Recusado", duplicado: "Duplicado",
  },
  severity: { critico: "Crítico", alto: "Alto", medio: "Médio", baixo: "Baixo" },
  phase: {
    ideia: "Ideia", descoberta: "Descoberta", design: "Design", desenvolvimento: "Desenvolvimento",
    testes: "Testes", staging: "Staging", producao: "Produção",
  },
  softwareStatus: { em_construcao: "Em construção", beta: "Beta", lancado: "Lançado", pausado: "Pausado" },
  origin: { pagante: "Pagante", beta: "Beta", trial: "Trial" },
  alertSeverity: { critico: "Crítico", aviso: "Aviso", informacao: "Informação" },
  alertStatus: { novo: "Novo", visto: "Visto", resolvido: "Resolvido" },
  role: { socio: "Sócio", direcao_operacoes: "Direção de operações", colaborador: "Colaborador" },
} as const;
