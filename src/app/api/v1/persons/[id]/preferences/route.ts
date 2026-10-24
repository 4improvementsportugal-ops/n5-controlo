import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authenticate, errorResponse, ApiError } from "@/lib/apikeys";

const body = z.object({ email_opt_out: z.boolean().optional(), inapp_opt_out: z.boolean().optional() });

// POST /api/v1/persons/{id}/preferences — preferências de comunicação definidas pela pessoa dentro da app
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const caller = await authenticate(req, "messages:write");
    const { id } = await ctx.params;
    const p = body.safeParse(await req.json().catch(() => null));
    if (!p.success) throw new ApiError(400, "Pedido inválido.", "bad_request");
    const [person] = await db.select().from(schema.persons).where(eq(schema.persons.id, id));
    if (!person) throw new ApiError(404, "Pessoa não encontrada.", "not_found");
    if (caller.softwareId && caller.softwareId !== person.softwareId) throw new ApiError(403, "A chave não pode alterar esta pessoa.", "forbidden_software");
    await db.update(schema.persons).set({
      emailOptOut: p.data.email_opt_out ?? person.emailOptOut, inappOptOut: p.data.inapp_opt_out ?? person.inappOptOut,
    }).where(eq(schema.persons.id, id));
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
