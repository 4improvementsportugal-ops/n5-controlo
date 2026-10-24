// Cálculos puros das métricas do sistema de controlo. Sem acesso à base de dados,
// para poderem ser testados e reutilizados pelos ecrãs, pela API e pelos alertas.

export type MrrKey = string; // `${organizationId}|${softwareId}`
export type MrrMap = Map<MrrKey, number>; // cêntimos sem IVA

export interface MrrMovements {
  startCents: number;
  newCents: number;
  expansionCents: number;
  contractionCents: number;
  churnCents: number;
  endCents: number;
  newAccounts: number;
  churnedAccounts: number;
  startAccounts: number;
}

/** Decompõe a variação de MRR entre dois meses (regras do Módulo 4). */
export function mrrMovements(prev: MrrMap, curr: MrrMap): MrrMovements {
  const m: MrrMovements = {
    startCents: 0, newCents: 0, expansionCents: 0, contractionCents: 0, churnCents: 0, endCents: 0,
    newAccounts: 0, churnedAccounts: 0, startAccounts: 0,
  };
  for (const v of prev.values()) { m.startCents += v; if (v > 0) m.startAccounts++; }
  for (const v of curr.values()) m.endCents += v;
  const keys = new Set([...prev.keys(), ...curr.keys()]);
  for (const k of keys) {
    const a = prev.get(k) ?? 0;
    const b = curr.get(k) ?? 0;
    if (a === 0 && b > 0) { m.newCents += b; m.newAccounts++; }
    else if (a > 0 && b === 0) { m.churnCents += a; m.churnedAccounts++; }
    else if (b > a) m.expansionCents += b - a;
    else if (b < a) m.contractionCents += a - b;
  }
  return m;
}

/** Churn de contas no mês: contas perdidas ÷ contas no início do mês. */
export function churnRate(prev: MrrMap, curr: MrrMap): number {
  const start = [...prev.values()].filter((v) => v > 0).length;
  if (start === 0) return 0;
  const lost = [...prev.entries()].filter(([k, v]) => v > 0 && (curr.get(k) ?? 0) === 0).length;
  return lost / start;
}

/** NRR: receita atual das contas que existiam no mês base ÷ receita delas no mês base. */
export function nrr(base: MrrMap, curr: MrrMap): number | null {
  let baseSum = 0, nowSum = 0;
  for (const [k, v] of base) {
    if (v <= 0) continue;
    baseSum += v;
    nowSum += curr.get(k) ?? 0;
  }
  return baseSum > 0 ? nowSum / baseSum : null;
}

/** ACV = MRR × 12 + consumo extra dos últimos 12 meses (anualizado se a conta tem menos de 12 meses). */
export function acvCents(mrrCents: number, extraLast12Cents: number, monthsActive: number): number {
  const months = Math.max(1, Math.min(12, monthsActive));
  return mrrCents * 12 + Math.round(extraLast12Cents * (12 / months));
}

export function arpaCents(totalMrrCents: number, payingAccounts: number): number {
  return payingAccounts > 0 ? Math.round(totalMrrCents / payingAccounts) : 0;
}

/** LTV = ARPA × margem bruta ÷ churn mensal. Sem churn devolve null (não há estimativa honesta). */
export function ltvCents(arpa: number, grossMargin: number, monthlyChurn: number): number | null {
  if (monthlyChurn <= 0) return null;
  return Math.round((arpa * grossMargin) / monthlyChurn);
}

export function cacCents(spendCents: number, newPayingCustomers: number): number | null {
  return newPayingCustomers > 0 ? Math.round(spendCents / newPayingCustomers) : null;
}

/** Payback em meses = CAC ÷ margem bruta mensal média por conta. */
export function paybackMonths(cac: number | null, monthlyGrossMarginPerAccountCents: number): number | null {
  if (cac === null || monthlyGrossMarginPerAccountCents <= 0) return null;
  return cac / monthlyGrossMarginPerAccountCents;
}

/** Pontuação do backlog: alcance × impacto × confiança ÷ esforço. */
export function riceScore(reach: number, impact: number, confidencePct: number, effort: number): number {
  if (effort <= 0) return 0;
  return Math.round(((reach * impact * (confidencePct / 100)) / effort) * 10) / 10;
}

export interface Heartbeat { personId: string; at: Date }

/**
 * Tempo ativo por pessoa a partir dos sinais `session.heartbeat` (um a cada 60 s com a app em primeiro plano).
 * Cada sinal vale até 60 s; intervalos maiores que 30 min fecham a sessão.
 */
export function activeSeconds(beats: Heartbeat[], gapMinutes = 30): Map<string, { seconds: number; sessions: number }> {
  const byPerson = new Map<string, Date[]>();
  for (const b of beats) {
    const list = byPerson.get(b.personId) ?? [];
    list.push(b.at);
    byPerson.set(b.personId, list);
  }
  const out = new Map<string, { seconds: number; sessions: number }>();
  for (const [person, times] of byPerson) {
    times.sort((a, b) => a.getTime() - b.getTime());
    let seconds = 0, sessions = 0;
    for (let i = 0; i < times.length; i++) {
      const gap = i === 0 ? Infinity : (times[i].getTime() - times[i - 1].getTime()) / 1000;
      if (gap > gapMinutes * 60) sessions++;
      seconds += Math.min(60, gap === Infinity ? 60 : gap);
    }
    out.set(person, { seconds, sessions });
  }
  return out;
}

/** Saúde da conta: verde, amarelo ou vermelho (regra 7 do Módulo 4). */
export function accountHealth(input: {
  usageChangePct: number | null; // variação de uso nas últimas 2 semanas face às 2 anteriores
  daysSinceLastLogin: number | null;
  failedPayments: number;
  negativeFeedback: number;
}): "verde" | "amarelo" | "vermelho" {
  if (input.failedPayments > 0) return "vermelho";
  if (input.daysSinceLastLogin !== null && input.daysSinceLastLogin >= 10) return "vermelho";
  if (input.usageChangePct !== null && input.usageChangePct <= -50) return "vermelho";
  if (input.negativeFeedback >= 2) return "amarelo";
  if (input.usageChangePct !== null && input.usageChangePct <= -25) return "amarelo";
  if (input.daysSinceLastLogin !== null && input.daysSinceLastLogin >= 5) return "amarelo";
  return "verde";
}

/** Horas úteis entre duas datas (segunda a sexta, 09:00–18:00, hora de Lisboa aproximada a UTC+0/+1). */
export function businessHoursBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let hours = 0;
  const cursor = new Date(from);
  cursor.setMinutes(0, 0, 0);
  while (cursor < to) {
    const day = cursor.getUTCDay();
    const h = cursor.getUTCHours();
    if (day >= 1 && day <= 5 && h >= 9 && h < 18) hours++;
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }
  return hours;
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function previousMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return monthKey(d);
}
