import "server-only";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

// Modelo de IA para os resumos do Chat. Corre no Amazon Bedrock na UE (decisão: modelos abertos alojados na UE).
// Sem LLM_PROVIDER=bedrock e BEDROCK_MODEL_ID, os resumos fazem-se só com regras (sem IA), e o ecrã diz isso.

let client: BedrockRuntimeClient | null = null;

export function llmConfigured(): boolean {
  return process.env.LLM_PROVIDER === "bedrock" && !!process.env.BEDROCK_MODEL_ID;
}

export function llmName(): string {
  return llmConfigured() ? process.env.BEDROCK_MODEL_ID! : "regras";
}

/** Pede um texto ao modelo. Devolve null se não houver modelo configurado ou se o pedido falhar. */
export async function complete(system: string, user: string, maxTokens = 1200): Promise<string | null> {
  if (!llmConfigured()) return null;
  client ??= new BedrockRuntimeClient({ region: process.env.BEDROCK_REGION ?? "eu-central-1" });
  try {
    const res = await client.send(new ConverseCommand({
      modelId: process.env.BEDROCK_MODEL_ID,
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: user }] }],
      inferenceConfig: { maxTokens, temperature: 0.2 },
    }));
    const text = res.output?.message?.content?.map((c) => ("text" in c ? c.text : "")).join("").trim();
    return text || null;
  } catch (err) {
    console.error("[llm] falhou:", err);
    return null;
  }
}
