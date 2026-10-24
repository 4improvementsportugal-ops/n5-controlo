import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { allowedSoftware, requireUser } from "@/lib/auth";
import { fmtDateTime, LABELS } from "@/lib/format";
import { PageHeader, Pill } from "@/components/ui";
import { replyInSlack, updateFeedback } from "../actions";

export default async function FeedbackDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("comunidades");
  const { id } = await params;
  const [f] = await db.select().from(schema.feedback).where(eq(schema.feedback.id, id));
  if (!f || !allowedSoftware(user, f.softwareId)) notFound();
  const [sw] = await db.select().from(schema.softwares).where(eq(schema.softwares.id, f.softwareId));
  const team = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true));
  const items = await db.select({ id: schema.roadmapItems.id, code: schema.roadmapItems.code, title: schema.roadmapItems.title })
    .from(schema.roadmapItems).where(eq(schema.roadmapItems.softwareId, f.softwareId)).orderBy(desc(schema.roadmapItems.id));
  const history = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.entity, "feedback"), eq(schema.auditLog.entityId, id))).orderBy(desc(schema.auditLog.at));
  const others = await db.select({ id: schema.feedback.id, title: schema.feedback.title }).from(schema.feedback)
    .where(and(eq(schema.feedback.softwareId, f.softwareId), inArray(schema.feedback.status, ["recebido", "em_analise", "planeado", "em_desenvolvimento"]))).limit(100);
  const update = updateFeedback.bind(null, f.id);
  const reply = replyInSlack.bind(null, f.id);

  return (
    <>
      <p className="mb-2"><Link className="text-sm text-muted hover:underline" href="/comunidades">← Caixa de feedback</Link></p>
      <PageHeader title={f.title} lead={`${sw?.name ?? f.softwareId} · ${LABELS.feedbackType[f.type]} · ${f.votes} votos · criado ${fmtDateTime(f.createdAt)}`} />
      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-4">
          <section className="card">
            <h2 className="h2">Texto original</h2>
            <p className="whitespace-pre-wrap">{f.text}</p>
            <p className="text-xs text-muted mt-3">{f.authorName ?? "Autor desconhecido"}{f.origin ? ` · ${LABELS.origin[f.origin]}` : ""}{f.slackChannel ? " · veio do Slack" : ""}</p>
          </section>
          {f.slackChannel ? (
            <form action={reply} className="card space-y-2">
              <h2 className="h2">Responder no Slack</h2>
              <textarea name="reply" rows={3} className="input" placeholder="A resposta aparece na conversa original" required />
              <button className="btn">Enviar resposta</button>
            </form>
          ) : null}
          <section className="card">
            <h2 className="h2">Histórico</h2>
            {history.length === 0 ? <p className="text-muted text-sm">Sem alterações desde que chegou.</p> : null}
            <ul className="space-y-1 text-sm">{history.map((h) => (
              <li key={h.id}><span className="text-muted">{fmtDateTime(h.at)}</span> · {h.action}{h.after && typeof h.after === "object" && "status" in (h.after as object) ? ` → ${LABELS.feedbackStatus[(h.after as { status: keyof typeof LABELS.feedbackStatus }).status]}` : ""}</li>
            ))}</ul>
          </section>
        </div>
        <form action={update} className="card space-y-3 h-fit">
          <h2 className="h2">Tratar</h2>
          <div><label className="label" htmlFor="f-title">Título</label><input id="f-title" name="title" defaultValue={f.title} className="input" /></div>
          <div><label className="label" htmlFor="f-status">Estado</label>
            <select id="f-status" name="status" defaultValue={f.status} className="input">{Object.entries(LABELS.feedbackStatus).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="label" htmlFor="f-reason">Motivo de recusa (obrigatório ao recusar)</label><input id="f-reason" name="refusalReason" defaultValue={f.refusalReason ?? ""} className="input" /></div>
          <div><label className="label" htmlFor="f-dup">Duplicado de</label>
            <select id="f-dup" name="duplicateOfId" defaultValue={f.duplicateOfId ?? ""} className="input"><option value="">–</option>{others.filter((o) => o.id !== f.id).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select></div>
          <div><label className="label" htmlFor="f-owner">Dono</label>
            <select id="f-owner" name="owner" defaultValue={f.ownerUserId ?? ""} className="input"><option value="">Sem dono</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><label className="label" htmlFor="f-feature">Funcionalidade</label><input id="f-feature" name="feature" defaultValue={f.feature ?? ""} className="input" /></div>
          <div><label className="label" htmlFor="f-item">Item do roadmap</label>
            <select id="f-item" name="roadmapItemId" defaultValue={f.roadmapItemId ?? ""} className="input"><option value="">Nenhum</option>{items.map((i) => <option key={i.id} value={i.id}>{i.code} · {i.title}</option>)}</select></div>
          {f.roadmapItemId ? <p className="text-sm"><Link className="underline" href={`/pipeline/${f.roadmapItemId}`}>Abrir item ligado</Link></p> : null}
          <button className="btn btn-primary w-full justify-center">Guardar</button>
          {f.status === "recusado" ? <Pill tone="critico">Recusado: {f.refusalReason}</Pill> : null}
        </form>
      </div>
    </>
  );
}
