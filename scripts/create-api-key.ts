// Cria uma chave de API pela linha de comandos:
//   npm run apikey:create -- "N5 Clara produção" events:write,usage:write,entitlements:read sw_clara
import { db, schema, sql } from "../src/db";
import { createHash, randomBytes } from "node:crypto";

async function main() {
  const [name, scopesRaw, softwareId] = process.argv.slice(2);
  if (!name || !scopesRaw) { console.error('Uso: npm run apikey:create -- "<nome>" <scope1,scope2> [sw_id]'); process.exit(1); }
  const prefix = "n5k_" + randomBytes(4).toString("hex");
  const key = `${prefix}_${randomBytes(24).toString("base64url")}`;
  await db.insert(schema.apiKeys).values({
    name, prefix, hash: createHash("sha256").update(key).digest("hex"), scopes: scopesRaw.split(","),
    softwareId: softwareId ?? null, expiresAt: new Date(Date.now() + 365 * 864e5),
  });
  console.log("Chave (guarda-a agora, não volta a ser mostrada):\n" + key);
  await sql.end();
}
main();
