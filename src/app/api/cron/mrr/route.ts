import { cronAuthorized } from "@/lib/cron";
import { snapshotMrr } from "@/lib/core";

export const dynamic = "force-dynamic";

// Uma vez por dia: grava o MRR do mês corrente por conta
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return new Response("não autorizado", { status: 401 });
  const accounts = await snapshotMrr();
  return Response.json({ accounts });
}
