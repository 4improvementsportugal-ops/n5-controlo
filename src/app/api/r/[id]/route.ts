import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

// Link do botão dos e-mails: regista o clique e segue para o destino da mensagem
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [m] = await db.select().from(schema.outboundMessages).where(eq(schema.outboundMessages.id, id));
  if (!m?.ctaUrl || !/^https?:\/\//.test(m.ctaUrl)) return new Response("Ligação inválida.", { status: 404 });
  if (!m.clickedAt) await db.update(schema.outboundMessages).set({ clickedAt: new Date(), status: "clicada" }).where(eq(schema.outboundMessages.id, id));
  return Response.redirect(m.ctaUrl, 302);
}
