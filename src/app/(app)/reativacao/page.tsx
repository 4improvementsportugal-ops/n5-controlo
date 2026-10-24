import { desc, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, scopeSoftwares } from "@/lib/auth";
import { readFilters } from "@/lib/filters";
import { softwaresFor } from "@/lib/queries";
import { emailConfigured, inactivityOverview, messageStats, recentMessages } from "@/lib/engagement";
import { CAPS, INACTIVITY_BANDS } from "@/lib/engagement-rules";
import { fmtDate, fmtDateTime, fmtNum, fmtPct, LABELS } from "@/lib/format";
import { Bar, Empty, Kpi, PageHeader, Pill, Tabs, withParams } from "@/components/ui";
import { ManualSend, RuleForm, TemplateForm } from "./forms";
import { runNow, toggleRule } from "./actions";

type SP = Record<string, string | string[] | undefined>;
const TYPE_LABEL: Record<string, string> = { lembrete: "Lembrete", dica: "Dica", novidade: "Novidade", oferta: "Oferta", feedback: "Pedido de feedback", fim_trial: "Fim do trial", reativacao: "Reativação" };
const STATUS_TONE: Record<string, string> = { enviada: "accent", entregue: "accent", vista: "verde", clicada: "verde", pendente: "neutro", dispensada: "neutro", bloqueada: "aviso", falhou: "critico", cancelada: "neutro" };
const STATUS_LABEL: Record<string, string> = { pendente: "Pendente", enviada: "Enviada", entregue: "Entregue na app", vista: "Vista", clicada: "Clicada", dispensada: "Dispensada", falhou: "Falhou", cancelada: "Cancelada", bloqueada: "Bloqueada" };

