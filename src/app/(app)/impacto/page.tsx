import { requireUser, scopeSoftwares } from "@/lib/auth";
import { readFilters } from "@/lib/filters";
import { softwaresFor } from "@/lib/queries";
import { catalogFor, hoursPerMonth, loadImpact, settingsFor, type ImpactBlock } from "@/lib/impact";
import { fmtEur0, fmtNum, fmtPct } from "@/lib/format";
import { Bar, Empty, Kpi, PageHeader, Pill, Tabs, withParams } from "@/components/ui";
import { SettingsForm, TaskForm } from "./forms";

type SP = Record<string, string | string[] | undefined>;

const fmtH = (minutes: number) => `${(minutes / 60).toLocaleString("pt-PT", { maximumFractionDigits: minutes < 600 ? 1 : 0 })} h`;
const fmtX = (x: number | null) => (x == null ? "–" : `${x.toLocaleString("pt-PT", { maximumFractionDigits: x < 10 ? 1 : 0 })}×`);
function fmtDur(seconds: number | null) {
  if (seconds == null) return "–";
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} h`;
}

export default async function Impacto({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("impacto");
  const sp = await searchParams;
  const filters = readFilters(sp);
  const sws = await softwaresFor(user);
  const ids = scopeSoftwares(user, filters.software, sws);
  const vista = typeof sp.vista === "string" ? sp.vista : "resumo";
  const tabs = [{ key: "resumo", label: "Resumo" }, { key: "tarefas", label: "Tempo poupado por tarefa" }, { key: "leads", label: "Leads e negócio" }, { key: "contas", label: "Por conta" }, { key: "pressupostos", label: "Pressupostos" }]
    .map((t) => ({ ...t, href: withParams("/impacto", sp, { vista: t.key }) }));
  const swName = (id: string) => sws.find((s) => s.id === id)?.name ?? id;
  const data = await loadImpact(ids, filters.range);
  const settings = await settingsFor(ids);

  return (
    <>
      <PageHeader title="Impacto" lead="A prova de que cada software compensa para quem o usa: tempo poupado em cada tarefa, leads atendidas a tempo que de outra forma se perdiam e o negócio que daí resulta." />
      <Tabs items={tabs} active={vista} />
      {!ids.length ? <Empty title="Sem softwares neste filtro" /> : null}
      {vista === "resumo" ? ids.map((id) => <Resumo key={id} name={swName(id)} b={data.bySoftware.get(id)!} months={data.months} hourValueCents={settings.get(id)!.hourValueCents} fastMin={settings.get(id)!.fastResponseMinutes} />) : null}
      {vista === "resumo" && ids.length ? <ComoLer /> : null}
      {vista === "tarefas" ? ids.map((id) => <Tarefas key={id} name={swName(id)} b={data.bySoftware.get(id)!} />) : null}
      {vista === "leads" ? ids.map((id) => <Leads key={id} name={swName(id)} b={data.bySoftware.get(id)!} fastMin={settings.get(id)!.fastResponseMinutes} minSample={settings.get(id)!.minSample} />) : null}
      {vista === "contas" ? <Contas accounts={data.accounts} swName={swName} months={data.months} /> : null}
      {vista === "pressupostos" ? <Pressupostos ids={ids} swName={swName} settings={settings} /> : null}
    </>
  );
}

function Resumo({ name, b, months, hourValueCents, fastMin }: { name: string; b: ImpactBlock; months: number; hourValueCents: number; fastMin: number }) {
  const l = b.leads;
  if (!b.tasks.length && !l.total) {
    return <section className="mb-6"><h2 className="h2">{name}</h2><Empty title="Ainda sem dados de impacto">Aparecem quando o software enviar os eventos task.completed, lead.received e lead.first_response.</Empty></section>;
  }
  const roiTone = b.roiTime == null ? undefined : b.roiTime >= 3 ? "good" : b.roiTime >= 1 ? "warn" : "bad";
  return (
    <section className="mb-8">
      <h2 className="h2 flex items-center gap-2">{name} <span className="text-xs text-muted font-normal">{fmtNum(b.accounts)} contas pagantes</span></h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Tempo poupado" value={fmtH(b.minutesSaved)} note={`${hoursPerMonth(b.minutesSaved, months, b.accounts).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} h por conta por mês · medido`} tone="good" />
        <Kpi label="Valor desse tempo" value={fmtEur0(b.timeValueCents)} note={`a ${fmtEur0(hourValueCents)}/h · pressuposto editável`} />
        <Kpi label="Retorno por cada € pago" value={fmtX(b.roiTime)} tone={roiTone} note={<>só com o tempo poupado{b.roiWithBusiness != null ? <> · com negócio protegido: <strong>{fmtX(b.roiWithBusiness)}</strong></> : null}</>} />
        <Kpi label="Negócio protegido (estimado)" value={l.protectedCommissionCents != null ? fmtEur0(l.protectedCommissionCents) : "–"}
          note={l.protectedDeals != null ? `${l.protectedDeals.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} negócios que se perderiam sem resposta fora de horas` : "amostra ainda insuficiente para estimar"} />
        <Kpi label="Leads atendidas fora de horas pela IA" value={fmtNum(l.afterHoursByAi)} note={`${fmtNum(l.afterHoursByAiVisits)} visitas e ${fmtNum(l.afterHoursByAiDeals)} negócios saíram daqui · medido`} />
        <Kpi label="Primeira resposta (mediana)" value={fmtDur(l.medianSeconds)} note={`IA ${fmtDur(l.medianAiSeconds)} · pessoa ${fmtDur(l.medianHumanSeconds)}`} />
        <Kpi label={`Leads respondidas em ${fastMin} min`} value={fmtPct(l.fastShare)} note={`${fmtNum(l.total)} leads no período`} />
        <Kpi label="Negócios com 1.ª resposta da IA" value={fmtNum(l.dealsFirstByAi)} note={`${fmtEur0(l.commissionFirstByAiCents)} em comissões · influenciado, não causado`} />
      </div>
      {b.tasks.length ? (
        <div className="card mt-3">
          <div className="text-sm font-semibold mb-2">Onde está o tempo poupado</div>
          <ol className="space-y-1.5">
            {b.tasks.filter((t) => t.known).slice(0, 6).map((t) => (
              <li key={t.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_70px] gap-3 items-center text-sm">
                <span className="truncate">{t.label}</span><Bar value={t.minutesSaved} max={b.tasks[0].minutesSaved} /><span className="num text-right">{fmtH(t.minutesSaved)}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function ComoLer() {
  return (
    <section className="card text-sm space-y-2">
      <h2 className="h2">Como ler estes números</h2>
      <p><Pill tone="verde">medido</Pill> Vem diretamente dos eventos dos softwares: tarefas feitas pela IA, leads, tempos de resposta, visitas e negócios. O tempo poupado usa o tempo de referência de cada tarefa (separador Pressupostos); só conta quando a IA fez ou ajudou a fazer a tarefa.</p>
      <p><Pill tone="amarelo">estimado</Pill> O negócio protegido compara, nos nossos próprios dados, quantas leads chegam a visita e a negócio quando a resposta é rápida e quando passa de uma hora. Essa diferença aplica-se às leads que a IA atendeu fora de horas, que sem ela só teriam resposta no dia seguinte. Só aparece com amostra suficiente nos dois grupos.</p>
      <p><Pill>influenciado</Pill> Negócios cuja primeira resposta foi da IA. Mostra a contribuição, não prova que o negócio não acontecia sem ela; por isso não entra no retorno.</p>
    </section>
  );
}

function Tarefas({ name, b }: { name: string; b: ImpactBlock }) {
  return (
    <section className="card overflow-x-auto mb-4">
      <h2 className="h2">{name}</h2>
      {b.tasks.length === 0 ? <p className="text-muted">Sem tarefas registadas no período.</p> : (
        <table className="tbl">
          <thead><tr><th>Tarefa</th><th className="text-right">Feitas</th><th className="text-right">Pela IA</th><th className="text-right">À mão (min)</th><th className="text-right">Fica para a pessoa (min)</th><th className="text-right">Tempo poupado</th><th>Base do tempo</th></tr></thead>
          <tbody>{b.tasks.map((t) => (
            <tr key={t.key}>
              <td>{t.label}<div className="text-xs text-muted font-mono">{t.key}</div></td>
              <td className="num text-right">{fmtNum(t.count)}</td>
              <td className="num text-right">{fmtPct((t.ai + t.assisted) / Math.max(1, t.count), 0)}</td>
              <td className="num text-right">{t.known ? fmtNum(t.manualMinutes) : "–"}</td>
              <td className="num text-right">{t.known ? fmtNum(t.remainingMinutes) : "–"}</td>
              <td className="num text-right font-semibold">{t.known ? fmtH(t.minutesSaved) : "–"}</td>
              <td>{!t.known ? <Pill tone="aviso">fora do catálogo</Pill> : t.validated ? <Pill tone="verde">validado</Pill> : <Pill tone="amarelo">a validar</Pill>}</td>
            </tr>))}</tbody>
        </table>
      )}
      <p className="text-xs text-muted mt-3">Tempo poupado = execuções feitas ou ajudadas pela IA × (minutos à mão − minutos que ficam para a pessoa). Tarefas fora do catálogo não contam até terem tempo de referência.</p>
    </section>
  );
}

function Leads({ name, b, fastMin, minSample }: { name: string; b: ImpactBlock; fastMin: number; minSample: number }) {
  const l = b.leads;
  const maxRate = Math.max(...l.buckets.map((x) => x.visitRate ?? 0), 0.01);
  return (
    <section className="mb-6">
      <h2 className="h2">{name}</h2>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card overflow-x-auto">
          <div className="text-sm font-semibold mb-1">Quanto mais rápida a resposta, mais visitas</div>
          <p className="text-xs text-muted mb-3">Leads recebidas no período, pelo tempo até à primeira resposta. Medido.</p>
          <table className="tbl">
            <thead><tr><th>Primeira resposta</th><th className="text-right">Leads</th><th className="text-right">Visitas</th><th>Taxa de visita</th></tr></thead>
            <tbody>{l.buckets.filter((x) => x.leads > 0).map((x) => (
              <tr key={x.key}><td>{x.label}</td><td className="num text-right">{fmtNum(x.leads)}</td><td className="num text-right">{fmtNum(x.visits)}</td>
                <td><div className="grid grid-cols-[1fr_48px] gap-2 items-center"><Bar value={x.visitRate ?? 0} max={maxRate} /><span className="num text-right text-sm">{fmtPct(x.visitRate, 0)}</span></div></td></tr>))}</tbody>
          </table>
        </div>
        <div className="card space-y-3 text-sm">
          <div className="font-semibold">O que não se perdeu</div>
          <ol className="space-y-1">
            <li className="flex justify-between"><span>Leads recebidas fora de horas</span><span className="num">{fmtNum(l.afterHours)}</span></li>
            <li className="flex justify-between"><span>… atendidas pela IA em {fastMin} min</span><span className="num">{fmtNum(l.afterHoursByAi)}</span></li>
            <li className="flex justify-between"><span>… que chegaram a visita</span><span className="num">{fmtNum(l.afterHoursByAiVisits)}</span></li>
            <li className="flex justify-between"><span>… que fecharam negócio</span><span className="num">{fmtNum(l.afterHoursByAiDeals)} · {fmtEur0(l.afterHoursByAiCommissionCents)}</span></li>
          </ol>
          <div className="border-t border-line pt-3">
            <div className="font-semibold mb-1">Comparação rápida vs lenta (medida nos nossos dados)</div>
            <table className="tbl">
              <thead><tr><th>Grupo</th><th className="text-right">Leads</th><th className="text-right">Visita</th><th className="text-right">Negócio</th></tr></thead>
              <tbody>
                <tr><td>Resposta até {fastMin} min</td><td className="num text-right">{fmtNum(l.fast.n)}</td><td className="num text-right">{fmtPct(l.fast.visitRate)}</td><td className="num text-right">{fmtPct(l.fast.dealRate)}</td></tr>
                <tr><td>Resposta depois de 1 h</td><td className="num text-right">{fmtNum(l.slow.n)}</td><td className="num text-right">{fmtPct(l.slow.visitRate)}</td><td className="num text-right">{fmtPct(l.slow.dealRate)}</td></tr>
              </tbody>
            </table>
            {l.upliftDeal != null ? (
              <p className="mt-2">Responder depressa dá mais <strong>{fmtPct(l.upliftVisit)}</strong> de visitas e <strong>{fmtPct(l.upliftDeal)}</strong> de negócios. Aplicado às leads atendidas fora de horas pela IA: cerca de <strong>{(l.protectedVisits ?? 0).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} visitas</strong> e <strong>{(l.protectedDeals ?? 0).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} negócios</strong> ({fmtEur0(l.protectedCommissionCents)}) que se teriam perdido. <Pill tone="amarelo">estimado</Pill></p>
            ) : <p className="mt-2 text-muted">Ainda não há {minSample} leads em cada grupo para estimar com segurança.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function Contas({ accounts, swName, months }: { accounts: Awaited<ReturnType<typeof loadImpact>>["accounts"]; swName: (id: string) => string; months: number }) {
  if (!accounts.length) return <Empty title="Sem contas com dados de impacto no período" />;
  return (
    <section className="card overflow-x-auto">
      <p className="text-sm text-muted mb-3">As contas com retorno alto são candidatas a caso de estudo e testemunho; as que ficam abaixo de 1× correm risco de cancelar e geram um alerta.</p>
      <table className="tbl">
        <thead><tr><th>Conta</th><th>Software</th><th className="text-right">Horas/mês</th><th className="text-right">Valor do tempo</th><th className="text-right">Pago</th><th className="text-right">Retorno</th><th className="text-right">Fora de horas pela IA</th><th className="text-right">Visitas pela IA</th><th className="text-right">Negócio protegido</th><th></th></tr></thead>
        <tbody>{accounts.map((a) => (
          <tr key={`${a.softwareId}-${a.orgId}`}>
            <td>{a.orgName}</td><td>{swName(a.softwareId)}</td>
            <td className="num text-right">{hoursPerMonth(a.minutesSaved, months).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}</td>
            <td className="num text-right">{fmtEur0(a.timeValueCents)}</td>
            <td className="num text-right">{a.costCents ? fmtEur0(a.costCents) : "trial"}</td>
            <td className={`num text-right font-semibold ${a.roiTime == null ? "" : a.roiTime >= 3 ? "text-good" : a.roiTime >= 1 ? "text-warn" : "text-bad"}`}>{fmtX(a.roiTime)}</td>
            <td className="num text-right">{fmtNum(a.afterHoursByAi)}</td>
            <td className="num text-right">{fmtNum(a.visitsByAi)}</td>
            <td className="num text-right">{a.protectedCommissionCents != null ? fmtEur0(a.protectedCommissionCents) : "–"}</td>
            <td>{a.roiTime != null && a.roiTime >= 10 ? <Pill tone="verde">caso de estudo</Pill> : a.roiTime != null && a.roiTime < 1 ? <Pill tone="critico">risco</Pill> : null}</td>
          </tr>))}</tbody>
      </table>
    </section>
  );
}

async function Pressupostos({ ids, swName, settings }: { ids: string[]; swName: (id: string) => string; settings: Awaited<ReturnType<typeof settingsFor>> }) {
  const catalog = await catalogFor(ids);
  return (
    <div className="space-y-6">
      <section className="card text-sm text-muted">
        Os tempos de referência são o pressuposto principal do tempo poupado: devem ser medidos com utilizadores reais (cronometrar a tarefa feita à mão e com o software) e marcados como validados. Enquanto não forem, os números aparecem como "a validar". Todas as alterações ficam no registo de auditoria.
      </section>
      {ids.map((id) => {
        const s = settings.get(id)!;
        const rows = catalog.filter((c) => c.softwareId === id);
        return (
          <section key={id} className="space-y-3">
            <h2 className="h2">{swName(id)}</h2>
            <div className="card"><SettingsForm softwareId={id} hourValue={s.hourValueCents / 100} fastResponseMinutes={s.fastResponseMinutes} minSample={s.minSample} /></div>
            {rows.map((t) => (
              <details key={t.id} className="card">
                <summary className="cursor-pointer flex flex-wrap gap-2 items-center">
                  <span className="font-semibold">{t.label}</span>
                  <span className="text-sm text-muted num">{fmtNum(Number(t.manualMinutes))} → {fmtNum(Number(t.remainingMinutes))} min</span>
                  {t.validated ? <Pill tone="verde">validado</Pill> : <Pill tone="amarelo">a validar</Pill>}
                  {!t.active ? <Pill>não conta</Pill> : null}
                </summary>
                <div className="mt-3"><TaskForm softwareId={id} t={{ ...t }} /></div>
              </details>
            ))}
            <div className="card"><div className="text-sm font-semibold mb-2">Nova tarefa</div><TaskForm softwareId={id} /></div>
          </section>
        );
      })}
    </div>
  );
}
