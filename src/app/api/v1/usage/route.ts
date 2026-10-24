import { authenticate, errorResponse, ApiError } from "@/lib/apikeys";
import { ingestUsage } from "@/lib/core";

// POST /api/v1/usage — lote de registos de consumo (Contrato de dados, Registo de consumo)
export async function POST(req: Request) {
  try {
    const caller = await authenticate(req, "usage:write");
    const body = await req.json().catch(() => null);
    const items = Array.isArray(body) ? body : body?.records;
    if (!Array.isArray(items)) throw new ApiError(400, "Envia um array de registos, ou { records: [...] }.", "bad_request");
    if (items.length > 500) throw new ApiError(413, "Máximo de 500 registos por lote.", "batch_too_large");
    const result = await ingestUsage(items, caller.softwareId);
    return Response.json(result, { status: result.rejected.length && !result.accepted ? 422 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
