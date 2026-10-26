import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Range } from "./filters";
import {
  hourValueFromProfile, leadSummary, measuredManualMinutes, median, returnMultiple, summarizeTasks, timeValueCents,
  type LeadRecord, type LeadSummary, type TaskActor, type TaskEvent, type TaskRef, type TaskRow,
} from "./metrics";

// Eventos que os softwares enviam para o módulo Impacto (ver docs/integracoes.md)
export const IMPACT_EVENTS = ["task.completed", "lead.received", "lead.first_response", "visit.scheduled", "deal.closed"] as const;

const DEFAULT_SETTINGS = { hourValueCents: 2000, defaultWeeklyHours: 40, fastResponseMinutes: 5, minSample: 30 };
export type ImpactSettings = typeof DEFAULT_SETTINGS & { softwareId: string };

export async function settingsFor(ids: string[]): Promise<Map<string, ImpactSettings>> {
  const rows = ids.length ? await db.select().from(schema.impactSettings).where(inArray(schema.impactSettings.softwareId, ids)) : [];
  return new Map(ids.map((id) => {
    const r = rows.find((x) => x.softwareId === id);
    return [id, { softwareId: id, ...DEFAULT_SETTINGS, ...(r ? { hourValueCents: r.hourValueCents, defaultWeeklyHours: r.defaultWeeklyHours, fastResponseMinutes: r.fastResponseMinutes, minSample: r.minSample } : {}) }];
  }));
}

export async function catalogFor(ids: string[]) {
  return ids.length ? db.select().from(schema.impactTasks).where(inArray(schema.impactTasks.softwareId, ids)).orderBy(schema.impactTasks.softwareId, schema.impactTasks.label) : [];
}

export interface HourValueInfo {
  /** contas com valor da hora calculado a partir do onboarding / contas com dados no período */
  fromProfile: number; accounts: number;
  medianCents: number | null; // mediana do valor da hora das contas com perfil
  fallbackCents: number; // usado nas contas sem perfil
}

export interface ImpactBlock {
  tasks: TaskRow[];
  minutesSaved: number;
  timeValueCents: number;
  leads: LeadSummary;
  costCents: number; // mensalidades pagas no período
  roiTime: number | null; // só o valor do tempo
  roiWithBusiness: number | null; // tempo + comissão protegida (estimada)
  accounts: number;
  hourValue: HourValueInfo;
}

export interface AccountImpact {
  orgId: string; orgName: string; softwareId: string;
  minutesSaved: number; timeValueCents: number; costCents: number; roiTime: number | null; roiWithBusiness: number | null;
  hourValueCents: number; hourValueSource: "onboarding" | "reserva";
  leadsTotal: number; afterHoursByAi: number; visitsByAi: number; dealsFirstByAi: number; commissionFirstByAiCents: number; protectedCommissionCents: number | null;
}

const ACTIVE = ["active", "past_due"] as const;
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));
const numOrNull = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && isFinite(Number(v)) ? Number(v) : null);

/**
 * Junta os eventos de impacto de um conjunto de softwares e devolve o resumo por software e por conta.
 * Pressupostos automáticos:
 *  - valor da hora de cada conta = faturação média mensal do onboarding ÷ horas de trabalho por mês;
 *  - tempo à mão de cada tarefa = mediana do tempo das execuções feitas pela pessoa, quando há amostra.
 * Os valores das Definições só se usam quando estes dados ainda não existem.
 */
