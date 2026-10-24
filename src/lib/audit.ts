import "server-only";
import { db, schema } from "@/db";

export async function audit(actor: string, action: string, entity: string, entityId: string | number | null, before?: unknown, after?: unknown) {
  await db.insert(schema.auditLog).values({
    actor, action, entity, entityId: entityId === null ? null : String(entityId),
    before: before ?? null, after: after ?? null,
  });
}
