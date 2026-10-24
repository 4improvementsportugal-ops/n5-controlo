import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authenticate, errorResponse, ApiError } from "@/lib/apikeys";

const body = z.object({ type: z.enum(["seen", "clicked", "dismissed"]) });

// POST /api/v1/messages/{id}/events — a app avisa que a mensagem in-app foi vista, clicada ou dispensada
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const caller = await authenticate(req, "messages:write");
    const { id } = await ctx.params;
    const p = body.safeParse(await req.json().catch(() => null));
    if (!p.success) throw new ApiError(400, "type tem de ser seen, clicked ou dismissed.", "bad_request");
    const [m] = await db.select().from(schema.outboundMessages).where(eq(schema.outboundMessages.id, id));
    if (!m) throw new ApiError(404, "Mensagem não encontrada.", "not_found");
    if (caller.softwareId && caller.softwareId !== m.softwareId) throw new ApiError(403, "A chave não pode alterar mensagens deste software.", "forbidden_software");
    const now = new Date();
    const patch =
      p.data.type === "seen" ? { status: m.status === "clicada" ? m.status : ("vista" as const), seenAt: m.seenAt ?? now } :
      p.data.type === "clicked" ? { status: "clicada" as const, clickedAt: m.clickedAt ?? now, seenAt: m.seenAt ?? now } :
      { status: "dispensada" as const, seenAt: m.seenAt ?? now };
    await db.update(schema.outboundMessages).set(patch).where(eq(schema.outboundMessages.id, id));
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
