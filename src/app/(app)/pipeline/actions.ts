"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { allowedSoftware, requireUser } from "@/lib/auth";
import { nextRoadmapCode, phaseGuard, syncFeedbackWithItem } from "@/lib/core";
import { audit } from "@/lib/audit";
import { postSlackMessage } from "@/lib/slack";

type Phase = typeof schema.roadmapItems.$inferSelect.phase;

function int(v: FormDataEntryValue | null, fallback: number) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }

export async function createItem(form: FormData) {
  const user = await requireUser("pipeline");
  const softwareId = String(form.get("softwareId"));
  if (!allowedSoftware(user, softwareId)) throw new Error("Sem acesso a este software.");
  const code = await nextRoadmapCode(softwareId);
  const [row] = await db.insert(schema.roadmapItems).values({
    code, softwareId, title: String(form.get("title") ?? "").trim(), description: String(form.get("description") ?? "") || null,
    origin: (String(form.get("origin") ?? "equipa")) as "equipa", impact: int(form.get("impact"), 1), reach: int(form.get("reach"), 0),
    confidence: int(form.get("confidence"), 50), effort: Math.max(1, int(form.get("effort"), 1)),
  }).returning();
  await audit(`user:${user.sub}`, "roadmap.created", "roadmap_item", row.id, null, row);
  redirect(`/pipeline/${row.id}`);
}

export async function updateItem(id: number, _prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser("pipeline");
  const [before] = await db.select().from(schema.roadmapItems).where(eq(schema.roadmapItems.id, id));
  if (!before || !allowedSoftware(user, before.softwareId)) return { error: "Sem acesso a este item." };
  const next = {
    title: String(form.get("title") ?? before.title).trim(),
    description: String(form.get("description") ?? "") || null,
    impact: int(form.get("impact"), before.impact), reach: int(form.get("reach"), before.reach),
    confidence: int(form.get("confidence"), before.confidence), effort: Math.max(1, int(form.get("effort"), before.effort)),
    ownerUserId: String(form.get("owner") ?? "") || null,
    agent: form.get("agent") === "on",
    acceptanceCriteria: String(form.get("acceptanceCriteria") ?? "") || null,
    productEvents: String(form.get("productEvents") ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
    sprint: String(form.get("sprint") ?? "") || null,
    version: String(form.get("version") ?? "") || null,
  };
  const phase = String(form.get("phase") ?? before.phase) as Phase;
  if (phase !== before.phase) {
    const err = phaseGuard(next, phase);
    if (err) return { error: err };
  }
  await db.update(schema.roadmapItems).set({ ...next, phase, updatedAt: new Date(), ...(phase !== before.phase ? { phaseChangedAt: new Date() } : {}) })
    .where(eq(schema.roadmapItems.id, id));
  await audit(`user:${user.sub}`, "roadmap.updated", "roadmap_item", id, { phase: before.phase }, { phase });
  if (phase !== before.phase) await syncFeedbackWithItem(id, phase, `user:${user.sub}`);
  revalidatePath(`/pipeline/${id}`);
  return { ok: true };
}

export async function saveRelease(form: FormData) {
  const user = await requireUser("pipeline");
  const softwareId = String(form.get("softwareId"));
  if (!allowedSoftware(user, softwareId)) throw new Error("Sem acesso a este software.");
  const version = String(form.get("version") ?? "").trim();
  // Changelog proposto a partir dos itens desta versão; a pessoa revê antes de publicar
  const items = await db.select().from(schema.roadmapItems).where(eq(schema.roadmapItems.softwareId, softwareId));
  const included = items.filter((i) => i.version === version);
  const notes = String(form.get("notes") ?? "").trim() || included.map((i) => `• ${i.title}`).join("\n");
  await db.insert(schema.releases).values({ softwareId, version, notes })
    .onConflictDoUpdate({ target: [schema.releases.softwareId, schema.releases.version], set: { notes } });
  await audit(`user:${user.sub}`, "release.saved", "release", `${softwareId}:${version}`);
  revalidatePath("/pipeline");
}

export async function publishRelease(form: FormData) {
  const user = await requireUser("pipeline");
  const id = Number(form.get("id"));
  const [rel] = await db.select().from(schema.releases).where(eq(schema.releases.id, id));
  if (!rel || !allowedSoftware(user, rel.softwareId)) throw new Error("Sem acesso.");
  const [sw] = await db.select().from(schema.softwares).where(eq(schema.softwares.id, rel.softwareId));
  const now = new Date();
  const channel = `${sw?.slackPrefix ?? sw?.code.toLowerCase()}-novidades`;
  const posted = await postSlackMessage(channel, `*${sw?.name} ${rel.version}* já está disponível.\n${rel.notes}`);
  await db.update(schema.releases).set({ publishedAt: rel.publishedAt ?? now, slackPostedAt: posted ? now : null }).where(eq(schema.releases.id, id));
  // Itens desta versão passam a Produção (e os feedbacks ligados a Lançado)
  const items = await db.select().from(schema.roadmapItems).where(eq(schema.roadmapItems.softwareId, rel.softwareId));
  for (const i of items.filter((x) => x.version === rel.version && x.phase !== "producao")) {
    if (phaseGuard(i, "producao")) continue;
    await db.update(schema.roadmapItems).set({ phase: "producao", phaseChangedAt: now, updatedAt: now }).where(eq(schema.roadmapItems.id, i.id));
    await syncFeedbackWithItem(i.id, "producao", `user:${user.sub}`);
  }
  await audit(`user:${user.sub}`, "release.published", "release", id);
  revalidatePath("/pipeline");
}

export async function saveProviderCost(form: FormData) {
  const user = await requireUser("custos");
  const softwareId = String(form.get("softwareId"));
  const month = String(form.get("month"));
  const provider = String(form.get("provider")).trim().toLowerCase();
  const costCents = Math.round(Number(String(form.get("cost")).replace(",", ".")) * 100);
  if (!/^\d{4}-\d{2}$/.test(month) || !provider || !Number.isFinite(costCents)) throw new Error("Dados inválidos.");
  await db.insert(schema.providerCosts).values({ softwareId, month, provider, costCents })
    .onConflictDoUpdate({ target: [schema.providerCosts.softwareId, schema.providerCosts.month, schema.providerCosts.provider], set: { costCents } });
  await audit(`user:${user.sub}`, "cost.saved", "provider_cost", `${softwareId}:${month}:${provider}`);
  revalidatePath("/pipeline");
}
