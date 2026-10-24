import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signStandardWebhook, verifyGithub, verifySlack, verifyStandardWebhook, verifyStripe } from "@/lib/signatures";

describe("Assinaturas de webhooks", () => {
  const body = JSON.stringify({ hello: "n5" });
  it("Stripe", () => {
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
    expect(verifyStripe(body, `t=${t},v1=${sig}`, "whsec_test")).toBe(true);
    expect(verifyStripe(body, `t=${t},v1=${sig}`, "outro")).toBe(false);
    expect(verifyStripe(body, `t=${t - 600},v1=${sig}`, "whsec_test")).toBe(false);
  });
  it("GitHub", () => {
    const sig = "sha256=" + createHmac("sha256", "gh").update(body).digest("hex");
    expect(verifyGithub(body, sig, "gh")).toBe(true);
    expect(verifyGithub(body + " ", sig, "gh")).toBe(false);
  });
  it("Slack", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = "v0=" + createHmac("sha256", "sl").update(`v0:${ts}:${body}`).digest("hex");
    expect(verifySlack(body, ts, sig, "sl")).toBe(true);
    expect(verifySlack(body, ts, sig, "x")).toBe(false);
  });
  it("Standard Webhooks", () => {
    const secret = "whsec_" + Buffer.from("segredo-de-teste").toString("base64");
    const ts = Math.floor(Date.now() / 1000);
    const sig = signStandardWebhook("msg_1", ts, body, secret);
    expect(verifyStandardWebhook(body, { id: "msg_1", timestamp: String(ts), signature: sig }, secret)).toBe(true);
    expect(verifyStandardWebhook(body, { id: "msg_2", timestamp: String(ts), signature: sig }, secret)).toBe(false);
  });
});
