// Regras puras do módulo Reativação: faixas de inatividade, variáveis dos modelos, limites de frequência
// e horário de envio. Sem acesso à base de dados, para serem testadas.

export const INACTIVITY_BANDS = [
  { key: "ativo", label: "Ativos (0 a 2 dias)", min: 0, max: 2 },
  { key: "3_6", label: "3 a 6 dias", min: 3, max: 6 },
  { key: "7_13", label: "7 a 13 dias", min: 7, max: 13 },
  { key: "14_29", label: "14 a 29 dias", min: 14, max: 29 },
  { key: "30_mais", label: "30 dias ou mais", min: 30, max: Infinity },
] as const;
export type BandKey = (typeof INACTIVITY_BANDS)[number]["key"];

export function daysInactive(lastSeen: Date | null, signedUp: Date | null, now = new Date()): number | null {
  const ref = lastSeen ?? signedUp;
  if (!ref) return null;
  return Math.max(0, Math.floor((now.getTime() - ref.getTime()) / 864e5));
}

export function bandFor(days: number | null): BandKey | null {
  if (days === null) return null;
  return INACTIVITY_BANDS.find((b) => days >= b.min && days <= b.max)!.key;
}

export interface TemplateVars { nome?: string | null; dias?: number | null; software?: string; link?: string }

/** Substitui {{nome}}, {{dias}}, {{software}} e {{link}}. Variáveis sem valor ficam com um texto neutro. */
export function renderTemplate(text: string, v: TemplateVars): string {
  const firstName = (v.nome ?? "").trim().split(/\s+/)[0] || "olá";
  return text
    .replace(/\{\{\s*nome\s*\}\}/g, firstName)
    .replace(/\{\{\s*dias\s*\}\}/g, v.dias == null ? "alguns" : String(v.dias))
    .replace(/\{\{\s*software\s*\}\}/g, v.software ?? "")
    .replace(/\{\{\s*link\s*\}\}/g, v.link ?? "");
}

// Limites de frequência por pessoa (todas as regras e todos os softwares juntos)
export const CAPS = {
  emailMinDaysBetween: 3, // no máximo um e-mail a cada 3 dias
  maxPerWeek: 3, // no máximo 3 comunicações (e-mail e in-app) em 7 dias
};

export interface SentRecord { channel: "inapp" | "email"; at: Date }

/** Devolve o motivo de bloqueio, ou null se pode enviar agora. */
export function capBlock(history: SentRecord[], channel: "inapp" | "email", now = new Date()): string | null {
  const weekAgo = now.getTime() - 7 * 864e5;
  const lastWeek = history.filter((h) => h.at.getTime() >= weekAgo);
  if (lastWeek.length >= CAPS.maxPerWeek) return `limite de ${CAPS.maxPerWeek} comunicações por semana`;
  if (channel === "email") {
    const lastEmail = history.filter((h) => h.channel === "email").sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    if (lastEmail && now.getTime() - lastEmail.at.getTime() < CAPS.emailMinDaysBetween * 864e5) {
      return `já recebeu um e-mail nos últimos ${CAPS.emailMinDaysBetween} dias`;
    }
  }
  return null;
}

/** E-mails só entre as 09:00 e as 20:00 de Lisboa, de segunda a sábado. */
export function inSendingWindow(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hour12: false, weekday: "short" }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  return weekday !== "Sun" && hour >= 9 && hour < 20;
}

/** Uma regra dispara para uma pessoa se passou o limiar e ainda não recebeu esta regra desde a última utilização. */
export function ruleShouldFire(days: number | null, threshold: number, lastSeen: Date | null, lastFromRule: Date | null): boolean {
  if (days === null || days < threshold) return false;
  if (!lastFromRule) return true;
  return lastSeen !== null && lastFromRule < lastSeen;
}
