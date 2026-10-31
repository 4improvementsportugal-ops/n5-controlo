import { requireUser, scopeSoftwares } from "@/lib/auth";
import { readFilters } from "@/lib/filters";
import { aboOverview, campaigns, softwaresFor } from "@/lib/queries";
import { fmtDate, fmtDateTime, fmtEur, fmtNum, fmtPct } from "@/lib/format";
import { Bar, Empty, Kpi, PageHeader, Pill, Tabs, withParams } from "@/components/ui";
import { ImportForm } from "./ImportForm";
import { AboForm } from "./AboForm";
import { syncNow, toggleAboCampaign } from "./actions";

const MOMENT: Record<string, string> = { manha: "manhã", noite: "noite" };
const ACTION_TONE: Record<string, string> = { manter: "neutro", subir: "verde", descer: "amarelo", pausar: "vermelho", aviso: "aviso" };
const actionLabel = (d: { action: string; incoming: string | null }) =>
  d.action === "pausar" ? (d.incoming ? "Trocar" : "Parar") : ({ manter: "Manter", subir: "Subir", descer: "Descer", aviso: "Aviso" } as Record<string, string>)[d.action] ?? d.action;
const appliedText = (d: { action: string; applied: boolean; errorCode: string | null }) => {
  if (d.action === "manter" || d.action === "aviso") return "–";
  if (d.applied) return "Aplicada";
  if (d.errorCode === "sem_token_gestao") return "Só proposta (falta o token de gestão)";
  if (d.errorCode === "gestao_sem_permissao") return "Só proposta (token sem ads_management)";
  return `Falhou (${d.errorCode ?? "erro"})`;
};
const budgetText = (from: number | null, to: number | null) => (from === null ? "–" : from === to ? fmtEur(to) : `${fmtEur(from)} → ${fmtEur(to)}`);

