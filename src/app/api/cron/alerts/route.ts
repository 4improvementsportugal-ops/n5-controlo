import { cronAuthorized } from "@/lib/cron";
import { evaluateAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";

// A cada 15 minutos: avalia as regras de alerta de todos os módulos
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return new Response("não autorizado", { status: 401 });
  const result = await evaluateAlerts();
  return Response.json(result);
}
