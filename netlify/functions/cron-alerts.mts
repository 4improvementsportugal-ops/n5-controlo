// Tarefa agendada da Netlify: chama /api/cron/alerts com o segredo partilhado (CRON_SECRET).
export default async () => {
  const base = process.env.APP_URL ?? process.env.URL;
  const res = await fetch(`${base}/api/cron/alerts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  console.log(`cron alerts: ${res.status}`);
  return new Response(null, { status: res.ok ? 200 : 500 });
};

export const config = { schedule: "*/15 * * * *" };
