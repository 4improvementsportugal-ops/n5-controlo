import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { allowedSoftware, requireUser } from "@/lib/auth";
import { riceScore } from "@/lib/metrics";
import { fmtDate, LABELS } from "@/lib/format";
import { PageHeader, Pill } from "@/components/ui";
import { updateItem } from "../actions";
import { ItemForm } from "./ItemForm";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("pipeline");
  const id = Number((await params).id);
  const [item] = await db.select().from(schema.roadmapItems).where(eq(schema.roadmapItems.id, id));
  if (!item || !allowedSoftware(user, item.softwareId)) notFound();
  const team = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true));
  const fb = await db.select().from(schema.feedback).where(eq(schema.feedback.roadmapItemId, id));
  const prs = await db.select().from(schema.pullRequests).where(eq(schema.pullRequests.roadmapItemId, id));
  const action = updateItem.bind(null, id);
  return (
    <>
      <p className="mb-2"><Link className="text-sm text-muted hover:underline" href="/pipeline">← Pipeline</Link></p>
      <PageHeader title={`${item.code} · ${item.title}`} lead={`${LABELS.phase[item.phase]} · pontuação ${riceScore(item.reach, item.impact, item.confidence, item.effort)} · criado ${fmtDate(item.createdAt)}`} />
      <div className="grid lg:grid-cols-[1fr_340px] gap-4">
        <ItemForm item={item} team={team} phases={Object.entries(LABELS.phase)} action={action} />
        <div className="space-y-4">
          <section className="card">
            <h2 className="h2">Feedback ligado ({fb.length})</h2>
            {fb.length === 0 ? <p className="text-muted text-sm">Nenhum.</p> : <ul className="space-y-1 text-sm">{fb.map((f) => <li key={f.id}><Link className="hover:underline" href={`/comunidades/${f.id}`}>{f.title}</Link> <span className="text-muted">· {f.votes} votos</span></li>)}</ul>}
          </section>
          <section className="card">
            <h2 className="h2">Pull requests ({prs.length})</h2>
            {prs.length === 0 ? <p className="text-muted text-sm">Usa o código <span className="num">{item.code}</span> no nome do branch ou do PR para ligar.</p> : (
              <ul className="space-y-1 text-sm">{prs.map((p) => <li key={p.id}><a className="underline" href={p.url ?? "#"} target="_blank" rel="noreferrer">{p.repo}#{p.number}</a> <Pill tone={p.state === "merged" ? "verde" : "neutro"}>{p.state}</Pill>{p.isAgent ? <> <Pill tone="accent">agente</Pill></> : null}</li>)}</ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
