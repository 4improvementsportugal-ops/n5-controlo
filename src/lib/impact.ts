import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Range } from "./filters";
import { leadSummary, returnMultiple, summarizeTasks, timeValueCents, type LeadRecord, type LeadSummary, type TaskActor, type TaskEvent, type TaskRef, type TaskRow } from "./metrics";

// Eventos que os softwares enviam para o módulo Impacto (ver docs/integracoes.md)
export const IMPACT_EVENTS = ["task.completed", "lead.received", "lead.first_response", "visit.scheduled", "deal.closed"] as const;

const DEFAULT_SETTINGS = { hourValueCents: 2000, fastResponseMinutes: 5, minSample: 30 };
export type ImpactSettings = typeof DEFAULT_SETTINGS & { softwareId: string };

export async function settingsFor(ids: string[]): Promise<Map<string, ImpactSettings>> {
  const rows = ids.length ? await db.select().from(schema.impactSettings).where(inArray(schema.impactSettings.softwareId, ids)) : [];
  return new Map(ids.map((id) => {
    const r = rows.find((x) => x.softwareId === id);
    return [id, { softwareId: id, ...DEFAULT_SETTINGS, ...(r ? { hourValueCents: r.hourValueCents, fastResponseMinutes: r.fastResponseMinutes, minSample: r.minSample } : {}) }];
  }));
}

export async function catalogFor(ids: string[]) {
  return ids.length ? db.select().from(schema.impactTasks).where(inArray(schema.impactTasks.softwareId, ids)).orderBy(schema.impactTasks.softwareId, schema.impactTasks.label) : [];
}

const toRef = (r: typeof schema.impactTasks.$inferSelect): TaskRef => ({
  key: r.key, label: r.label, manualMinutes: Number(r.manualMinutes), remainingMinutes: Number(r.remainingMinutes), validated: r.validated,
});

export interface ImpactBlock {
  tasks: TaskRow[];
  minutesSaved: number;
  timeValueCents: number;
  leads: LeadSummary;
  costCents: number; // mensalidades pagas no período
  roiTime: number | null; // só o valor do tempo
  roiWithBusiness: number | null; // tempo + comissão protegida (estimada)
  accounts: number;
}

export interface AccountImpact extends Omit<ImpactBlock, "tasks" | "leads"> {
  orgId: string; orgName: string; softwareId: string;
  leadsTotal: number; afterHoursByAi: number; visitsByAi: number; dealsFirstByAi: number; commissionFirstByAiCents: number; protectedCommissionCents: number | null;
}

const ACTIVE = ["active", "past_due"];
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));
const numOrNull = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && isFinite(Number(v)) ? Number(v) : null);

