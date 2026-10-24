import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "postgres://n5:n5@localhost:5432/n5";

// Uma ligação partilhada por processo (no modo dev o Next recarrega módulos)
const globalForDb = globalThis as unknown as { n5Sql?: ReturnType<typeof postgres> };
export const sql = globalForDb.n5Sql ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.n5Sql = sql;

export const db = drizzle(sql, { schema });
export { schema };
