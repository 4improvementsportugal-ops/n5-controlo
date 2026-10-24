import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { authenticate, errorResponse, ApiError } from "@/lib/apikeys";

// GET /api/v1/messages?person=per_... — mensagens in-app por mostrar a esta pessoa.
// A app chama isto quando a pessoa abre a app; as mensagens devolvidas passam a "entregue".
export async function GET(req: Request) {
  try {
    const caller = await authenticate(req, "messages:read");
    const person = new URL(req.url).searchParams.get("person");
    if (!person) throw new ApiError(400, "Indica a pessoa em ?person=", "bad_request");
    const conds = [eq(schema.outboundMessages.personId, person), eq(schema.outboundMessages.channel, "inapp"),
      inArray(schema.outboundMessages.status, ["enviada", "entregue"])];
    if (caller.softwareId) conds.push(eq(schema.outboundMessages.softwareId, caller.softwareId));
    const rows = await db.select().from(schema.outboundMessages).where(and(...conds));
    const now = new Date();
    const toDeliver = rows.filter((r) => r.status === "enviada").map((r) => r.id);
    if (toDeliver.length) await db.update(schema.outboundMessages).set({ status: "entregue", deliveredAt: now }).where(inArray(schema.outboundMessages.id, toDeliver));
    return Response.json({
      data: rows.map((r) => ({ id: r.id, type: r.type, title: r.subject, body: r.body, cta_label: r.ctaLabel, cta_url: r.ctaUrl, created_at: r.createdAt })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
