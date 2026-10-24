import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { canSee, requireUser, scopeSoftwares } from "@/lib/auth";
import { readFilters } from "@/lib/filters";
import { delivery, roadmap, softwareCosts, softwaresFor } from "@/lib/queries";
import { fmtDate, fmtDateTime, fmtEur, fmtNum, fmtPct, LABELS } from "@/lib/format";
import { Empty, Kpi, PageHeader, Pill, Tabs, withParams } from "@/components/ui";
import { createItem, publishRelease, saveProviderCost, saveRelease } from "./actions";

type SP = Record<string, string | string[] | undefined>;
const PHASES = Object.keys(LABELS.phase) as (keyof typeof LABELS.phase)[];

export default async function Pipeline({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("pipeline");
  const sp = await searchParams;
  const filters = readFilters(sp);
  const sws = await softwaresFor(user);
  const ids = scopeSoftwares(user, filters.software, sws);
  const vista = typeof sp.vista === "string" ? sp.vista : "roadmap";
  const showCosts = canSee(user.role, "custos");
  const tabs = [
    { key: "roadmap", label: "Roadmap" }, { key: "backlog", label: "Backlog" }, { key: "entregas", label: "Entregas e qualidade" },
    { key: "agentes", label: "Agentes de código" }, { key: "versoes", label: "Versões" },
    ...(showCosts ? [{ key: "custos", label: "Custos" }] : []), { key: "novo", label: "Novo item" },
  ].map((t) => ({ ...t, href: withParams("/pipeline", sp, { vista: t.key }) }));
  const swName = (id: string) => sws.find((s) => s.id === id)?.name ?? id;
  const mySoftwares = sws.filter((s) => ids.includes(s.id));

  return (
    <>
      <PageHeader title="Pipeline de desenvolvimento" lead="Da ideia à produção, ligado ao GitHub, com o custo de cada software." />
      <Tabs items={tabs} active={vista} />
      {vista === "roadmap" || vista === "backlog" ? <RoadmapViews ids={ids} vista={vista} swName={swName} /> : null}
      {vista === "entregas" ? <Entregas ids={ids} sp={sp} /> : null}
      {vista === "agentes" ? <Agentes ids={ids} sp={sp} /> : null}
      {vista === "versoes" ? <Versoes ids={ids} softwares={mySoftwares} swName={swName} /> : null}
      {vista === "custos" && showCosts ? <Custos ids={ids} softwares={mySoftwares} /> : null}
      {vista === "novo" ? <NovoItem softwares={mySoftwares} /> : null}
    </>
  );
}

async function RoadmapViews({ ids, vista, swName }: { ids: string[]; vista: string; swName: (id: string) => string }) {
  const items = await roadmap(ids);
  if (!items.length) return <Empty title="Roadmap vazio">Cria o primeiro item no separador Novo item, ou liga feedback da comunidade a um item.</Empty>;
  if (vista === "backlog") {
    const backlog = items.filter((i) => ["ideia", "descoberta", "design"].includes(i.phase));
    return (
      <section className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Item</th><th>Software</th><th>Origem</th><th className="text-right">Impacto</th><th className="text-right">Alcance</th><th className="text-right">Confiança</th><th className="text-right">Esforço</th><th className="text-right">Pontuação</th><th className="text-right">Votos</th><th>Dono</th><th>Agente</th></tr></thead>
          <tbody>{backlog.map((i) => (
            <tr key={i.id}>
              <td><Link className="font-medium hover:underline" href={`/pipeline/${i.id}`}><span className="num text-muted">{i.code}</span> {i.title}</Link></td>
              <td>{swName(i.softwareId)}</td><td>{i.origin}</td><td className="num text-right">{i.impact}</td><td className="num text-right">{fmtNum(i.reach)}</td>
              <td className="num text-right">{i.confidence}%</td><td className="num text-right">{i.effort}</td><td className="num text-right font-semibold">{i.score}</td>
              <td className="num text-right">{i.communityVotes}</td><td>{i.owner ?? <span className="text-muted">–</span>}</td><td>{i.agent ? <Pill tone="accent">agente</Pill> : ""}</td>
            </tr>))}</tbody>
        </table>
      </section>
    );
  }
  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid grid-flow-col auto-cols-[250px] gap-3 w-max">
        {PHASES.map((p) => {
          const col = items.filter((i) => i.phase === p);
          return (
            <section key={p} className="bg-surface border border-line rounded-lg p-3" aria-label={LABELS.phase[p]}>
              <h2 className="text-sm font-semibold mb-2 flex justify-between">{LABELS.phase[p]} <span className="num text-muted">{col.length}</span></h2>
              <ul className="space-y-2">{col.map((i) => (
                <li key={i.id} className="border border-line rounded-md p-2 bg-canvas/50">
                  <Link href={`/pipeline/${i.id}`} className="block hover:underline text-sm font-medium"><span className="num text-muted text-xs">{i.code}</span> {i.title}</Link>
                  <div className="text-xs text-muted mt-1 flex flex-wrap gap-1 items-center">{swName(i.softwareId)} · {i.owner ?? "sem dono"}{i.agent ? <Pill tone="accent">agente</Pill> : null}{i.sprint ? <span>· {i.sprint}</span> : null}</div>
                </li>))}</ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

async function Entregas({ ids, sp }: { ids: string[]; sp: SP }) {
  const d = await delivery(ids, readFilters(sp).range);
  const bugs = ids.length ? await db.select().from(schema.feedback).where(inArray(schema.feedback.softwareId, ids)) : [];
  const openBugs = bugs.filter((b) => b.type === "bug" && !["lancado", "recusado", "duplicado"].includes(b.status));
  if (!d) return <Empty title="Sem softwares neste filtro" />;
  return (
    <>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi label="Deploys de produção por semana" value={d.deploysPerWeek.toFixed(1)} />
        <Kpi label="Tempo do PR ao merge" value={d.leadTimeHours === null ? "–" : `${d.leadTimeHours.toFixed(1)} h`} note="média dos PRs do período" />
        <Kpi label="Falhas por deploy" value={fmtPct(d.failureRate)} tone={d.failureRate === null ? undefined : d.failureRate > 0.15 ? "bad" : "good"} />
        <Kpi label="Tempo de recuperação" value={d.recoveryHours === null ? "–" : `${d.recoveryHours.toFixed(1)} h`} />
      </section>
      <div className="grid lg:grid-cols-2 gap-4">
        <section className="card overflow-x-auto">
          <h2 className="h2">Últimos deploys</h2>
          {d.deployments.length === 0 ? <p className="text-muted">Ainda não chegaram deploys do GitHub.</p> : (
            <table className="tbl"><thead><tr><th>Repositório</th><th>Ambiente</th><th>Estado</th><th>Commit</th><th>Data</th></tr></thead>
              <tbody>{d.deployments.map((x) => <tr key={x.id}><td>{x.repo}</td><td>{x.environment}</td><td><Pill tone={x.status === "success" ? "verde" : x.status === "pending" ? "neutro" : "critico"}>{x.status}</Pill></td><td className="num">{x.sha?.slice(0, 7)}</td><td>{fmtDateTime(x.createdAt)}</td></tr>)}</tbody></table>
          )}
        </section>
        <section className="card overflow-x-auto">
          <h2 className="h2">Bugs abertos ({openBugs.length})</h2>
          {openBugs.length === 0 ? <p className="text-muted">Sem bugs abertos.</p> : (
            <table className="tbl"><thead><tr><th>Bug</th><th>Gravidade</th><th>Idade</th></tr></thead>
              <tbody>{openBugs.sort((a, b) => ["critico", "alto", "medio", "baixo"].indexOf(a.severity ?? "medio") - ["critico", "alto", "medio", "baixo"].indexOf(b.severity ?? "medio")).map((b) => (
                <tr key={b.id}><td><Link className="hover:underline" href={`/comunidades/${b.id}`}>{b.title}</Link></td>
                  <td><Pill tone={b.severity === "critico" ? "critico" : b.severity === "alto" ? "aviso" : "neutro"}>{b.severity ? LABELS.severity[b.severity] : "–"}</Pill></td>
                  <td className="num">{Math.floor((Date.now() - b.createdAt.getTime()) / 864e5)} dias</td></tr>))}</tbody></table>
          )}
          <p className="text-xs text-muted mt-3">Uptime e erros em produção entram quando a ferramenta de monitorização estiver ligada (envia alertas para /api/v1/alerts).</p>
        </section>
      </div>
    </>
  );
}

async function Agentes({ ids, sp }: { ids: string[]; sp: SP }) {
  const d = await delivery(ids, readFilters(sp).range);
  if (!d) return <Empty title="Sem softwares neste filtro" />;
  return (
    <>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi label="PRs no período" value={fmtNum(d.prs.total)} />
        <Kpi label="Feitos por agentes" value={fmtNum(d.prs.agent)} note={d.prs.total ? fmtPct(d.prs.agent / d.prs.total) : undefined} />
        <Kpi label="PRs de agentes aceites" value={fmtNum(d.prs.agentMerged)} note={d.prs.agent ? fmtPct(d.prs.agentMerged / d.prs.agent) : undefined} />
        <Kpi label="Tempo até à primeira revisão" value={d.prs.reviewHours === null ? "–" : `${d.prs.reviewHours.toFixed(1)} h`} />
      </section>
      <section className="card">
        <h2 className="h2">PRs de agentes à espera de revisão</h2>
        {d.prs.openAgent.length === 0 ? <p className="text-muted">Nenhum.</p> : (
          <ul className="space-y-1">{d.prs.openAgent.map((p) => <li key={p.id}><a className="underline" href={p.url ?? "#"} target="_blank" rel="noreferrer">{p.repo}#{p.number}</a> {p.title} <span className="text-muted text-xs">aberto {fmtDate(p.createdAt)}</span></li>)}</ul>
        )}
        <p className="text-xs text-muted mt-3">Um PR conta como de agente quando o autor é um bot do GitHub ou tem a etiqueta &quot;agente&quot;.</p>
      </section>
    </>
  );
}

async function Versoes({ ids, softwares, swName }: { ids: string[]; softwares: { id: string; name: string }[]; swName: (id: string) => string }) {
  const rels = ids.length ? await db.select().from(schema.releases).where(inArray(schema.releases.softwareId, ids)).orderBy(desc(schema.releases.createdAt)) : [];
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-4">
      <section className="space-y-3">
        {rels.length === 0 ? <Empty title="Sem versões" /> : rels.map((r) => (
          <article key={r.id} className="card">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-semibold">{swName(r.softwareId)} {r.version}</span>
              <Pill tone={r.publishedAt ? "verde" : "neutro"}>{r.publishedAt ? `Publicada ${fmtDate(r.publishedAt)}` : "Por publicar"}</Pill>
              {!r.publishedAt ? <form action={publishRelease}><input type="hidden" name="id" value={r.id} /><button className="btn btn-primary">Publicar e enviar para o Slack</button></form> : null}
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm">{r.notes || "Sem notas."}</pre>
          </article>
        ))}
      </section>
      <form action={saveRelease} className="card space-y-3 h-fit">
        <h2 className="h2">Preparar versão</h2>
        <div><label className="label" htmlFor="r-sw">Software</label><select id="r-sw" name="softwareId" className="input">{softwares.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label className="label" htmlFor="r-v">Versão</label><input id="r-v" name="version" className="input" placeholder="1.4.0" required /></div>
        <div><label className="label" htmlFor="r-n">Changelog</label><textarea id="r-n" name="notes" rows={6} className="input" placeholder="Vazio: junta os títulos dos itens marcados com esta versão" /></div>
        <p className="text-xs text-muted">Publicar passa os itens desta versão a Produção, marca o feedback ligado como Lançado e avisa os autores.</p>
        <button className="btn">Guardar versão</button>
      </form>
    </div>
  );
}

async function Custos({ ids, softwares }: { ids: string[]; softwares: { id: string; name: string }[] }) {
  const c = await softwareCosts(ids);
  const totals = c.months.map((_, i) => c.byProvider.reduce((a, p) => a + p.months[i], 0));
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <section className="card overflow-x-auto">
        <h2 className="h2">Custo por fornecedor</h2>
        {c.byProvider.length === 0 ? <p className="text-muted">Ainda sem custos. Importa a fatura de cada fornecedor ao lado, ou liga o AWS Cost Explorer.</p> : (
          <table className="tbl">
            <thead><tr><th>Fornecedor</th>{c.months.map((m) => <th key={m} className="text-right">{m}</th>)}<th className="text-right">Registo de consumo (mês atual)</th></tr></thead>
            <tbody>
              {c.byProvider.map((p) => <tr key={p.provider}><td>{p.provider}</td>{p.months.map((v, i) => <td key={i} className="num text-right">{fmtEur(v)}</td>)}<td className="num text-right">{fmtEur(p.registoMes)}</td></tr>)}
              <tr className="font-semibold"><td>Total</td>{totals.map((v, i) => <td key={i} className="num text-right">{fmtEur(v)}</td>)}<td /></tr>
              <tr><td>Custo por conta</td>{totals.map((v, i) => <td key={i} className="num text-right">{c.accounts ? fmtEur(Math.round(v / c.accounts)) : "–"}</td>)}<td className="text-xs text-muted">{c.accounts} contas pagantes</td></tr>
            </tbody>
          </table>
        )}
      </section>
      <form action={saveProviderCost} className="card space-y-3 h-fit">
        <h2 className="h2">Registar custo do mês</h2>
        <div><label className="label" htmlFor="c-sw">Software</label><select id="c-sw" name="softwareId" className="input">{softwares.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label className="label" htmlFor="c-m">Mês (AAAA-MM)</label><input id="c-m" name="month" className="input" defaultValue={new Date().toISOString().slice(0, 7)} required /></div>
        <div><label className="label" htmlFor="c-p">Fornecedor</label><input id="c-p" name="provider" className="input" placeholder="aws, twilio, deepgram…" required /></div>
        <div><label className="label" htmlFor="c-v">Valor em euros</label><input id="c-v" name="cost" className="input" inputMode="decimal" required /></div>
        <button className="btn">Guardar</button>
      </form>
    </div>
  );
}

function NovoItem({ softwares }: { softwares: { id: string; name: string }[] }) {
  return (
    <form action={createItem} className="card space-y-3 max-w-2xl">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="label" htmlFor="i-sw">Software</label><select id="i-sw" name="softwareId" className="input">{softwares.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label className="label" htmlFor="i-origin">Origem</label><select id="i-origin" name="origin" className="input"><option value="equipa">Equipa</option><option value="comunidade">Comunidade</option><option value="cliente">Cliente</option><option value="incidente">Incidente</option></select></div>
      </div>
      <div><label className="label" htmlFor="i-title">Título</label><input id="i-title" name="title" className="input" required /></div>
      <div><label className="label" htmlFor="i-desc">Descrição</label><textarea id="i-desc" name="description" rows={4} className="input" /></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><label className="label" htmlFor="i-imp">Impacto (1–3)</label><input id="i-imp" name="impact" type="number" min={1} max={3} defaultValue={2} className="input" /></div>
        <div><label className="label" htmlFor="i-reach">Alcance (contas)</label><input id="i-reach" name="reach" type="number" min={0} defaultValue={10} className="input" /></div>
        <div><label className="label" htmlFor="i-conf">Confiança (%)</label><input id="i-conf" name="confidence" type="number" min={0} max={100} defaultValue={50} className="input" /></div>
        <div><label className="label" htmlFor="i-eff">Esforço (pontos)</label><input id="i-eff" name="effort" type="number" min={1} defaultValue={3} className="input" /></div>
      </div>
      <button className="btn btn-primary">Criar item</button>
    </form>
  );
}
