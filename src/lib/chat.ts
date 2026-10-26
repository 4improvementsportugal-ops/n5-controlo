import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "./auth";
import { allowedSoftware } from "./auth";
import { ARCHIVE_AFTER_DAYS, detectPending, extractCodes, extractMentions, matchItems, MAX_MESSAGE_LENGTH, monthsToArchive, topKeywords, type ChatMsg, type PendingItem, type PipelineItem } from "./chat-rules";
import { deadlineStatus } from "./metrics";
import { complete, llmName } from "./llm";

export const GENERAL = "geral";

export async function channelsFor(user: CurrentUser) {
  const sws = await db.select({ id: schema.softwares.id, name: schema.softwares.name }).from(schema.softwares).orderBy(schema.softwares.createdAt);
  return [{ id: GENERAL, name: "Geral" }, ...sws.filter((s) => allowedSoftware(user, s.id))];
}

export function canUseChannel(user: CurrentUser, channel: string) {
  return channel === GENERAL || allowedSoftware(user, channel);
}

export type ChatRow = typeof schema.chatMessages.$inferSelect & { userName: string | null };

const withUser = () => ({ m: schema.chatMessages, userName: schema.users.name });

/** Mensagens do canal: os últimos 90 dias (o resto está nos resumos do arquivo); um mês do arquivo; ou toda a história quando se pesquisa. */
export async function listMessages(channel: string, opts: { q?: string; month?: string; filter?: string; userId?: string; limit?: number } = {}): Promise<ChatRow[]> {
  const conds = [eq(schema.chatMessages.channel, channel)];
  if (opts.month && /^\d{4}-\d{2}$/.test(opts.month)) {
    const start = new Date(`${opts.month}-01T00:00:00Z`);
    conds.push(gte(schema.chatMessages.createdAt, start), lt(schema.chatMessages.createdAt, new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))));
  }
  if (opts.q) conds.push(ilike(schema.chatMessages.body, `%${opts.q.replace(/[%_\\]/g, "")}%`));
  else if (!opts.month) conds.push(gte(schema.chatMessages.createdAt, new Date(Date.now() - ARCHIVE_AFTER_DAYS * 864e5)));
  if (opts.filter === "decisoes") conds.push(eq(schema.chatMessages.kind, "decisao"));
  if (opts.filter === "pendentes") conds.push(eq(schema.chatMessages.kind, "pendente"), isNull(schema.chatMessages.resolvedAt));
  if (opts.filter === "fixadas") conds.push(eq(schema.chatMessages.pinned, true));
  if (opts.filter === "mencoes" && opts.userId) conds.push(sql`${opts.userId}::uuid = any(${schema.chatMessages.mentions})`);
  const rows = await db.select(withUser()).from(schema.chatMessages).leftJoin(schema.users, eq(schema.users.id, schema.chatMessages.userId))
    .where(and(...conds)).orderBy(desc(schema.chatMessages.createdAt)).limit(opts.limit ?? 400);
  return rows.map((r) => ({ ...r.m, userName: r.userName })).reverse();
}

export async function archiveSummaries(channel: string) {
  return db.select().from(schema.chatSummaries).where(and(eq(schema.chatSummaries.channel, channel), eq(schema.chatSummaries.kind, "arquivo")))
    .orderBy(desc(schema.chatSummaries.periodStart));
}

export async function lastSummary(channel: string) {
  const [r] = await db.select().from(schema.chatSummaries)
    .where(and(eq(schema.chatSummaries.channel, channel), inArray(schema.chatSummaries.kind, ["ultimos_dias", "pendentes"])))
    .orderBy(desc(schema.chatSummaries.createdAt)).limit(1);
  return r ?? null;
}

