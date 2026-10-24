import { z } from "zod";
import { authenticate, errorResponse, ApiError } from "@/lib/apikeys";
import { raiseAlert } from "@/lib/alerts";

const schema = z.object({
  module: z.enum(["comunidades", "pipeline", "campanhas", "receita", "sistema"]),
  software: z.string().optional(),
  severity: z.enum(["critico", "aviso", "informacao"]),
  title: z.string().min(3).max(160),
  detail: z.string().max(2000).optional(),
  dedupe_key: z.string().min(3).max(200),
});

// POST /api/v1/alerts — alerta vindo de um sistema externo (monitorização, n8n, agentes)
export async function POST(req: Request) {
  try {
    const caller = await authenticate(req, "alerts:write");
    const p = schema.safeParse(await req.json().catch(() => null));
    if (!p.success) throw new ApiError(400, p.error.issues[0]?.message ?? "Pedido inválido.", "bad_request");
    const a = p.data;
    const r = await raiseAlert({ module: a.module, softwareId: caller.softwareId ?? a.software ?? null, severity: a.severity,
      title: a.title, detail: a.detail, dedupeKey: `ext:${caller.prefix}:${a.dedupe_key}` });
    return Response.json(r, { status: r.created ? 201 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
