import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authenticate, errorResponse, ApiError } from "@/lib/apikeys";
import { createFeedback } from "@/lib/core";

const createSchema = z.object({
  software: z.string(),
  type: z.enum(["sugestao", "bug", "funciona_bem", "funciona_mal"]),
  text: z.string().min(3).max(5000),
  title: z.string().max(120).optional(),
  feature: z.string().max(80).optional(),
  severity: z.enum(["critico", "alto", "medio", "baixo"]).optional(),
  person: z.string().optional(),
  author_name: z.string().max(120).optional(),
  origin: z.enum(["pagante", "beta", "trial"]).optional(),
});

// POST /api/v1/feedback — feedback enviado de dentro de um software
export async function POST(req: Request) {
  try {
    const caller = await authenticate(req, "feedback:write");
    const p = createSchema.safeParse(await req.json().catch(() => null));
    if (!p.success) throw new ApiError(400, p.error.issues[0]?.message ?? "Pedido inválido.", "bad_request");
    const f = p.data;
    if (caller.softwareId && caller.softwareId !== f.software) throw new ApiError(403, "A chave não pode criar feedback deste software.", "forbidden_software");
    const row = await createFeedback({
      softwareId: f.software, type: f.type, text: f.text, title: f.title, feature: f.feature, severity: f.severity,
      authorPersonId: f.person, authorName: f.author_name, origin: f.origin,
    }, `key:${caller.prefix}`);
    return Response.json({ id: row.id, status: row.status }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

// GET /api/v1/feedback?software=&status=
export async function GET(req: Request) {
  try {
    const caller = await authenticate(req, "feedback:read");
    const url = new URL(req.url);
    const software = caller.softwareId ?? url.searchParams.get("software");
    const status = url.searchParams.get("status");
    const conds = [];
    if (software) conds.push(eq(schema.feedback.softwareId, software));
    if (status) conds.push(eq(schema.feedback.status, status as typeof schema.feedback.$inferSelect.status));
    const rows = await db.select().from(schema.feedback).where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.feedback.createdAt)).limit(200);
    return Response.json({ data: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
