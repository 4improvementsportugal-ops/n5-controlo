import { randomBytes } from "node:crypto";

/** Prefixo + tempo + aleatório, ordenável por data de criação. */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}
