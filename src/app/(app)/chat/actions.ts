"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { canUseChannel, markRead, postMessage, summarize } from "@/lib/chat";
import { extractCodes, MAX_MESSAGE_LENGTH } from "@/lib/chat-rules";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { softwaresFor } from "@/lib/queries";

type Result = { error?: string; ok?: string } | undefined;

const Send = z.object({
  channel: z.string().min(1).max(80),
  body: z.string().trim().min(1, "Escreve a mensagem.").max(MAX_MESSAGE_LENGTH, `Máximo de ${MAX_MESSAGE_LENGTH} caracteres.`),
  kind: z.enum(["mensagem", "decisao", "pendente"]).default("mensagem"),
  parentId: z.string().max(40).optional().transform((v) => v || null),
});

/** A mensagem enviada é o próprio registo (chat_messages guarda autor e data); edições, apagar, fixar e resolver ficam no audit_log. */
export async function sendMessage(_prev: Result, form: FormData): Promise<Result> {
  const user = await requireUser("chat");
  const parsed = Send.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Mensagem inválida." };
  const { channel, body, kind, parentId } = parsed.data;
  if (!canUseChannel(user, channel)) return { error: "Sem acesso a este canal." };
  if (parentId) {
    const [parent] = await db.select({ channel: schema.chatMessages.channel }).from(schema.chatMessages).where(eq(schema.chatMessages.id, parentId));
    if (!parent || parent.channel !== channel) return { error: "A mensagem a que respondes já não existe." };
  }
  await postMessage(user.sub, channel, body, kind, parentId);
  await markRead(user.sub, channel);
  revalidatePath("/chat");
  return { ok: "Enviada." };
}

async function ownMessage(user: CurrentUser, id: string) {
  const [m] = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.id, id));
  if (!m || !canUseChannel(user, m.channel)) return null;
  return m;
}

export async function editMessage(id: string, body: string): Promise<Result> {
  const user = await requireUser("chat");
  const m = await ownMessage(user, id);
  if (!m || m.deletedAt) return { error: "Mensagem não encontrada." };
  if (m.userId !== user.sub) return { error: "Só quem escreveu pode editar." };
  const text = body.trim();
  if (!text || text.length > MAX_MESSAGE_LENGTH) return { error: "Texto vazio ou demasiado longo." };
  await db.update(schema.chatMessages).set({ body: text, roadmapCodes: extractCodes(text), editedAt: new Date() }).where(eq(schema.chatMessages.id, id));
  await audit(`user:${user.sub}`, "chat.message_edited", "chat_message", id, { body: m.body }, { body: text });
  revalidatePath("/chat");
  return { ok: "Editada." };
}

export async function deleteMessage(id: string): Promise<Result> {
  const user = await requireUser("chat");
  const m = await ownMessage(user, id);
  if (!m || m.deletedAt) return { error: "Mensagem não encontrada." };
  if (m.userId !== user.sub && user.role === "colaborador") return { error: "Só quem escreveu (ou a direção) pode apagar." };
  // Apagar é lógico: o texto fica guardado no histórico, só deixa de aparecer na conversa.
  await db.update(schema.chatMessages).set({ deletedAt: new Date() }).where(eq(schema.chatMessages.id, id));
  await audit(`user:${user.sub}`, "chat.message_deleted", "chat_message", id, { body: m.body, userId: m.userId }, null);
  revalidatePath("/chat");
  return { ok: "Apagada." };
}

export async function togglePin(id: string): Promise<Result> {
  const user = await requireUser("chat");
  const m = await ownMessage(user, id);
  if (!m) return { error: "Mensagem não encontrada." };
  await db.update(schema.chatMessages).set({ pinned: !m.pinned }).where(eq(schema.chatMessages.id, id));
  await audit(`user:${user.sub}`, m.pinned ? "chat.message_unpinned" : "chat.message_pinned", "chat_message", id);
  revalidatePath("/chat");
  return { ok: m.pinned ? "Desafixada." : "Fixada." };
}

export async function setKind(id: string, kind: "mensagem" | "decisao" | "pendente"): Promise<Result> {
  const user = await requireUser("chat");
  if (!["mensagem", "decisao", "pendente"].includes(kind)) return { error: "Tipo inválido." };
  const m = await ownMessage(user, id);
  if (!m) return { error: "Mensagem não encontrada." };
  await db.update(schema.chatMessages).set({ kind, resolvedAt: null, resolvedBy: null }).where(eq(schema.chatMessages.id, id));
  await audit(`user:${user.sub}`, "chat.message_kind", "chat_message", id, { kind: m.kind }, { kind });
  revalidatePath("/chat");
  return { ok: "Marcada." };
}

export async function toggleResolved(id: string): Promise<Result> {
  const user = await requireUser("chat");
  const m = await ownMessage(user, id);
  if (!m || m.kind !== "pendente") return { error: "Só os pendentes se resolvem." };
  const resolved = !m.resolvedAt;
  await db.update(schema.chatMessages).set(resolved ? { resolvedAt: new Date(), resolvedBy: user.sub } : { resolvedAt: null, resolvedBy: null }).where(eq(schema.chatMessages.id, id));
  await audit(`user:${user.sub}`, resolved ? "chat.pending_resolved" : "chat.pending_reopened", "chat_message", id);
  revalidatePath("/chat");
  return { ok: resolved ? "Resolvido." : "Reaberto." };
}

export async function askSummary(channel: string, mode: "ultimos_dias" | "pendentes"): Promise<Result> {
  const user = await requireUser("chat");
  if (!canUseChannel(user, channel)) return { error: "Sem acesso a este canal." };
  if (mode !== "ultimos_dias" && mode !== "pendentes") return { error: "Pedido inválido." };
  const allowed = (await softwaresFor(user)).map((s) => s.id);
  const s = await summarize(channel, mode, allowed, user.sub);
  await audit(`user:${user.sub}`, "chat.summary_requested", "chat_summary", s.id, null, { channel, mode, engine: s.engine });
  revalidatePath("/chat");
  return { ok: "Resumo pronto." };
}

export async function readChannel(channel: string): Promise<void> {
  const user = await requireUser("chat");
  if (canUseChannel(user, channel)) await markRead(user.sub, channel);
}
