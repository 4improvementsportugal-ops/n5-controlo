import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Stripe: cabeçalho `Stripe-Signature: t=...,v1=...`, HMAC-SHA256 de `${t}.${body}`. Tolerância 5 min. */
export function verifyStripe(body: string, header: string | null, secret: string, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const signatures = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  return signatures.some((s) => safeEqual(s, expected));
}

/** GitHub: `X-Hub-Signature-256: sha256=<hex>`. */
export function verifyGithub(body: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return safeEqual(header, expected);
}

/** Slack: `X-Slack-Signature: v0=<hex>` de `v0:${timestamp}:${body}`. Tolerância 5 min. */
export function verifySlack(body: string, timestamp: string | null, signature: string | null, secret: string, now = Date.now()): boolean {
  if (!timestamp || !signature || !secret) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = "v0=" + createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex");
  return safeEqual(signature, expected);
}

/** Standard Webhooks: assina `${id}.${timestamp}.${body}` com o segredo (base64 depois de `whsec_`). */
export function signStandardWebhook(id: string, timestamp: number, body: string, secret: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return "v1," + createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

export function verifyStandardWebhook(
  body: string, headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string, now = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = signStandardWebhook(id, Number(timestamp), body, secret);
  return signature.split(" ").some((s) => safeEqual(s, expected));
}
