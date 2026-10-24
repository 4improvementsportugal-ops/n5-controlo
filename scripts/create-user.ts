// Cria o primeiro utilizador (ou repõe a palavra-passe):
//   npm run user:create -- pedro@4improvements.pt "Pedro" socio 'palavra-passe-longa'
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema, sql } from "../src/db";

async function main() {
  const [email, name, role = "socio", password] = process.argv.slice(2);
  if (!email || !name || !password || password.length < 12) {
    console.error('Uso: npm run user:create -- <email> "<nome>" <socio|direcao_operacoes|colaborador> <palavra-passe com 12+ caracteres>');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase()));
  if (existing) await db.update(schema.users).set({ name, role: role as "socio", passwordHash: hash, active: true }).where(eq(schema.users.id, existing.id));
  else await db.insert(schema.users).values({ email: email.toLowerCase(), name, role: role as "socio", passwordHash: hash });
  console.log(existing ? "Utilizador atualizado." : "Utilizador criado.");
  await sql.end();
}
main();
