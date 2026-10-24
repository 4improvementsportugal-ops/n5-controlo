import { authenticate, errorResponse, ApiError } from "@/lib/apikeys";
import { ingestEvents } from "@/lib/core";

// POST /api/v1/events — lote de até 100 eventos de produto (Contrato de dados, Eventos de produto)
export async function POST(req: Request) {
  try {
    const caller = await authenticate(req, "events:write");
    const body = await req.json().catch(() => null);
    const items = Array.isArray(body) ? body : body?.events;
    if (!Array.isArray(items)) throw new ApiError(400, "Envia um array de eventos, ou { events: [...] }.", "bad_request");
    if (items.length > 100) throw new ApiError(413, "Máximo de 100 eventos por lote.", "batch_too_large");
    const result = await ingestEvents(items, caller.softwareId);
    return Response.json(result, { status: result.rejected.length && !result.accepted ? 422 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