export async function loadImpact(ids: string[], range: Range, onlyOrg?: string) {
  if (!ids.length) return { bySoftware: new Map<string, ImpactBlock>(), accounts: [] as AccountImpact[], months: 1, catalogRefs: new Map<string, TaskRef[]>() };
  const conds = [inArray(schema.productEvents.softwareId, ids), inArray(schema.productEvents.name, [...IMPACT_EVENTS]), gte(schema.productEvents.occurredAt, range.from)];
  if (onlyOrg) conds.push(eq(schema.productEvents.organizationId, onlyOrg));
  const events = await db.select({
    name: schema.productEvents.name, sw: schema.productEvents.softwareId, org: schema.productEvents.organizationId,
    at: schema.productEvents.occurredAt, props: schema.productEvents.properties,
  }).from(schema.productEvents).where(and(...conds));

  const settings = await settingsFor(ids);
  const catalog = await catalogFor(ids);
  const subs = await db.select().from(schema.subscriptions).where(and(inArray(schema.subscriptions.softwareId, ids), inArray(schema.subscriptions.status, [...ACTIVE])));
  const profiles = await db.select().from(schema.accountProfiles).where(inArray(schema.accountProfiles.softwareId, ids));
  const orgRows = await db.select({ id: schema.organizations.id, name: schema.organizations.name }).from(schema.organizations);
  const months = Math.max(1 / 30, (range.to.getTime() - range.from.getTime()) / (30 * 864e5));

  // Tarefas (só dentro do período) e leads (recebidas no período; o desfecho pode vir depois)
  type Bucket = { tasks: TaskEvent[]; leads: Map<string, LeadRecord> };
  const per = new Map<string, Bucket>(); // `${sw}|${org}`
  const bucket = (sw: string, org: string | null) => {
    const k = `${sw}|${org ?? "?"}`;
    let b = per.get(k);
    if (!b) { b = { tasks: [], leads: new Map() }; per.set(k, b); }
    return b;
  };
  const humanDurations = new Map<string, number[]>(); // `${sw}|${task}` → segundos das execuções feitas à mão
  const leadIndex = new Map<string, LeadRecord>(); // `${sw}|${lead}`
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const e of sorted) {
    const p = (e.props ?? {}) as Record<string, unknown>;
    if (e.name === "task.completed") {
      if (e.at > range.to) continue;
      const by = (["ai", "assisted", "human"].includes(String(p.by)) ? p.by : "ai") as TaskActor;
      const task = str(p.task);
      if (!task) continue;
      const hs = numOrNull(p.human_seconds);
      bucket(e.sw, e.org).tasks.push({ task, by, humanSeconds: hs });
      if (by === "human" && hs != null) {
        const k = `${e.sw}|${task}`;
        humanDurations.set(k, [...(humanDurations.get(k) ?? []), hs]);
      }
      continue;
    }
    const leadId = str(p.lead);
    if (!leadId) continue;
    const key = `${e.sw}|${leadId}`;
    if (e.name === "lead.received") {
      if (e.at > range.to) continue;
      const rec: LeadRecord = { lead: leadId, receivedAt: e.at, afterHours: p.after_hours === true, firstResponseSeconds: null, respondedBy: null, visit: false, visitByAi: false, deal: false, commissionCents: 0 };
      leadIndex.set(key, rec);
      bucket(e.sw, e.org).leads.set(leadId, rec);
      continue;
    }
    const rec = leadIndex.get(key);
    if (!rec) continue; // lead recebida antes do período
    if (e.name === "lead.first_response" && rec.firstResponseSeconds == null) {
      rec.firstResponseSeconds = numOrNull(p.seconds) ?? Math.max(0, (e.at.getTime() - rec.receivedAt.getTime()) / 1000);
      rec.respondedBy = p.by === "human" ? "human" : "ai";
    } else if (e.name === "visit.scheduled") {
      rec.visit = true; if (p.by !== "human") rec.visitByAi = true;
    } else if (e.name === "deal.closed") {
      rec.deal = true; rec.commissionCents += Math.round((numOrNull(p.commission_eur) ?? 0) * 100);
    }
  }

  // Catálogo efetivo de cada software: tempo à mão medido automaticamente quando há amostra
  const catalogRefs = new Map<string, TaskRef[]>();
  for (const sw of ids) {
    const s = settings.get(sw)!;
    catalogRefs.set(sw, catalog.filter((c) => c.softwareId === sw && c.active).map((c) => {
      const samples = humanDurations.get(`${sw}|${c.key}`) ?? [];
      const measured = measuredManualMinutes(samples, s.minSample);
      const remaining = Number(c.remainingMinutes);
      return {
        key: c.key, label: c.label, validated: c.validated || measured != null, samples: samples.length,
        manualMinutes: measured != null ? Math.max(measured, remaining) : Number(c.manualMinutes), remainingMinutes: remaining, measured: measured != null,
      };
    }));
  }

  // Valor da hora de cada conta
  const hourFor = (sw: string, org: string): { cents: number; source: "onboarding" | "reserva" } => {
    const s = settings.get(sw)!;
    const pr = profiles.find((x) => x.softwareId === sw && x.organizationId === org);
    const v = pr ? hourValueFromProfile(pr.avgMonthlyRevenueCents, pr.weeklyHours != null ? Number(pr.weeklyHours) : null, s.defaultWeeklyHours) : null;
    return v != null ? { cents: v, source: "onboarding" } : { cents: s.hourValueCents, source: "reserva" };
  };

  const costOf = (sw: string, org?: string) => Math.round(subs.filter((s) => s.softwareId === sw && (!org || s.organizationId === org)).reduce((a, s) => a + s.mrrCents, 0) * months);

  // Contas
  const accounts: AccountImpact[] = [];
  const accountBlocks = new Map<string, { tasks: TaskRow[]; minutes: number; value: number; leads: LeadSummary }>();
  for (const [k, b] of per) {
    const [sw, org] = k.split("|");
    const s = settings.get(sw)!;
    const rows = summarizeTasks(b.tasks, catalogRefs.get(sw)!);
    const minutes = rows.reduce((a, r) => a + r.minutesSaved, 0);
    const hv = org === "?" ? { cents: s.hourValueCents, source: "reserva" as const } : hourFor(sw, org);
    const value = timeValueCents(minutes, hv.cents);
    accountBlocks.set(k, { tasks: rows, minutes, value, leads: leadSummary([...b.leads.values()], s.fastResponseMinutes, s.minSample) });
  }

  // Software: soma das contas (cada uma com o seu valor da hora); conversões medidas no software inteiro
  const bySoftware = new Map<string, ImpactBlock>();
  for (const sw of ids) {
    const s = settings.get(sw)!;
    const keys = [...per.keys()].filter((k) => k.startsWith(`${sw}|`));
    const allTasks = keys.flatMap((k) => per.get(k)!.tasks);
    const allLeads = keys.flatMap((k) => [...per.get(k)!.leads.values()]);
    const rows = summarizeTasks(allTasks, catalogRefs.get(sw)!);
    const minutes = rows.reduce((a, r) => a + r.minutesSaved, 0);
    const value = keys.reduce((a, k) => a + accountBlocks.get(k)!.value, 0);
    const ls = leadSummary(allLeads, s.fastResponseMinutes, s.minSample);
    const cost = costOf(sw);
    const orgs = keys.map((k) => k.split("|")[1]).filter((o) => o !== "?");
    const hvs = orgs.map((o) => hourFor(sw, o)).filter((h) => h.source === "onboarding").map((h) => h.cents);
    bySoftware.set(sw, {
      tasks: rows, minutesSaved: minutes, timeValueCents: value, leads: ls, costCents: cost,
      accounts: new Set(subs.filter((x) => x.softwareId === sw).map((x) => x.organizationId)).size,
      roiTime: returnMultiple(value, cost),
      roiWithBusiness: ls.protectedCommissionCents != null ? returnMultiple(value + ls.protectedCommissionCents, cost) : null,
      hourValue: { fromProfile: hvs.length, accounts: orgs.length, medianCents: median(hvs), fallbackCents: s.hourValueCents },
    });
  }

  for (const [k, ab] of accountBlocks) {
    const [sw, org] = k.split("|");
    if (org === "?") continue;
    const swLeads = bySoftware.get(sw)!.leads;
    // Contas têm poucas leads: usa a diferença de conversão medida no software inteiro
    const avg = swLeads.deals ? swLeads.commissionCents / swLeads.deals : 0;
    const pd = swLeads.upliftDeal != null ? ab.leads.afterHoursByAi * swLeads.upliftDeal : null;
    const protectedCents = pd != null ? Math.round(pd * avg) : null;
    const cost = costOf(sw, org);
    const hv = hourFor(sw, org);
    accounts.push({
      orgId: org, orgName: orgRows.find((o) => o.id === org)?.name ?? org, softwareId: sw,
      minutesSaved: ab.minutes, timeValueCents: ab.value, costCents: cost,
      roiTime: returnMultiple(ab.value, cost), roiWithBusiness: protectedCents != null ? returnMultiple(ab.value + protectedCents, cost) : null,
      hourValueCents: hv.cents, hourValueSource: hv.source,
      leadsTotal: ab.leads.total, afterHoursByAi: ab.leads.afterHoursByAi, visitsByAi: ab.leads.visitsByAi,
      dealsFirstByAi: ab.leads.dealsFirstByAi, commissionFirstByAiCents: ab.leads.commissionFirstByAiCents, protectedCommissionCents: protectedCents,
    });
  }
  accounts.sort((a, b) => b.timeValueCents - a.timeValueCents);

  return { bySoftware, accounts, months, catalogRefs };
}

/** Horas por mês, a partir de minutos num período de `months` meses. */
export const hoursPerMonth = (minutes: number, months: number, accounts = 1) => minutes / 60 / Math.max(months, 1 / 30) / Math.max(accounts, 1);