export async function unreadCounts(userId: string, channels: string[]) {
  if (!channels.length) return new Map<string, { unread: number; mentions: number }>();
  const reads = await db.select().from(schema.chatReads).where(eq(schema.chatReads.userId, userId));
  const rows = await db.select({
    channel: schema.chatMessages.channel, createdAt: schema.chatMessages.createdAt, userId: schema.chatMessages.userId, mentions: schema.chatMessages.mentions,
  }).from(schema.chatMessages).where(and(inArray(schema.chatMessages.channel, channels), isNull(schema.chatMessages.deletedAt), gte(schema.chatMessages.createdAt, new Date(Date.now() - 30 * 864e5))));
  const out = new Map<string, { unread: number; mentions: number }>();
  for (const ch of channels) {
    const last = reads.find((r) => r.channel === ch)?.lastReadAt ?? new Date(0);
    const mine = rows.filter((r) => r.channel === ch && r.createdAt > last && r.userId !== userId);
    out.set(ch, { unread: mine.length, mentions: mine.filter((r) => r.mentions.includes(userId)).length });
  }
  return out;
}

export async function markRead(userId: string, channel: string) {
  const now = new Date();
  await db.insert(schema.chatReads).values({ userId, channel, lastReadAt: now })
    .onConflictDoUpdate({ target: [schema.chatReads.userId, schema.chatReads.channel], set: { lastReadAt: now } });
}

export async function teamList() {
  return db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true));
}

export async function postMessage(userId: string, channel: string, body: string, kind: "mensagem" | "decisao" | "pendente", parentId: string | null) {
  const text = body.trim().slice(0, MAX_MESSAGE_LENGTH);
  const team = await teamList();
  const [row] = await db.insert(schema.chatMessages).values({
    id: `cm_${randomBytes(9).toString("base64url")}`, channel, userId, body: text, kind, parentId,
    roadmapCodes: extractCodes(text), mentions: extractMentions(text, team).filter((id) => id !== userId),
  }).returning();
  return row;
}

/** Itens do pipeline relevantes para o canal: os do software, ou de todos os softwares no canal Geral. */
export async function pipelineFor(channel: string, allowed: string[]): Promise<PipelineItem[]> {
  const ids = channel === GENERAL ? allowed : [channel];
  if (!ids.length) return [];
  const rows = await db.select({ i: schema.roadmapItems, owner: schema.users.name }).from(schema.roadmapItems)
    .leftJoin(schema.users, eq(schema.users.id, schema.roadmapItems.ownerUserId)).where(inArray(schema.roadmapItems.softwareId, ids));
  return rows.map(({ i, owner }) => ({ id: i.id, code: i.code, title: i.title, phase: i.phase, dueDate: i.dueDate, owner }));
}

const toMsg = (r: ChatRow): ChatMsg => ({ id: r.id, body: r.body, kind: r.kind, parentId: r.parentId, userName: r.userName, createdAt: r.createdAt, resolvedAt: r.resolvedAt, deletedAt: r.deletedAt });

async function messagesSince(channel: string, since: Date, until?: Date): Promise<ChatRow[]> {
  const conds = [eq(schema.chatMessages.channel, channel), gte(schema.chatMessages.createdAt, since)];
  if (until) conds.push(lt(schema.chatMessages.createdAt, until));
  const rows = await db.select(withUser()).from(schema.chatMessages).leftJoin(schema.users, eq(schema.users.id, schema.chatMessages.userId))
    .where(and(...conds)).orderBy(asc(schema.chatMessages.createdAt));
  return rows.map((r) => ({ ...r.m, userName: r.userName }));
}

const PENDING_LABEL: Record<string, string> = { prazo: "Prazo", marcado: "Marcado como pendente", pergunta: "Pergunta sem resposta", roadmap: "Em curso no pipeline", backlog: "No backlog" };
const fmtDay = (d: Date) => new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Lisbon" }).format(d);

function pendingText(p: PendingItem[]) {
  if (!p.length) return "Sem pendentes detetados.";
  return p.map((x) => `- [${PENDING_LABEL[x.source]}] ${x.title} — ${x.detail}${x.since ? ` (desde ${fmtDay(x.since)})` : ""}`).join("\n");
}

