import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySlack } from "@/lib/signatures";
import { createFeedback } from "@/lib/core";

// App Slack da comunidade N5:
// - Comando /feedback  →  "/feedback bug: o calendário não abre" (tipos: sugestao, bug, bem, mal)
// - Events API: reação de feedback (:bulb:) numa mensagem cria feedback; reação de apoio (:+1:) numa
//   mensagem que já é feedback conta como voto.

const FEEDBACK_REACTION = process.env.SLACK_FEEDBACK_REACTION ?? "bulb";
const VOTE_REACTIONS = new Set(["+1", "thumbsup", "raised_hands"]);

const TYPE_WORDS: Record<string, "sugestao" | "bug" | "funciona_bem" | "funciona_mal"> = {
  sugestao: "sugestao", "sugestão": "sugestao", ideia: "sugestao",
  bug: "bug", erro: "bug",
  bem: "funciona_bem", "funciona bem": "funciona_bem",
  mal: "funciona_mal", "funciona mal": "funciona_mal",
};

async function softwareForChannel(channelName: string): Promise<string | null> {
  const sws = await db.select().from(schema.softwares);
  const sw = sws.find((s) => s.slackPrefix && channelName.startsWith(s.slackPrefix));
  return sw?.id ?? null;
}

async function personForSlack(slackUserId: string) {
  const [p] = await db.select().from(schema.persons).where(eq(schema.persons.slackUserId, slackUserId));
  return p ?? null;
}

async function fetchMessage(channel: string, ts: string): Promise<{ text: string; user: string } | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;
  const url = `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel)}&latest=${ts}&inclusive=true&limit=1`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const json = (await res.json()) as { ok: boolean; messages?: { text: string; user: string }[] };
  return json.ok && json.messages?.[0] ? json.messages[0] : null;
}

async function channelName(channel: string): Promise<string> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return channel;
  const res = await fetch(`https://slack.com/api/conversations.info?channel=${encodeURIComponent(channel)}`, { headers: { authorization: `Bearer ${token}` } });
  const json = (await res.json()) as { ok: boolean; channel?: { name: string } };
  return json.channel?.name ?? channel;
}

export async function POST(req: Request) {
  const body = await req.text();
  const ok = verifySlack(body, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"), process.env.SLACK_SIGNING_SECRET ?? "");
  if (!ok) return new Response("assinatura inválida", { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";

  // --- Comando /feedback (form-urlencoded)
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(body);
    const text = (form.get("text") ?? "").trim();
    const match = text.match(/^([^:]{2,20}):\s*([\s\S]+)$/);
    const type = match ? TYPE_WORDS[match[1].trim().toLowerCase()] : undefined;
    if (!match || !type) {
      return Response.json({ response_type: "ephemeral", text: "Usa: `/feedback tipo: o que aconteceu`. Tipos: sugestão, bug, bem, mal. Exemplo: `/feedback bug: o calendário não abre no telemóvel`" });
    }
    const softwareId = await softwareForChannel(form.get("channel_name") ?? "");
    if (!softwareId) return Response.json({ response_type: "ephemeral", text: "Este canal não está ligado a nenhum software N5. Usa o canal de feedback do software." });
    const person = await personForSlack(form.get("user_id") ?? "");
    await createFeedback({
      softwareId, type, text: match[2], authorName: form.get("user_name"), authorSlackId: form.get("user_id"),
      authorPersonId: person?.id ?? null, origin: person?.origin ?? null, slackChannel: form.get("channel_id"),
    }, "webhook:slack");
    return Response.json({ response_type: "ephemeral", text: "Obrigado! O teu feedback foi registado e a equipa vai responder aqui." });
  }

  // --- Events API (JSON)
  const payload = JSON.parse(body) as { type: string; challenge?: string; event_id?: string; event?: Record<string, any> };
  if (payload.type === "url_verification") return Response.json({ challenge: payload.challenge });

  const [inbox] = await db.insert(schema.webhookInbox).values({ source: "slack", externalId: payload.event_id ?? null, body })
    .onConflictDoNothing().returning({ id: schema.webhookInbox.id });
  if (!inbox) return Response.json({ ok: true, duplicate: true });

  try {
    const e = payload.event ?? {};
    if (e.type === "reaction_added" && e.item?.type === "message") {
      const { channel, ts } = e.item;
      const [existing] = await db.select().from(schema.feedback)
        .where(and(eq(schema.feedback.slackChannel, channel), eq(schema.feedback.slackTs, ts)));
      if (existing && VOTE_REACTIONS.has(e.reaction)) {
        await db.update(schema.feedback).set({ votes: sql`${schema.feedback.votes} + 1`, updatedAt: new Date() }).where(eq(schema.feedback.id, existing.id));
      } else if (!existing && e.reaction === FEEDBACK_REACTION) {
        const msg = await fetchMessage(channel, ts);
        const softwareId = await softwareForChannel(await channelName(channel));
        if (msg && softwareId) {
          const person = await personForSlack(msg.user);
          await createFeedback({
            softwareId, type: "sugestao", text: msg.text, authorSlackId: msg.user, authorPersonId: person?.id ?? null,
            origin: person?.origin ?? null, slackChannel: channel, slackTs: ts,
          }, "webhook:slack");
        }
      }
    }
    await db.update(schema.webhookInbox).set({ processedAt: new Date() }).where(eq(schema.webhookInbox.id, inbox.id));
  } catch (err) {
    await db.update(schema.webhookInbox).set({ error: String(err) }).where(eq(schema.webhookInbox.id, inbox.id));
    console.error("Webhook Slack falhou:", err);
  }
  return Response.json({ ok: true });
}
