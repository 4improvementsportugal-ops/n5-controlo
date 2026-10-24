// Tarefa agendada da Netlify: chama /api/cron/engagement com o segredo partilhado (CRON_SECRET).
export default async () => {
  const base = process.env.APP_URL ?? process.env.URL;
  const res = await fetch(`${base}/api/cron/engagement`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  console.log(`cron engagement: ${res.status}`);
  return new Response(null, { status: res.ok ? 200 : 500 });
};

export const config = { schedule: "7 * * * *" };