function transcript(rows: ChatRow[], max = 400) {
  return rows.filter((r) => !r.deletedAt).slice(-max)
    .map((r) => `[${fmtDay(r.createdAt)}] ${r.userName ?? "?"}${r.kind !== "mensagem" ? ` (${r.kind})` : ""}: ${r.body.replace(/\s+/g, " ").slice(0, 600)}`).join("\n");
}

const SYSTEM = "És o assistente de uma equipa de produto portuguesa (4Improvements, softwares N5). Escreves em português de Portugal, frases curtas, sem inventar nada que não esteja na conversa ou nos dados do pipeline. Não uses emojis.";

/** Resumo pedido no chat: o que se falou nos últimos dias, ou só os pendentes. Fica guardado. */
export async function summarize(channel: string, mode: "ultimos_dias" | "pendentes", allowed: string[], userId: string, days = 7) {
  const now = new Date();
  const since = new Date(now.getTime() - days * 864e5);
  const recent = await messagesSince(channel, since);
  const forPending = await messagesSince(channel, new Date(now.getTime() - 30 * 864e5));
  const items = await pipelineFor(channel, allowed);
  const pending = detectPending(forPending.map(toMsg), items, { now, deadline: (d, p) => deadlineStatus(d, p, now) });
  const live = recent.filter((r) => !r.deletedAt);
  const people = [...new Set(live.map((r) => r.userName ?? "?"))];
  const talkedItems = new Map<string, { code: string; title: string; phase: string; n: number }>();
  for (const r of live) for (const it of matchItems(r.body, items)) {
    const cur = talkedItems.get(it.code) ?? { code: it.code, title: it.title, phase: it.phase, n: 0 };
    cur.n++; talkedItems.set(it.code, cur);
  }
  const topics = [...talkedItems.values()].sort((a, b) => b.n - a.n);
  const words = topKeywords(live.map((r) => r.body));
  const decisions = live.filter((r) => r.kind === "decisao");

  let content: string;
  let engine = "regras";
  if (mode === "pendentes") {
    const ai = await complete(SYSTEM,
      `Lista dos pendentes detetados no canal (conversa dos últimos 30 dias cruzada com o pipeline):\n${pendingText(pending)}\n\n` +
      `Conversa recente:\n${transcript(forPending, 250)}\n\nEscreve uma lista curta e priorizada dos assuntos pendentes: o que é, quem parece responsável e o próximo passo. Junta duplicados. No fim, uma linha com o que é mais urgente.`);
    content = ai ?? `Pendentes (${pending.length}):\n${pendingText(pending)}`;
    if (ai) engine = llmName();
  } else {
    const ai = live.length ? await complete(SYSTEM,
      `Conversa do canal nos últimos ${days} dias:\n${transcript(live)}\n\nItens do pipeline falados: ${topics.map((t) => `${t.code} ${t.title} (${t.phase})`).join("; ") || "nenhum"}.\n` +
      `Pendentes detetados:\n${pendingText(pending)}\n\nEscreve: 1) "O que se falou", 3 a 6 tópicos com uma frase cada; 2) "Decisões"; 3) "Pendentes", priorizados. Não repitas a conversa.`) : null;
    if (ai) { content = ai; engine = llmName(); }
    else {
      content = [
        `O que se falou nos últimos ${days} dias: ${live.length} mensagens de ${people.length} pessoa(s)${people.length ? ` (${people.join(", ")})` : ""}.`,
        "",
        "Temas:",
        ...(topics.length ? topics.slice(0, 8).map((t) => `- ${t.code} ${t.title} — ${t.n} mensagem(ns), está em ${t.phase}`) : []),
        ...(words.length ? [`- Palavras mais faladas: ${words.map((w) => w.word).join(", ")}`] : []),
        ...(!topics.length && !words.length ? ["- Sem temas destacados."] : []),
        "",
        "Decisões:",
        ...(decisions.length ? decisions.map((d) => `- ${d.body.replace(/\s+/g, " ").slice(0, 200)} (${d.userName ?? "?"}, ${fmtDay(d.createdAt)})`) : ["- Nenhuma mensagem marcada como decisão."]),
        "",
        `Pendentes (${pending.length}):`,
        pendingText(pending),
      ].join("\n");
    }
  }
  const [row] = await db.insert(schema.chatSummaries).values({
    channel, kind: mode, periodStart: mode === "pendentes" ? new Date(now.getTime() - 30 * 864e5) : since, periodEnd: now, content,
    data: { pending, topics, keywords: words, decisions: decisions.map((d) => d.id) } as unknown as Record<string, unknown>,
    messages: mode === "pendentes" ? forPending.length : live.length, engine, createdBy: userId,
  }).returning();
  return row;
}

