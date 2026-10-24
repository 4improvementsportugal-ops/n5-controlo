"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { raiseAlert } from "@/lib/alerts";

export async function alertAction(form: FormData) {
  const user = await requireUser("alertas");
  const id = Number(form.get("id"));
  const op = String(form.get("op"));
  const [a] = await db.select().from(schema.alerts).where(eq(schema.alerts.id, id));
  if (!a) return;
  const now = new Date();
  if (op === "assumir") await db.update(schema.alerts).set({ ownerUserId: user.sub, status: a.status === "novo" ? "visto" : a.status, updatedAt: now }).where(eq(schema.alerts.id, id));
  if (op === "visto") await db.update(schema.alerts).set({ status: "visto", updatedAt: now }).where(eq(schema.alerts.id, id));
  if (op === "silenciar") await db.update(schema.alerts).set({ mutedUntil: new Date(now.getTime() + 864e5), status: "visto", updatedAt: now }).where(eq(schema.alerts.id, id));
  if (op === "resolver") {
    const note = String(form.get("note") ?? "").trim();
    await db.update(schema.alerts).set({ status: "resolvido", resolvedAt: now, note: note || null, updatedAt: now }).where(eq(schema.alerts.id, id));
  }
  await audit(`user:${user.sub}`, `alert.${op}`, "alert", id);
  revalidatePath("/alertas");
}

/** Cria um alerta de teste para verificar o envio para o Slack. */
export async function testAlert() {
  const user = await requireUser("alertas");
  await raiseAlert({ module: "sistema", severity: "informacao", title: "Alerta de teste", detail: `Criado por ${user.name}`, dedupeKey: `teste:${Date.now()}` });
  revalidatePath("/alertas");
}
