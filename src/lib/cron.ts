import "server-only";

/** As tarefas agendadas (EventBridge Scheduler na AWS) chamam as rotas /api/cron com este segredo. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
