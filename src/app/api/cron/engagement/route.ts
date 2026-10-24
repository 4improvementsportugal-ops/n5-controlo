import { cronAuthorized } from "@/lib/cron";
import { runEngagement } from "@/lib/engagement";

export const dynamic = "force-dynamic";

// A cada hora: aplica as regras de reativação e envia os e-mails que ficaram para o horário de envio
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return new Response("não autorizado", { status: 401 });
  return Response.json(await runEngagement());
}
