import { cronAuthorized } from "@/lib/cron";
import { archiveOld } from "@/lib/chat";

export const dynamic = "force-dynamic";

// Uma vez por dia: resume por mês as conversas com mais de 90 dias (as mensagens originais ficam guardadas)
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return new Response("não autorizado", { status: 401 });
  return Response.json(await archiveOld());
}
