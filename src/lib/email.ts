import "server-only";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

// Envio de e-mail pelo Amazon SES numa região da UE. Sem SES_FROM_ADDRESS, os envios ficam simulados
// (registados como enviados com a nota "simulado") para se poder testar o módulo sem enviar nada.

let client: SESv2Client | null = null;

export function emailConfigured(): boolean {
  return !!process.env.SES_FROM_ADDRESS;
}

export interface EmailInput { to: string; subject: string; text: string; html: string; unsubscribeUrl: string }

export async function sendEmail(e: EmailInput): Promise<{ ok: boolean; simulated: boolean; error?: string }> {
  if (!emailConfigured()) {
    console.info(`[e-mail simulado] para ${e.to}: ${e.subject}`);
    return { ok: true, simulated: true };
  }
  client ??= new SESv2Client({ region: process.env.SES_REGION ?? "eu-west-1" });
  try {
    await client.send(new SendEmailCommand({
      FromEmailAddress: process.env.SES_FROM_ADDRESS,
      Destination: { ToAddresses: [e.to] },
      Content: {
        Simple: {
          Subject: { Data: e.subject, Charset: "UTF-8" },
          Body: { Text: { Data: e.text, Charset: "UTF-8" }, Html: { Data: e.html, Charset: "UTF-8" } },
          // Cancelamento num clique (exigido pelo Gmail e pelo Yahoo para envios em volume)
          Headers: [
            { Name: "List-Unsubscribe", Value: `<${e.unsubscribeUrl}>` },
            { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
          ],
        },
      },
    }));
    return { ok: true, simulated: false };
  } catch (err) {
    return { ok: false, simulated: false, error: String(err) };
  }
}