export default async function Reativacao({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("reativacao");
  const sp = await searchParams;
  const filters = readFilters(sp);
  const sws = await softwaresFor(user);
  const ids = scopeSoftwares(user, filters.software, sws);
  const vista = typeof sp.vista === "string" ? sp.vista : "inatividade";
  const tabs = [{ key: "inatividade", label: "Inatividade" }, { key: "regras", label: "Regras automáticas" }, { key: "modelos", label: "Modelos de comunicação" }, { key: "envios", label: "Envios e resultados" }]
    .map((t) => ({ ...t, href: withParams("/reativacao", sp, { vista: t.key }) }));
  const swName = (id: string | null) => (id ? sws.find((s) => s.id === id)?.name ?? id : "Todos");
  const templates = ids.length ? await db.select().from(schema.messageTemplates)
    .where(or(isNull(schema.messageTemplates.softwareId), inArray(schema.messageTemplates.softwareId, ids))).orderBy(schema.messageTemplates.name) : [];
  const swOpts = sws.filter((s) => ids.includes(s.id)).map((s) => ({ id: s.id, name: s.name }));

  return (
    <>
      <PageHeader title="Reativação" lead="Há quanto tempo cada utilizador não usa a plataforma, e as comunicações na app e por e-mail que o fazem voltar.">
        <form action={runNow}><button className="btn">Correr regras agora</button></form>
      </PageHeader>
      {!emailConfigured() ? <p className="text-sm text-warn mb-4">E-mail em modo simulado: os envios ficam registados mas não saem até configurares o Amazon SES (SES_FROM_ADDRESS).</p> : null}
      <Tabs items={tabs} active={vista} />
      {vista === "inatividade" ? <Inatividade ids={ids} swName={swName} templates={templates} /> : null}
      {vista === "regras" ? <Regras ids={ids} swName={swName} templates={templates} swOpts={swOpts} /> : null}
      {vista === "modelos" ? <Modelos templates={templates} swName={swName} swOpts={swOpts} /> : null}
      {vista === "envios" ? <Envios ids={ids} swName={swName} /> : null}
    </>
  );
}

async function Inatividade({ ids, swName, templates }: { ids: string[]; swName: (id: string | null) => string; templates: { id: number; name: string; softwareId: string | null }[] }) {
  const { bands, people } = await inactivityOverview(ids);
  if (!people.length) return <Empty title="Ainda não há utilizadores">Os utilizadores aparecem quando os softwares começam a enviar eventos para o núcleo.</Empty>;
  const totals = Object.fromEntries(INACTIVITY_BANDS.map((b) => [b.key, bands.reduce((a, s) => a + s.counts[b.key], 0)])) as Record<string, number>;
  const max = Math.max(...Object.values(totals), 1);
  const inactive = people.filter((p) => (p.days ?? 0) >= 3).slice(0, 100);
  return (
    <>
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {INACTIVITY_BANDS.map((b) => (
          <Kpi key={b.key} label={b.label} value={fmtNum(totals[b.key])} note={fmtPct(totals[b.key] / Math.max(1, people.length))}
            tone={b.key === "ativo" ? "good" : b.key === "30_mais" ? "bad" : b.key === "14_29" ? "warn" : undefined} />
        ))}
      </section>
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4">
        <section className="card overflow-x-auto">
          <h2 className="h2">Por software</h2>
          <table className="tbl">
            <thead><tr><th>Software</th>{INACTIVITY_BANDS.map((b) => <th key={b.key} className="text-right">{b.label.replace("Ativos (0 a 2 dias)", "Ativos")}</th>)}</tr></thead>
            <tbody>{bands.map((s) => <tr key={s.software}><td>{swName(s.software)}</td>{INACTIVITY_BANDS.map((b) => <td key={b.key} className="num text-right">{fmtNum(s.counts[b.key])}</td>)}</tr>)}</tbody>
          </table>
          <h2 className="h2 mt-6">Distribuição</h2>
          <ol className="space-y-2">{INACTIVITY_BANDS.map((b) => (
            <li key={b.key} className="grid grid-cols-[140px_1fr_50px] gap-3 items-center text-sm"><span>{b.label}</span>
              <Bar value={totals[b.key]} max={max} tone={b.key === "30_mais" ? "bad" : b.key === "14_29" ? "warn" : "accent"} /><span className="num text-right">{totals[b.key]}</span></li>))}</ol>
        </section>
        <section className="card overflow-x-auto">
          <h2 className="h2">Utilizadores sem usar há 3 dias ou mais</h2>
          {inactive.length === 0 ? <p className="text-muted">Toda a gente usou a plataforma nos últimos 2 dias.</p> : (
            <table className="tbl">
              <thead><tr><th>Pessoa</th><th>Software</th><th className="text-right">Dias</th><th>Última comunicação</th><th>Enviar</th></tr></thead>
              <tbody>{inactive.map((r) => (
                <tr key={r.person.id}>
                  <td>{r.person.name ?? r.person.email ?? r.person.id}<div className="text-xs text-muted">{r.org ?? ""}{r.person.origin ? ` · ${LABELS.origin[r.person.origin]}` : ""}{r.person.emailOptOut ? " · sem e-mail" : ""}</div></td>
                  <td>{swName(r.person.softwareId)}</td>
                  <td className={`num text-right ${(r.days ?? 0) >= 30 ? "text-bad font-semibold" : (r.days ?? 0) >= 14 ? "text-warn" : ""}`}>{r.days}</td>
                  <td>{r.lastMessageAt ? fmtDate(r.lastMessageAt) : <span className="text-muted">nenhuma</span>}</td>
                  <td><ManualSend personId={r.person.id} templates={templates.filter((t) => !t.softwareId || t.softwareId === r.person.softwareId).map((t) => ({ id: t.id, name: t.name }))} /></td>
                </tr>))}</tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}

async function Regras({ ids, swName, templates, swOpts }: { ids: string[]; swName: (id: string | null) => string; templates: { id: number; name: string; channel: string }[]; swOpts: { id: string; name: string }[] }) {
  const rules = ids.length ? await db.select().from(schema.engagementRules)
    .where(or(isNull(schema.engagementRules.softwareId), inArray(schema.engagementRules.softwareId, ids))).orderBy(schema.engagementRules.inactiveDays) : [];
  const tOpts = templates.map((t) => ({ id: t.id, name: `${t.name} (${t.channel === "email" ? "e-mail" : "na app"})` }));
  return (
    <div className="space-y-4">
      <section className="card text-sm text-muted">
        Uma regra envia a comunicação quando a pessoa passa o número de dias sem usar, uma vez por cada período de inatividade: se voltar e depois parar outra vez, recebe de novo.
        Limites para todas as regras juntas: no máximo {CAPS.maxPerWeek} comunicações por semana e um e-mail a cada {CAPS.emailMinDaysBetween} dias. E-mails só saem entre as 09:00 e as 20:00, de segunda a sábado. Quem cancelou a subscrição não recebe e-mails.
      </section>
      {rules.length === 0 ? <Empty title="Sem regras" /> : rules.map((r) => (
        <details key={r.id} className="card">
          <summary className="cursor-pointer flex flex-wrap gap-2 items-center">
            <span className="font-semibold">{r.name}</span>
            <Pill tone={r.active ? "verde" : "neutro"}>{r.active ? "ativa" : "pausada"}</Pill>
            <span className="text-sm text-muted">{r.inactiveDays} dias sem usar · {swName(r.softwareId)} · {r.audience === "todos" ? "todos" : r.audience} · {templates.find((t) => t.id === r.templateId)?.name ?? "modelo removido"}</span>
          </summary>
          <div className="mt-3 space-y-3">
            <RuleForm softwares={swOpts} templates={tOpts} r={r} />
            <form action={toggleRule}><input type="hidden" name="id" value={r.id} /><button className="text-sm underline">{r.active ? "Pausar regra" : "Ativar regra"}</button></form>
          </div>
        </details>
      ))}
      <section className="card"><h2 className="h2">Nova regra</h2><RuleForm softwares={swOpts} templates={tOpts} /></section>
    </div>
  );
}

function Modelos({ templates, swName, swOpts }: { templates: (typeof schema.messageTemplates.$inferSelect)[]; swName: (id: string | null) => string; swOpts: { id: string; name: string }[] }) {
  return (
    <div className="space-y-4">
      {templates.map((t) => (
        <details key={t.id} className="card">
          <summary className="cursor-pointer flex flex-wrap gap-2 items-center">
            <span className="font-semibold">{t.name}</span><Pill tone="accent">{t.channel === "email" ? "E-mail" : "Na app"}</Pill><Pill>{TYPE_LABEL[t.type]}</Pill>
            <span className="text-sm text-muted">{swName(t.softwareId)}</span>
          </summary>
          <div className="mt-3 grid lg:grid-cols-[1fr_340px] gap-4">
            <TemplateForm softwares={swOpts} t={t} />
            <div className="rounded-lg border border-line p-4 bg-canvas h-fit" aria-label="Pré-visualização">
              <div className="text-xs text-muted mb-2">Pré-visualização (exemplo: Ana, 9 dias)</div>
              <div className="font-semibold">{preview(t.subject)}</div>
              <p className="whitespace-pre-wrap text-sm mt-2">{preview(t.body)}</p>
              {t.ctaLabel ? <span className="btn btn-primary mt-3">{preview(t.ctaLabel)}</span> : null}
            </div>
          </div>
        </details>
      ))}
      <section className="card"><h2 className="h2">Novo modelo</h2><TemplateForm softwares={swOpts} /></section>
    </div>
  );
}

function preview(s: string) {
  return s.replace(/\{\{\s*nome\s*\}\}/g, "Ana").replace(/\{\{\s*dias\s*\}\}/g, "9").replace(/\{\{\s*software\s*\}\}/g, "N5 Clara").replace(/\{\{\s*link\s*\}\}/g, "");
}

async function Envios({ ids, swName }: { ids: string[]; swName: (id: string | null) => string }) {
  const since = new Date(Date.now() - 30 * 864e5);
  const stats = await messageStats(ids, since);
  const msgs = await recentMessages(ids, 150);
  const t = stats.totals;
  return (
    <>
      {t ? (
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <Kpi label="Enviadas (30 dias)" value={fmtNum(t.sent)} note={`${t.blocked} bloqueadas pelos limites ou opt-out`} />
          <Kpi label="Vistas" value={t.sent ? fmtPct(t.seen / t.sent) : "–"} note="só mensagens na app" />
          <Kpi label="Clicadas" value={t.sent ? fmtPct(t.clicked / t.sent) : "–"} />
          <Kpi label="Voltaram a usar" value={t.sent ? fmtPct(t.returned / t.sent) : "–"} note="até 7 dias depois do envio" tone="good" />
          <Kpi label="Falharam" value={fmtNum(t.failed)} tone={t.failed ? "bad" : undefined} />
        </section>
      ) : null}
      <section className="card overflow-x-auto mb-4">
        <h2 className="h2">Resultado por regra (30 dias)</h2>
        {stats.byRule.length === 0 ? <p className="text-muted">Sem envios.</p> : (
          <table className="tbl"><thead><tr><th>Regra</th><th className="text-right">Enviadas</th><th className="text-right">Vistas</th><th className="text-right">Clicadas</th><th className="text-right">Voltaram</th><th className="text-right">Bloqueadas</th></tr></thead>
            <tbody>{stats.byRule.map((r) => <tr key={String(r.ruleId)}><td>{r.name}</td><td className="num text-right">{r.sent}</td><td className="num text-right">{r.seen}</td><td className="num text-right">{r.clicked}</td>
              <td className="num text-right font-semibold">{r.sent ? `${r.returned} (${fmtPct(r.returned / r.sent)})` : "–"}</td><td className="num text-right">{r.blocked}</td></tr>)}</tbody></table>
        )}
      </section>
      <section className="card overflow-x-auto">
        <h2 className="h2">Últimos envios</h2>
        {msgs.length === 0 ? <p className="text-muted">Sem envios.</p> : (
          <table className="tbl"><thead><tr><th>Data</th><th>Pessoa</th><th>Software</th><th>Canal</th><th>Comunicação</th><th className="text-right">Dias sem usar</th><th>Estado</th><th>Voltou</th></tr></thead>
            <tbody>{msgs.map(({ m, person, email }) => (
              <tr key={m.id}><td className="whitespace-nowrap">{fmtDateTime(m.createdAt)}</td><td>{person ?? email ?? m.personId}</td><td>{swName(m.softwareId)}</td>
                <td>{m.channel === "email" ? "E-mail" : "Na app"}</td><td className="max-w-xs">{m.subject}<div className="text-xs text-muted">{TYPE_LABEL[m.type]}</div></td>
                <td className="num text-right">{m.daysInactiveAtSend ?? "–"}</td>
                <td><Pill tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Pill>{m.error ? <div className="text-xs text-muted">{m.error}</div> : null}</td>
                <td>{m.returnedAt ? <Pill tone="verde">{fmtDate(m.returnedAt)}</Pill> : <span className="text-muted">–</span>}</td></tr>))}</tbody></table>
        )}
      </section>
    </>
  );
}
