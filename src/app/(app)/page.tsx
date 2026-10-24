import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { readFilters } from "@/lib/filters";
import { overview } from "@/lib/queries";
import { delta, fmtEur, fmtNum, fmtPct, LABELS } from "@/lib/format";
import { Delta, Empty, Kpi, PageHeader, Pill, withParams } from "@/components/ui";

export default async function PainelGeral({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser("painel");
  const sp = await searchParams;
  const { range } = readFilters(sp);
  const { rows, totals } = await overview(range);

  return (
    <>
      <PageHeader title="Painel geral" lead="Todos os softwares N5 lado a lado. Valores em euros sem IVA." />
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" aria-label="Totais N5">
        <Kpi label="MRR" value={fmtEur(totals.mrr)} note={totals.mrrPrev === null ? "sem mês anterior" : <Delta value={delta(totals.mrr, totals.mrrPrev)} />} />
        <Kpi label="ARR" value={fmtEur(totals.arr)} note="MRR × 12" />
        <Kpi label="Contas pagantes" value={fmtNum(totals.paying)} note={`${fmtNum(totals.trials)} trials ativos`} />
        <Kpi label="Gasto Meta no período" value={fmtEur(totals.spend)} note={<Delta value={delta(totals.spend, totals.spendPrev)} neutral />} />
        <Kpi label="CAC médio" value={fmtEur(totals.cac)} note={`${fmtNum(totals.newPaying)} novos clientes pagantes`} />
        <Kpi label="Margem bruta (30 dias)" value={fmtPct(totals.margin)} note="MRR menos o registo de consumo"
          tone={totals.margin === null ? undefined : totals.margin >= 0.75 ? "good" : totals.margin >= 0.5 ? "warn" : "bad"} />
        <Kpi label="Alertas críticos abertos" value={fmtNum(totals.criticalAlerts)} tone={totals.criticalAlerts ? "bad" : "good"}
          note={<Link className="underline" href={withParams("/alertas", sp)}>Abrir centro de alertas</Link>} />
      </section>

      {rows.length === 0 ? (
        <Empty title="Ainda não há softwares">Cria o primeiro em <Link className="underline" href="/definicoes">Definições</Link>.</Empty>
      ) : (
        <section className="card overflow-x-auto" aria-label="Softwares">
          <table className="tbl">
            <thead>
              <tr>
                <th>Software</th><th className="text-right">MRR</th><th className="text-right">Pagantes</th><th className="text-right">Trials</th>
                <th className="text-right">CAC</th><th className="text-right">Margem</th><th>Feedback aberto</th><th>Versão</th><th>Alertas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sw.id}>
                  <td>
                    <Link className="font-semibold underline-offset-2 hover:underline" href={withParams("/receita", { ...sp, sw: r.sw.id })}>{r.sw.name}</Link>
                    <div><Pill tone={r.sw.status === "lancado" ? "verde" : r.sw.status === "beta" ? "accent" : "neutro"}>{LABELS.softwareStatus[r.sw.status]}</Pill></div>
                  </td>
                  <td className="num text-right">{fmtEur(r.mrr)}<div className="text-xs">{r.mrrPrev === null ? "" : <Delta value={delta(r.mrr, r.mrrPrev)} />}</div></td>
                  <td className="num text-right">{fmtNum(r.paying)}</td>
                  <td className="num text-right">{fmtNum(r.trials)}</td>
                  <td className="num text-right">{fmtEur(r.cac)}</td>
                  <td className="num text-right">{fmtPct(r.margin)}</td>
                  <td>
                    <Link href={withParams("/comunidades", { ...sp, sw: r.sw.id })} className="hover:underline">{fmtNum(r.feedbackOpen)}</Link>
                    {r.criticalBugs ? <> · <Pill tone="critico">{r.criticalBugs} bug crítico</Pill></> : null}
                  </td>
                  <td>{r.nextRelease ? <>{r.nextRelease.version} <span className="text-xs text-muted">{r.nextRelease.published ? "publicada" : "em preparação"}</span></> : <span className="text-muted">–</span>}</td>
                  <td className="space-x-1">
                    {r.alerts.critico ? <Pill tone="critico">{r.alerts.critico} críticos</Pill> : null}
                    {r.alerts.aviso ? <Pill tone="aviso">{r.alerts.aviso} avisos</Pill> : null}
                    {!r.alerts.critico && !r.alerts.aviso ? <span className="text-muted">–</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