/** Arquivo: resume por mês as mensagens com mais de 90 dias. As mensagens continuam guardadas. Corre de /api/cron/chat. */
export async function archiveOld(now = new Date()): Promise<{ summaries: number }> {
  const old = await db.select({ channel: schema.chatMessages.channel, createdAt: schema.chatMessages.createdAt, summaryId: schema.chatMessages.summaryId })
    .from(schema.chatMessages).where(and(isNull(schema.chatMessages.summaryId), lt(schema.chatMessages.createdAt, new Date(now.getTime() - ARCHIVE_AFTER_DAYS * 864e5))));
  let created = 0;
  for (const channel of [...new Set(old.map((o) => o.channel))]) {
    for (const month of monthsToArchive(old.filter((o) => o.channel === channel), now)) {
      const start = new Date(`${month}-01T00:00:00Z`);
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      const rows = await messagesSince(channel, start, end);
      const live = rows.filter((r) => !r.deletedAt);
      const decisions = live.filter((r) => r.kind === "decisao");
      const pend = live.filter((r) => r.kind === "pendente");
      const codes = topKeywords(live.map((r) => extractCodes(r.body).join(" ")), 10).map((w) => w.word.toUpperCase());
      const words = topKeywords(live.map((r) => r.body), 10);
      const ai = live.length ? await complete(SYSTEM, `Conversa do canal em ${month}:\n${transcript(live, 600)}\n\nEscreve o resumo de arquivo deste mês: temas principais, decisões tomadas (com data) e assuntos que ficaram em aberto. Máximo 250 palavras.`, 900) : null;
      const content = ai ?? [
        `${live.length} mensagens de ${new Set(live.map((r) => r.userName)).size} pessoa(s).`,
        `Temas: ${[...codes, ...words.map((w) => w.word)].slice(0, 10).join(", ") || "sem temas destacados"}.`,
        "Decisões:", ...(decisions.length ? decisions.map((d) => `- ${fmtDay(d.createdAt)} ${d.userName ?? "?"}: ${d.body.replace(/\s+/g, " ").slice(0, 200)}`) : ["- nenhuma marcada"]),
        "Pendentes desse mês:", ...(pend.length ? pend.map((p) => `- ${p.body.replace(/\s+/g, " ").slice(0, 160)} (${p.resolvedAt ? "resolvido" : "ainda em aberto"})`) : ["- nenhum marcado"]),
      ].join("\n");
      const [s] = await db.insert(schema.chatSummaries).values({
        channel, kind: "arquivo", periodStart: start, periodEnd: end, content, messages: rows.length, engine: ai ? llmName() : "regras",
        data: { decisions: decisions.map((d) => d.id), pending: pend.map((p) => ({ id: p.id, resolved: !!p.resolvedAt })) },
      }).returning();
      await db.update(schema.chatMessages).set({ summaryId: s.id })
        .where(and(eq(schema.chatMessages.channel, channel), gte(schema.chatMessages.createdAt, start), lt(schema.chatMessages.createdAt, end)));
      created++;
    }
  }
  return { summaries: created };
}
