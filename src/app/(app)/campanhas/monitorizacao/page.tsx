import { requireUser, scopeSoftwares } from "@/lib/auth";
import { readFilters } from "@/lib/filters";
import { campaignMonitor, monitoredCampaigns, softwaresFor } from "@/lib/queries";
import { awarenessLevel, funnelRows, groupAds, landingPageOf } from "@/lib/metrics";
import { fmtDate, fmtEur, fmtNum, fmtPct } from "@/lib/format";
import { Bar, Empty, Kpi, PageHeader, Tabs, withParams } from "@/components/ui";
import { DailyBars } from "@/components/DailyBars";
import { syncNow } from "../actions";

// Monitorização de uma campanha da Meta desde o início, como o painel da campanha: indicadores, funil do anúncio
// à pré-reserva, gasto e leads por dia, por landing page, por nível de consciência e por anúncio.
// Números da sincronização da Meta (campaign_daily); o nível e a página vêm do nome do anúncio («CLA · N3 · TEMA · /pasta/»).

const ratio = (a: number, b: number) => (b ? a / b : null);
const perUnit = (cents: number, n: number) => (n ? Math.round(cents / n) : null);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;

export default async function Monitorizacao({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("campanhas");
  const sp = await searchParams;
  const filters = readFilters(sp);
  const sws = await softwaresFor(user);
  const ids = scopeSoftwares(user, filters.software, sws);
  const list = await monitoredCampaigns(ids);
  const asked = typeof sp.campanha === "string" ? sp.campanha : null;
  const chosen = list.find((c) => c.campaignId === asked) ?? list[0];
  const m = chosen ? await campaignMonitor(chosen.campaignId, ids) : null;
  const tabs = [
    { key: "geral", label: "Visão geral", href: withParams("/campanhas", sp) },
    { key: "monitorizacao", label: "Monitorização", href: withParams("/campanhas/monitorizacao", sp) },
  ];

  return (
    <>
      <PageHeader title="Campanhas e funil" lead="Uma campanha da Meta desde o início: do anúncio à pré-reserva, por landing page, nível e anúncio.">
        <form action={syncNow}><button className="btn">Sincronizar Meta agora</button></form>
      </PageHeader>
      <Tabs items={tabs} active="monitorizacao" />
      {!chosen || !m ? (
        <Empty title="Sem campanhas sincronizadas">Liga a conta de anúncios do software em Definições › Softwares e carrega em «Sincronizar Meta agora».</Empty>
      ) : (
        <Monitor m={m} chosen={chosen} list={list} sp={sp} />
      )}
    </>
  );
}

type Monitor = NonNullable<Awaited<ReturnType<typeof campaignMonitor>>>;
type Campaign = Awaited<ReturnType<typeof monitoredCampaigns>>[number];

function Monitor({ m, chosen, list, sp }: { m: Monitor; chosen: Campaign; list: Campaign[]; sp: Record<string, string | string[] | undefined> }) {
  const t = m.totals;
  const days = m.first ? daysBetween(m.first, today()) : 0;
  const budgetToDate = m.dailyBudgetCents ? m.dailyBudgetCents * days : null;
  const funnel = funnelRows([
    { label: "Impressões", n: t.impressions }, { label: "Cliques", n: t.clicks }, { label: "Visitas à página", n: t.landingViews },
    { label: "Leads", n: t.leads }, { label: "Pré-reservas pagas", n: t.purchases },
  ]);
  const pages = groupAds(m.ads, (r) => landingPageOf(r.adName)).sort((a, b) => b.spendCents - a.spendCents);
  const levels = groupAds(m.ads, (r) => { const n = awarenessLevel(r.adName); return n ? `N${n}` : "Sem nível"; })
    .sort((a, b) => a.key.localeCompare(b.key, "pt"));
  const maxLevel = Math.max(...levels.map((l) => l.spendCents), 1);
  const keep = Object.fromEntries(Object.entries(sp).filter(([k, v]) => k !== "campanha" && typeof v === "string")) as Record<string, string>;

  return (
    <div className="space-y-4">
      <form method="get" className="flex flex-wrap items-end gap-3">
        {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <div><label className="label" htmlFor="campanha">Campanha</label>
          <select id="campanha" name="campanha" defaultValue={chosen.campaignId} className="input min-w-[18rem]">
            {list.map((c) => <option key={c.campaignId} value={c.campaignId}>{c.name}</option>)}
          </select></div>
        <button className="btn">Ver</button>
      </form>

      <p className="text-lg max-w-3xl">
        Em <b className="num">{fmtNum(days)}</b> dias, desde {fmtDate(m.first)}, <b className="num">{fmtEur(t.spendCents)}</b> de anúncios trouxeram{" "}
        <b className="num">{fmtNum(t.leads)}</b> leads{t.leads ? <>, a <b className="num">{fmtEur(perUnit(t.spendCents, t.leads))}</b> cada,</> : ""} e{" "}
        <b className="num">{fmtNum(t.purchases)}</b> pré-reservas pagas.
      </p>

      <section className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi label="Gasto" value={fmtEur(t.spendCents)} note={budgetToDate ? `de ${fmtEur(budgetToDate)} de orçamento até hoje` : "desde o início"} />
        <Kpi label="Leads" value={fmtNum(t.leads)} note={`${fmtNum(t.landingViews)} visitas à página`} />
        <Kpi label="Custo por lead" value={fmtEur(perUnit(t.spendCents, t.leads))} />
        <Kpi label="Pré-reservas pagas" value={fmtNum(t.purchases)} note={t.purchases ? `${fmtEur(perUnit(t.spendCents, t.purchases))} cada` : "evento Purchase do píxel"} />
        <Kpi label="CTR" value={fmtPct(ratio(t.clicks, t.impressions), 2)} note={`${fmtNum(t.clicks)} cliques em ${fmtNum(t.impressions)} impressões`} />
        <Kpi label="Custo por clique" value={fmtEur(perUnit(t.spendCents, t.clicks))} note={`CPM ${fmtEur(t.impressions ? Math.round((t.spendCents / t.impressions) * 1000) : null)}`} />
      </section>

      <section className="card">
        <h2 className="h2">Do anúncio à pré-reserva</h2>
        <p className="text-xs text-muted mb-3">Desde o início. Ao lado de cada passo, a parte que passou do passo anterior; a maior perda está a vermelho.</p>
        <ol className="space-y-2">
          {funnel.map((s) => (
            <li key={s.label} className="grid grid-cols-[150px_1fr_170px] gap-3 items-center text-sm">
              <span>{s.label}</span><Bar value={s.n} max={funnel[0].n || 1} tone={s.worst ? "bad" : "accent"} />
              <span className="num text-right">{fmtNum(s.n)}{s.fromPrevious !== null ? <span className="text-muted text-xs"> · {fmtPct(s.fromPrevious)} do anterior</span> : null}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="card">
          <h2 className="h2">Gasto por dia</h2>
          <p className="text-xs text-muted mb-2">Em euros.{m.dailyBudgetCents ? " A linha tracejada é o orçamento diário." : ""}</p>
          <DailyBars days={m.days.map((d) => ({ date: d.date, value: d.spendCents }))} format={(v) => fmtEur(v)} reference={m.dailyBudgetCents} referenceLabel="orçamento" />
        </section>
        <section className="card">
          <h2 className="h2">Leads por dia</h2>
          <p className="text-xs text-muted mb-2">Inscrições no site com o evento Lead do píxel.</p>
          <DailyBars days={m.days.map((d) => ({ date: d.date, value: d.leads }))} format={(v) => fmtNum(v)} />
        </section>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="h2">Por landing page</h2>
        <p className="text-xs text-muted mb-3">Os anúncios agrupados pela página para onde levam (o endereço no fim do nome; sem endereço, a página principal).</p>
        <table className="tbl">
          <thead><tr><th>Página</th><th className="text-right">Anúncios</th><th className="text-right">Gasto</th><th className="text-right">Cliques</th><th className="text-right">CTR</th><th className="text-right">Visitas</th><th className="text-right">Leads</th><th className="text-right">Custo/lead</th><th className="text-right">Pré-reservas</th></tr></thead>
          <tbody>{pages.map((p) => (
            <tr key={p.key}><td className="num">{p.key}</td><td className="num text-right">{fmtNum(p.ads)}</td><td className="num text-right">{fmtEur(p.spendCents)}</td>
              <td className="num text-right">{fmtNum(p.clicks)}</td><td className="num text-right">{fmtPct(ratio(p.clicks, p.impressions), 2)}</td>
              <td className="num text-right">{fmtNum(p.landingViews)}</td><td className="num text-right">{fmtNum(p.leads)}</td>
              <td className="num text-right">{fmtEur(perUnit(p.spendCents, p.leads))}</td><td className="num text-right">{fmtNum(p.purchases)}</td></tr>
          ))}</tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="h2">Por nível de consciência</h2>
        <p className="text-xs text-muted mb-3">N1 é quem ainda não sabe que tem o problema; N5 quem já está pronto para a pré-reserva. A barra é o gasto desde o início.</p>
        <ol className="space-y-2">
          {levels.map((l) => (
            <li key={l.key} className="grid grid-cols-[150px_1fr_220px] gap-3 items-center text-sm">
              <span>{l.key} · {fmtNum(l.ads)} anúncios</span><Bar value={l.spendCents} max={maxLevel} />
              <span className="num text-right">{fmtEur(l.spendCents)}<span className="text-muted text-xs"> · {fmtNum(l.leads)} leads{l.leads ? ` · ${fmtEur(perUnit(l.spendCents, l.leads))} por lead` : ""}</span></span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="h2">Anúncios</h2>
        <p className="text-xs text-muted mb-3">Todos os anúncios da campanha, desde o início, do que gastou mais para o que gastou menos.</p>
        <table className="tbl">
          <thead><tr><th>Anúncio</th><th>Nível</th><th>Conjunto</th><th className="text-right">Gasto</th><th className="text-right">Impressões</th><th className="text-right">CTR</th><th className="text-right">Visitas</th><th className="text-right">Leads</th><th className="text-right">Custo/lead</th><th className="text-right">Pré-reservas</th><th className="text-right">Último gasto</th></tr></thead>
          <tbody>{m.ads.map((a) => (
            <tr key={a.adName}><td className="max-w-xs">{a.adName}</td><td>{awarenessLevel(a.adName) ? `N${awarenessLevel(a.adName)}` : "–"}</td><td className="text-xs text-muted">{a.adsetName}</td>
              <td className="num text-right">{fmtEur(a.spendCents)}</td><td className="num text-right">{fmtNum(a.impressions)}</td><td className="num text-right">{fmtPct(ratio(a.clicks, a.impressions), 2)}</td>
              <td className="num text-right">{fmtNum(a.landingViews)}</td><td className="num text-right">{fmtNum(a.leads)}</td><td className="num text-right">{fmtEur(perUnit(a.spendCents, a.leads))}</td>
              <td className="num text-right">{fmtNum(a.purchases)}</td><td className="num text-right">{fmtDate(a.lastSpend)}</td></tr>
          ))}</tbody>
        </table>
      </section>

      <p className="text-xs text-muted max-w-3xl">Números da sincronização da Meta (de 6 em 6 horas, ou no botão). Leads e pré-reservas são os eventos Lead e Purchase do píxel: só contam quem aceita os cookies de marketing, por isso o site e a Stripe têm sempre mais. A Meta ainda corrige os últimos dias. O que acontece dentro do site (secções, tempo, passos da inscrição) entra numa próxima versão, a partir do PostHog.</p>
    </div>
  );
}