export default async function Campanhas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("campanhas");
  const sp = await searchParams;
  const filters = readFilters(sp);
  const sws = await softwaresFor(user);
  const ids = scopeSoftwares(user, filters.software, sws);
  const { rows, funnel } = await campaigns(ids, filters.range);
  const abo = await aboOverview(ids);
  const swName = (id: string) => sws.find((s) => s.id === id)?.name ?? id;
  const stages = funnel ? [
    { label: "Impressões", n: funnel.impressions }, { label: "Cliques", n: funnel.clicks }, { label: "Registos", n: funnel.signups },
    { label: "Ativações", n: funnel.activated }, { label: "Clientes pagantes", n: funnel.paying },
  ] : [];

  return (
    <>
      <PageHeader title="Campanhas e funil" lead="Do gasto na Meta ao cliente pagante, por software.">
        <form action={syncNow}><button className="btn">Sincronizar Meta agora</button></form>
      </PageHeader>
      <Tabs items={[{ key: "geral", label: "Visão geral", href: withParams("/campanhas", sp) }, { key: "monitorizacao", label: "Monitorização", href: withParams("/campanhas/monitorizacao", sp) }]} active="geral" />
      {funnel ? (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Kpi label="Gasto" value={fmtEur(funnel.spend)} />
          <Kpi label="Registos" value={fmtNum(funnel.signups)} note={funnel.signups ? `${fmtEur(Math.round(funnel.spend / funnel.signups))} por registo` : undefined} />
          <Kpi label="Clientes pagantes" value={fmtNum(funnel.paying)} note={`CAC ${fmtEur(funnel.cac)}`} />
          <Kpi label="Registos sem atribuição" value={funnel.signups ? fmtPct(funnel.unattributed / funnel.signups) : "–"}
            tone={funnel.signups && funnel.unattributed / funnel.signups > 0.2 ? "warn" : undefined} note="alerta acima de 20%" />
        </section>
      ) : null}
      <div className="grid lg:grid-cols-[1fr_340px] gap-4">
        <div className="space-y-4 min-w-0">
          <section className="card">
            <h2 className="h2">Funil do período</h2>
            {stages.every((s) => s.n === 0) ? <p className="text-muted">Sem dados no período.</p> : (
              <ol className="space-y-2">
                {stages.map((s, i) => {
                  // Cliques em % das impressões; o resto em % dos registos (as etapas depois do registo não são subconjuntos exatos)
                  const base = i === 0 || i === 2 ? null : i === 1 ? stages[0].n : stages[2].n;
                  const baseLabel = i === 1 ? "das impressões" : "dos registos";
                  return (
                    <li key={s.label} className="grid grid-cols-[130px_1fr_190px] gap-3 items-center text-sm">
                      <span>{s.label}</span><Bar value={s.n} max={stages[0].n || 1} />
                      <span className="num text-right">{fmtNum(s.n)}{base ? <span className="text-muted text-xs"> · {fmtPct(s.n / base)} {baseLabel}</span> : null}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
          <section className="card overflow-x-auto">
            <h2 className="h2">Campanhas</h2>
            {rows.length === 0 ? <Empty title="Sem campanhas no período">Liga a conta de anúncios do software nas Definições e sincroniza, ou importa um CSV.</Empty> : (
              <table className="tbl">
                <thead><tr><th>Campanha</th><th>Software</th><th className="text-right">Gasto</th><th className="text-right">CPM</th><th className="text-right">CTR</th><th className="text-right">CPC</th><th className="text-right">Leads</th><th className="text-right">CPL</th><th className="text-right">Registos</th><th className="text-right">Pagantes</th><th className="text-right">CAC</th><th className="text-right">Freq. máx.</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.sw + r.campaignId}>
                    <td className="max-w-xs">{r.name}</td><td>{swName(r.sw)}</td><td className="num text-right">{fmtEur(r.spend)}</td>
                    <td className="num text-right">{fmtEur(r.cpm === null ? null : Math.round(r.cpm))}</td><td className="num text-right">{fmtPct(r.ctr, 2)}</td>
                    <td className="num text-right">{fmtEur(r.cpc === null ? null : Math.round(r.cpc))}</td><td className="num text-right">{fmtNum(r.leads)}</td>
                    <td className="num text-right">{fmtEur(r.cpl === null ? null : Math.round(r.cpl))}</td><td className="num text-right">{fmtNum(r.signups)}</td>
                    <td className="num text-right">{fmtNum(r.paying)}</td><td className="num text-right">{fmtEur(r.cac)}</td>
                    <td className={`num text-right ${r.freq > 3 ? "text-warn font-semibold" : ""}`}>{r.freq ? r.freq.toFixed(2) : "–"}</td>
                  </tr>))}</tbody>
              </table>
            )}
            <p className="text-xs text-muted mt-3">Registos e pagantes por campanha usam a UTM utm_campaign igual ao nome da campanha (convenção software_objetivo_público_data).</p>
          </section>
          <section className="card overflow-x-auto" id="orcamentos-abo">
            <h2 className="h2">Orçamentos ABO</h2>
            <p className="text-xs text-muted mb-3">Um criativo por conjunto de anúncios. Às 08:00, o melhor custo ganha 20% do orçamento do pior e o total do dia volta ao da campanha, com 3 a 10 € por conjunto; quem gasta 15 € sem inscrições e com visitas ao dobro da média dá lugar ao seguinte da fila. Às 20:00 só se corta a quem gastou 4 € no dia sem visitas. Sem o token de gestão, as decisões ficam só propostas.</p>
            {abo.length === 0 ? <Empty title="Nenhuma campanha ligada">Liga uma campanha com o formulário ao lado.</Empty> : abo.map((c) => (
              <div key={c.campaignId} className="mb-6 last:mb-0">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted"> · {swName(c.softwareId)} · {fmtEur(c.dailyBudgetCents)} por dia · ABO desde {fmtDate(c.aboSince)}</span>
                    {(c.dailyBudgetCents * 30.4) / 100 > 1000 ? <> <Pill tone="aviso">Acima de 1000 € por mês: passar a CBO</Pill></> : null}
                  </div>
                  <form action={toggleAboCampaign}>
                    <input type="hidden" name="campaignId" value={c.campaignId} />
                    <button className="btn">{c.auto ? "Desligar regras" : "Ligar regras"}</button>
                  </form>
                </div>
                {!c.auto ? <p className="text-warn text-sm mb-2">Regras desligadas: não mexem em nada.</p> : null}
                {c.last.length === 0 ? <p className="text-muted text-sm">Ainda sem análises. A primeira é às 08:00 ou às 20:00.</p> : (
                  <>
                    <p className="text-xs text-muted mb-1">Última análise: {MOMENT[c.last[0].moment] ?? c.last[0].moment}, {fmtDateTime(c.last[0].createdAt)}</p>
                    <table className="tbl">
                      <thead><tr><th>Conjunto</th><th>Criativo</th><th>Decisão</th><th className="text-right">Orçamento do dia</th><th>Motivo</th><th>Na Meta</th></tr></thead>
                      <tbody>{c.last.map((d) => (
                        <tr key={d.id}>
                          <td className="max-w-[14rem]">{d.adsetName ?? "–"}</td><td>{d.adName ?? "–"}</td>
                          <td><Pill tone={ACTION_TONE[d.action]}>{actionLabel(d)}</Pill></td>
                          <td className="num text-right whitespace-nowrap">{budgetText(d.fromCents, d.toCents)}</td>
                          <td className="max-w-md">{d.reason}</td><td className="text-sm">{appliedText(d)}</td>
                        </tr>))}</tbody>
                    </table>
                  </>
                )}
                {c.history.length ? (
                  <details className="mt-3">
                    <summary className="text-sm cursor-pointer">Mudanças anteriores ({c.history.length})</summary>
                    <ul className="mt-2 space-y-1 text-sm">{c.history.map((d) => (
                      <li key={d.id}><span className="text-muted">{fmtDateTime(d.createdAt)} · </span>{d.adName ?? d.adsetName ?? "Campanha"}: {actionLabel(d)} {budgetText(d.fromCents, d.toCents)} · {d.reason} <span className="text-muted">({appliedText(d)})</span></li>
                    ))}</ul>
                  </details>
                ) : null}
              </div>
            ))}
          </section>
        </div>
        <div className="space-y-4">
          <AboForm softwares={sws.filter((s) => ids.includes(s.id))} />
          <ImportForm softwares={sws.filter((s) => ids.includes(s.id))} />
        </div>
      </div>
    </>
  );
}