/** Junta os eventos de impacto de um conjunto de softwares e devolve o resumo por software e por conta. */
export async function loadImpact(ids: string[], range: Range, onlyOrg?: string) {
  if (!ids.length) return { bySoftware: new Map<string, ImpactBlock>(), accounts: [] as AccountImpact[], months: 1 };
  const conds = [inArray(schema.productEvents.softwareId, ids), inArray(schema.productEvents.name, [...IMPACT_EVENTS]), gte(schema.productEvents.occurredAt, range.from)];
  if (onlyOrg) conds.push(eq(schema.productEvents.organizationId, onlyOrg));
  const events = await db.select({
    name: schema.productEvents.name, sw: schema.productEvents.softwareId, org: schema.productEvents.organizationId,
    at: schema.productEvents.occurredAt, props: schema.productEvents.properties,
  }).from(schema.productEvents).where(and(...conds));

  const settings = await settingsFor(ids);
  const catalog = await catalogFor(ids);
  const subs = await db.select().from(schema.subscriptions).where(and(inArray(schema.subscriptions.softwareId, ids), inArray(schema.subscriptions.status, ACTIVE as ("active" | "past_due")[])));
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
  const leadIndex = new Map<string, LeadRecord>(); // `${sw}|${lead}`
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const e of sorted) {
    const p = (e.props ?? {}) as Record<string, unknown>;
    if (e.name === "task.completed") {
      if (e.at > range.to) continue;
      const by = (["ai", "assisted", "human"].includes(String(p.by)) ? p.by : "ai") as TaskActor;
      const task = str(p.task);
      if (task) bucket(e.sw, e.org).tasks.push({ task, by, humanSeconds: numOrNull(p.human_seconds) });
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

  const block = (sw: string, tasks: TaskEvent[], leads: LeadRecord[], costCents: number, accounts: number, upliftFrom?: LeadSummary): ImpactBlock => {
    const s = settings.get(sw)!;
    const rows = summarizeTasks(tasks, catalog.filter((c) => c.softwareId === sw && c.active).map(toRef));
    const minutes = rows.reduce((a, r) => a + r.minutesSaved, 0);
    const value = timeValueCents(minutes, s.hourValueCents);
    let ls = leadSummary(leads, s.fastResponseMinutes, s.minSample);
    if (upliftFrom) {
      // Contas têm poucas leads: usa a diferença de conversão medida no software inteiro
      const avg = upliftFrom.deals ? upliftFrom.commissionCents / upliftFrom.deals : 0;
      const pd = upliftFrom.upliftDeal != null ? ls.afterHoursByAi * upliftFrom.upliftDeal : null;
      ls = { ...ls, upliftDeal: upliftFrom.upliftDeal, upliftVisit: upliftFrom.upliftVisit, protectedDeals: pd,
        protectedVisits: upliftFrom.upliftVisit != null ? ls.afterHoursByAi * upliftFrom.upliftVisit : null,
        protectedCommissionCents: pd != null ? Math.round(pd * avg) : null };
    }
    return {
      tasks: rows, minutesSaved: minutes, timeValueCents: value, leads: ls, costCents, accounts,
      roiTime: returnMultiple(value, costCents),
      roiWithBusiness: ls.protectedCommissionCents != null ? returnMultiple(value + ls.protectedCommissionCents, costCents) : null,
    };
  };

  const bySoftware = new Map<string, ImpactBlock>();
  for (const sw of ids) {
    const mine = [...per.entries()].filter(([k]) => k.startsWith(`${sw}|`)).map(([, b]) => b);
    const cost = Math.round(subs.filter((s) => s.softwareId === sw).reduce((a, s) => a + s.mrrCents, 0) * months);
    const accounts = new Set(subs.filter((s) => s.softwareId === sw).map((s) => s.organizationId)).size;
    bySoftware.set(sw, block(sw, mine.flatMap((b) => b.tasks), mine.flatMap((b) => [...b.leads.values()]), cost, accounts));
  }

  const accounts: AccountImpact[] = [];
  for (const [k, b] of per) {
    const [sw, org] = k.split("|");
    if (org === "?") continue;
    const cost = Math.round(subs.filter((s) => s.softwareId === sw && s.organizationId === org).reduce((a, s) => a + s.mrrCents, 0) * months);
    const blk = block(sw, b.tasks, [...b.leads.values()], cost, 1, bySoftware.get(sw)!.leads);
    accounts.push({
      orgId: org, orgName: orgRows.find((o) => o.id === org)?.name ?? org, softwareId: sw,
      minutesSaved: blk.minutesSaved, timeValueCents: blk.timeValueCents, costCents: cost, accounts: 1, roiTime: blk.roiTime, roiWithBusiness: blk.roiWithBusiness,
      leadsTotal: blk.leads.total, afterHoursByAi: blk.leads.afterHoursByAi, visitsByAi: blk.leads.visitsByAi,
      dealsFirstByAi: blk.leads.dealsFirstByAi, commissionFirstByAiCents: blk.leads.commissionFirstByAiCents, protectedCommissionCents: blk.leads.protectedCommissionCents,
    });
  }
  accounts.sort((a, b) => b.timeValueCents - a.timeValueCents);

  return { bySoftware, accounts, months };
}

/** Horas por mês, a partir de minutos num período de `months` meses. */
export const hoursPerMonth = (minutes: number, months: number, accounts = 1) => minutes / 60 / Math.max(months, 1 / 30) / Math.max(accounts, 1);
