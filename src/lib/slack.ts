import "server-only";

/** Publica uma mensagem com o bot da comunidade. Sem token configurado, só regista no log. */
export async function postSlackMessage(channel: string, text: string, threadTs?: string): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.info(`[slack desligado] #${channel}: ${text.replace(/\n/g, " | ")}`);
    return false;
  }
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, text, thread_ts: threadTs }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) console.error("Slack chat.postMessage falhou:", json.error);
    return json.ok;
  } catch (err) {
    console.error("Slack indisponível:", err);
    return false;
  }
}
