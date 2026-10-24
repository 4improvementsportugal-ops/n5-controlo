import { SignJWT, jwtVerify } from "jose";

// Funciona no middleware (edge) e no servidor: só usa Web Crypto.
export const SESSION_COOKIE = "n5_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 horas

export type TeamRole = "socio" | "direcao_operacoes" | "colaborador";
export interface SessionPayload { sub: string; name: string; role: TeamRole }

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET em falta ou com menos de 32 caracteres");
  return new TextEncoder().encode(secret);
}

export async function signSession(p: SessionPayload): Promise<string> {
  return new SignJWT({ name: p.name, role: p.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return { sub: String(payload.sub), name: String(payload.name), role: payload.role as TeamRole };
  } catch {
    return null;
  }
}

export const sessionMaxAge = MAX_AGE_SECONDS;
