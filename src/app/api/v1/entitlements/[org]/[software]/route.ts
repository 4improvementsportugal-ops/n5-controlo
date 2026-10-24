import { authenticate, errorResponse, ApiError } from "@/lib/apikeys";
import { entitlements } from "@/lib/core";

// GET /api/v1/entitlements/{org}/{software} — incluído, usado, restante e se a conta pode continuar
export async function GET(req: Request, ctx: { params: Promise<{ org: string; software: string }> }) {
  try {
    const caller = await authenticate(req, "entitlements:read");
    const { org, software } = await ctx.params;
    if (caller.softwareId && caller.softwareId !== software) throw new ApiError(403, "A chave não pode consultar este software.", "forbidden_software");
    const result = await entitlements(org, software);
    return Response.json(result, { headers: { "cache-control": "private, max-age=60" } });
  } catch (err) {
    return errorResponse(err);
  }
}
