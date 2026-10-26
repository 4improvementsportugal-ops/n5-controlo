// Tarefa agendada da Netlify: chama /api/cron/chat com o segredo partilhado (CRON_SECRET).
export default async () => {
  const base = process.env.APP_URL ?? process.env.URL;
  const res = await fetch(`${base}/api/cron/chat`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  console.log(`cron chat: ${res.status}`);
  return new Response(null, { status: res.ok ? 200 : 500 });
};

export const config = { schedule: "23 3 * * *" };
