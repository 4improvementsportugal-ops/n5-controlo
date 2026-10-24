import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const SCOPES = [
  "events:write", "usage:write", "entitlements:read", "orgs:read",
  "feedback:read", "feedback:write", "metrics:read", "alerts:write", "messages:read", "messages:write",
] as const;
export type Scope = (typeof SCOPES)[number];

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Gera uma chave nova. A chave completa só é mostrada uma vez; guarda-se o hash. */
export function generateKey(): { key: string; prefix: string } {
  const prefix = "n5k_" + randomBytes(4).toString("hex");
  const key = `${prefix}_${randomBytes(24).toString("base64url")}`;
  return { key, prefix };
}

export interface ApiCaller { keyId: string; prefix: string; scopes: string[]; softwareId: string | null }

export class ApiError extends Error {
  constructor(public status: number, message: string, public code: string) { super(message); }
}

/** Valida `Authorization: Bearer <chave>` e a permissão pedida. */
export async function authenticate(req: Request, scope: Scope): Promise<ApiCaller> {
  const header = req.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!key) throw new ApiError(401, "Falta a chave de API no cabeçalho Authorization.", "missing_key");
  const prefix = key.split("_").slice(0, 2).join("_");
  const [row] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.prefix, prefix));
  if (!row || row.hash !== hashKey(key)) throw new ApiError(401, "Chave de API inválida.", "invalid_key");
  if (row.revokedAt) throw new ApiError(401, "Esta chave foi revogada.", "revoked_key");
  if (row.expiresAt < new Date()) throw new ApiError(401, "Esta chave expirou. Cria uma nova nas Definições.", "expired_key");
  if (!row.scopes.includes(scope)) throw new ApiError(403, `A chave não tem a permissão ${scope}.`, "missing_scope");
  await db.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, row.id));
  return { keyId: row.id, prefix: row.prefix, scopes: row.scopes, softwareId: row.softwareId };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: { code: "internal", message: "Erro interno. Tenta de novo." } }, { status: 500 });
}
