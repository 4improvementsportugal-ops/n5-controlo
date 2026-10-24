// Dados de EXEMPLO para desenvolvimento e demonstração. Não correr em produção.
// Cria os dois softwares reais (N5 Clara e N5 Imobiliário) com a sua configuração base e,
// à volta deles, contas, feedback, campanhas e eventos inventados, marcados como exemplo.
import bcrypt from "bcryptjs";
import { db, schema, sql } from "./index";

if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
  console.error("Recusado: o seed cria dados de exemplo. Em produção usa só scripts/create-user.ts.");
  process.exit(1);
}

const day = 864e5;
const now = Date.now();
const ago = (d: number) => new Date(now - d * day);
let n = 0;
const id = (p: string) => `${p}_ex${(++n).toString().padStart(4, "0")}`;
const rnd = (() => { let s = 42; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

async function main() {
  // --if-empty: usado no arranque da demonstração; não apaga nada se já houver utilizadores
  if (process.argv.includes("--if-empty")) {
    if (process.env.DEMO_DATA !== "true") { console.log("DEMO_DATA não está ativo: sem dados de exemplo."); await sql.end(); return; }
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
    if (n > 0) { console.log("A base de dados já tem utilizadores: seed ignorado."); await sql.end(); return; }
  }
  await sql`truncate table audit_log, webhook_inbox, alerts, campaign_daily, provider_costs, releases, deployments, pull_requests,
    roadmap_items, feedback, usage_records, product_events, invoices, mrr_monthly, subscriptions, persons, organizations,
    api_keys, user_softwares, users, softwares restart identity cascade`;

  await db.insert(schema.softwares).values([
    {
      id: "sw_clara", name: "N5 Clara", code: "CLA", status: "beta", slackPrefix: "clara", githubRepos: ["4ImprovementsPortugal/n5-clara"],
      activationDefinition: "Primeiro número WhatsApp ligado e primeira lead respondida pelo agente",
      keyEvents: ["whatsapp.number_connected", "lead.received", "lead.replied_by_agent", "lead.status_changed", "voice.command", "call.completed", "call.analysis_viewed", "contact.created", "report.weekly_viewed"],
      cplLimitCents: 1500, costPerAccountLimitCents: 2000,
    },
    {
      id: "sw_imobiliario", name: "N5 Imobiliário", code: "IMO", status: "em_construcao", slackPrefix: "imobiliario", githubRepos: ["4ImprovementsPortugal/n5-imobiliario"],
      activationDefinition: "Três consultores ativos na mesma semana",
      keyEvents: ["whatsapp.number_connected", "lead.received", "lead.replied_by_agent", "lead.assigned", "consultant.added", "voice.command", "call.completed", "team_report.viewed", "pipeline.viewed"],
      cplLimitCents: 4000, costPerAccountLimitCents: 15000,
    },
  ]);

  const pass = await bcrypt.hash("exemplo-n5-2026!", 12);
  const [socio] = await db.insert(schema.users).values({ email: "socio@exemplo.n5", name: "Sócio (exemplo)", role: "socio", passwordHash: pass }).returning();
  const [colab] = await db.insert(schema.users).values({ email: "colaborador@exemplo.n5", name: "Colaborador (exemplo)", role: "colaborador", passwordHash: pass }).returning();
  await db.insert(schema.userSoftwares).values({ userId: colab.id, softwareId: "sw_clara" });

  // ---- Contas, pessoas, subscrições, faturas, MRR mensal
  const firstNames = ["Ana", "Rui", "Marta", "João", "Inês", "Tiago", "Sofia", "Pedro", "Carla", "Nuno", "Rita", "Hugo"];
  const campaignsClara = ["clara_trial_consultores_2026-09", "clara_trial_lookalike_2026-10"];
  const campaignsImo = ["imo_demo_brokers_2026-10"];
  const monthKey = (d: Date) => d.toISOString().slice(0, 7);
  for (let i = 0; i < 26; i++) {
    const isImo = i >= 20;
    const sw = isImo ? "sw_imobiliario" : "sw_clara";
    const orgId = id("org");
    const started = ago(10 + Math.floor(rnd() * 150));
    const name = isImo ? `Agência Exemplo ${i - 19}` : `${pick(firstNames)} ${["Silva", "Costa", "Santos", "Ferreira"][i % 4]} (exemplo)`;
    await db.insert(schema.organizations).values({ id: orgId, name, type: isImo ? "agencia" : i % 3 === 0 ? "eni" : "particular", isExample: true, createdAt: started });
    const status = i % 9 === 0 ? "canceled" : i % 7 === 0 ? "trialing" : i % 13 === 0 ? "past_due" : "active";
    const mrr = isImo ? 29900 : 3821; // 47 € com IVA = 38,21 € sem IVA
    await db.insert(schema.subscriptions).values({
      id: id("sub"), organizationId: orgId, softwareId: sw, plan: isImo ? "Imobiliário Base" : "Clara Mensal", status,
      mrrCents: status === "trialing" ? 0 : mrr, includedMinutes: isImo ? 1000 : 100, includedLeads: isImo ? 400 : 80,
      trialEnd: status === "trialing" ? new Date(now + (1 + (i % 5)) * day) : null, startedAt: started,
      canceledAt: status === "canceled" ? ago(5) : null,
    });
    const people = isImo ? 3 + (i % 4) : 1;
    for (let p = 0; p < people; p++) {
      const pid = id("per");
      await db.insert(schema.persons).values({
        id: pid, organizationId: orgId, softwareId: sw, name: `${pick(firstNames)} (exemplo)`, origin: status === "trialing" ? "trial" : i % 5 === 0 ? "beta" : "pagante",
        signedUpAt: started, activatedAt: i % 6 === 0 ? null : new Date(started.getTime() + 2 * day),
        attribution: i % 8 === 0 ? {} : { utm_source: "facebook", utm_campaign: pick(isImo ? campaignsImo : campaignsClara), last_campaign: pick(isImo ? campaignsImo : campaignsClara) },
      });
      // Eventos de uso nos últimos 30 dias
      if (status !== "canceled") {
        const evs = [];
        for (let d = 0; d < 30; d++) {
          if (rnd() < (i % 11 === 0 ? 0.1 : 0.6)) {
            const at = new Date(now - d * day - Math.floor(rnd() * 8) * 36e5);
            for (let h = 0; h < 3 + Math.floor(rnd() * 15); h++) evs.push({ id: id("evt"), softwareId: sw, name: "session.heartbeat", occurredAt: new Date(at.getTime() + h * 60000), personId: pid, organizationId: orgId });
            const feats = isImo ? ["lead.assigned", "team_report.viewed", "pipeline.viewed", "lead.replied_by_agent"] : ["lead.replied_by_agent", "voice.command", "call.completed", "contact.created", "report.weekly_viewed"];
            for (let k = 0; k < 1 + Math.floor(rnd() * 4); k++) {
              const f = pick(feats);
              evs.push({ id: id("evt"), softwareId: sw, name: "feature.used", feature: f, occurredAt: at, personId: pid, organizationId: orgId });
            }
          }
        }
        for (let c = 0; c < evs.length; c += 500) await db.insert(schema.productEvents).values(evs.slice(c, c + 500));
      }
    }
    // Faturas pagas e MRR mensal desde o início
    if (status !== "trialing") {
      const months = Math.max(1, Math.round((now - started.getTime()) / (30 * day)));
      for (let mth = 0; mth < months; mth++) {
        const issued = new Date(started.getTime() + mth * 30 * day);
        if (issued.getTime() > now) break;
        const failed = status === "past_due" && mth === months - 1;
        await db.insert(schema.invoices).values({ id: id("in"), organizationId: orgId, softwareId: sw, amountCents: Math.round(mrr * 1.23), vatCents: Math.round(mrr * 0.23), status: failed ? "failed" : "paid", issuedAt: issued });
        const mk = monthKey(issued);
        const cents = status === "canceled" && mth === months - 1 ? 0 : mrr;
        await db.insert(schema.mrrMonthly).values({ organizationId: orgId, softwareId: sw, month: mk, mrrCents: cents })
          .onConflictDoUpdate({ target: [schema.mrrMonthly.organizationId, schema.mrrMonthly.softwareId, schema.mrrMonthly.month], set: { mrrCents: cents } });
      }
    }
    // Consumo do mês (chamadas, IA, WhatsApp)
    if (status === "active" || status === "past_due") {
      const minutes = (isImo ? 1300 : 120) * (0.6 + rnd());
      const usage = [
        { unit: "call.forward.minute", quantity: minutes, cost: minutes * 0.04, provider: "twilio" },
        { unit: "stt.call.minute", quantity: minutes, cost: minutes * 0.0043, provider: "deepgram" },
        { unit: "lead.conversation", quantity: Math.round((isImo ? 450 : 70) * (0.6 + rnd())), cost: 0, provider: "n5" },
        { unit: "llm.tokens_in", quantity: (isImo ? 15e6 : 2e6) * (0.6 + rnd()), cost: (isImo ? 3.3 : 0.44), provider: "bedrock" },
        { unit: "wa.message.marketing", quantity: isImo ? 250 : 30, cost: (isImo ? 250 : 30) * 0.049 / 0.87, provider: "meta_whatsapp" },
      ];
      for (const u of usage) {
        await db.insert(schema.usageRecords).values({ id: id("use"), softwareId: sw, organizationId: orgId, unit: u.unit, quantity: u.quantity.toFixed(4),
          costUsd: u.cost.toFixed(6), provider: u.provider, occurredAt: ago(Math.floor(rnd() * 10)) });
      }
    }
  }

  // ---- Feedback
  const fb: { sw: string; type: "sugestao" | "bug" | "funciona_bem" | "funciona_mal"; title: string; feature: string; severity?: "critico" | "alto" | "medio"; status?: "recebido" | "em_analise" | "planeado" | "lancado" | "recusado"; daysAgo: number; votes: number }[] = [
    { sw: "sw_clara", type: "sugestao", title: "Poder marcar visitas por voz diretamente no calendário", feature: "voice.command", status: "planeado", daysAgo: 12, votes: 9 },
    { sw: "sw_clara", type: "bug", title: "O resumo da chamada não aparece na ficha da lead", feature: "call.completed", severity: "alto", status: "em_analise", daysAgo: 4, votes: 4 },
    { sw: "sw_clara", type: "funciona_bem", title: "O agente respondeu a uma lead às 23h e marcou visita", feature: "lead.replied_by_agent", status: "recebido", daysAgo: 2, votes: 6 },
    { sw: "sw_clara", type: "funciona_mal", title: "A transcrição troca nomes de ruas", feature: "call.completed", status: "recebido", daysAgo: 6, votes: 3 },
    { sw: "sw_clara", type: "sugestao", title: "Relatório semanal também por WhatsApp", feature: "report.weekly_viewed", status: "recebido", daysAgo: 5, votes: 2 },
    { sw: "sw_clara", type: "bug", title: "Agente deixou de responder depois de mudar o número", feature: "whatsapp.number_connected", severity: "critico", status: "recebido", daysAgo: 1, votes: 1 },
    { sw: "sw_imobiliario", type: "sugestao", title: "Distribuir leads por zona do consultor", feature: "lead.assigned", status: "planeado", daysAgo: 9, votes: 5 },
    { sw: "sw_imobiliario", type: "sugestao", title: "Exportar relatório da equipa em PDF", feature: "team_report.viewed", status: "recusado", daysAgo: 20, votes: 1 },
  ];
  for (const f of fb) {
    const created = ago(f.daysAgo);
    await db.insert(schema.feedback).values({
      id: id("fb"), softwareId: f.sw, type: f.type, title: f.title, text: `${f.title}. (exemplo)`, feature: f.feature, severity: f.type === "bug" ? f.severity ?? "medio" : null,
      votes: f.votes, status: f.status ?? "recebido", authorName: `${pick(firstNames)} (exemplo)`, origin: pick(["pagante", "beta", "trial"] as const),
      refusalReason: f.status === "recusado" ? "Os relatórios já se partilham por link; um PDF não acrescenta valor agora." : null,
      firstResponseAt: f.status && f.status !== "recebido" ? new Date(created.getTime() + 5 * 36e5) : null, createdAt: created, updatedAt: created,
    });
  }

  // ---- Roadmap, PRs, deploys, versões
  const items = [
    { sw: "sw_clara", code: "CLA-1", title: "Marcar visitas por voz", phase: "desenvolvimento" as const, impact: 3, reach: 120, confidence: 80, effort: 5, agent: false, sprint: "S44", version: "0.9.0" },
    { sw: "sw_clara", code: "CLA-2", title: "Resumo da chamada na ficha da lead", phase: "testes" as const, impact: 2, reach: 150, confidence: 90, effort: 2, agent: true, sprint: "S44", version: "0.9.0" },
    { sw: "sw_clara", code: "CLA-3", title: "Vocabulário de moradas para a transcrição", phase: "ideia" as const, impact: 2, reach: 80, confidence: 50, effort: 3, agent: false, sprint: null, version: null },
    { sw: "sw_clara", code: "CLA-4", title: "Relatório semanal por WhatsApp", phase: "descoberta" as const, impact: 1, reach: 60, confidence: 60, effort: 3, agent: true, sprint: null, version: null },
    { sw: "sw_imobiliario", code: "IMO-1", title: "Distribuição de leads por zona", phase: "design" as const, impact: 3, reach: 15, confidence: 70, effort: 8, agent: false, sprint: null, version: null },
  ];
  for (const it of items) {
    const [row] = await db.insert(schema.roadmapItems).values({
      code: it.code, softwareId: it.sw, title: it.title, phase: it.phase, impact: it.impact, reach: it.reach, confidence: it.confidence, effort: it.effort,
      agent: it.agent, sprint: it.sprint, version: it.version, ownerUserId: ["desenvolvimento", "testes"].includes(it.phase) ? socio.id : null,
      acceptanceCriteria: ["desenvolvimento", "testes"].includes(it.phase) ? "- Funciona em telemóvel\n- Regista o evento de produto" : null,
      productEvents: it.phase === "testes" ? ["call.completed", "call.analysis_viewed"] : [], origin: "comunidade",
    }).returning();
    if (it.code === "CLA-1") await sql`update feedback set roadmap_item_id = ${row.id} where title like 'Poder marcar visitas%'`;
    if (it.code === "IMO-1") await sql`update feedback set roadmap_item_id = ${row.id} where title like 'Distribuir leads%'`;
    if (it.code === "CLA-2") {
      await db.insert(schema.pullRequests).values({ id: "4ImprovementsPortugal/n5-clara#41", roadmapItemId: row.id, softwareId: "sw_clara", repo: "4ImprovementsPortugal/n5-clara", number: 41,
        title: "CLA-2 resumo da chamada na ficha", author: "n5-agent[bot]", isAgent: true, state: "merged", createdAt: ago(3), reviewedAt: ago(2.5), mergedAt: ago(2) });
    }
  }
  await db.insert(schema.pullRequests).values({ id: "4ImprovementsPortugal/n5-clara#44", softwareId: "sw_clara", repo: "4ImprovementsPortugal/n5-clara", number: 44,
    title: "CLA-4 rascunho do relatório por WhatsApp", author: "n5-agent[bot]", isAgent: true, state: "open", createdAt: ago(4) });
  for (let d = 0; d < 20; d++) {
    await db.insert(schema.deployments).values({ id: `dep_ex${d}`, softwareId: "sw_clara", repo: "4ImprovementsPortugal/n5-clara", environment: d % 3 === 0 ? "staging" : "production",
      status: d === 7 ? "failure" : "success", sha: Math.floor(rnd() * 1e9).toString(16).padStart(7, "0"), createdAt: ago(d * 1.4) });
  }
  await db.insert(schema.releases).values([
    { softwareId: "sw_clara", version: "0.8.0", notes: "• Agente responde a leads fora de horas\n• Ficha da lead com histórico do WhatsApp", publishedAt: ago(14), slackPostedAt: ago(14) },
    { softwareId: "sw_clara", version: "0.9.0", notes: "• Marcar visitas por voz\n• Resumo da chamada na ficha da lead" },
  ]);

  // ---- Custos por fornecedor (3 meses)
  const mk = (back: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back); return monthKey(d); };
  for (const [sw, base] of [["sw_clara", 1] as const, ["sw_imobiliario", 0.4] as const]) {
    for (const back of [2, 1, 0]) {
      for (const [prov, v] of [["aws", 32000], ["twilio", 41000], ["deepgram", 4400], ["bedrock", 2800], ["meta_whatsapp", 9000]] as const) {
        await db.insert(schema.providerCosts).values({ softwareId: sw, month: mk(back), provider: prov, costCents: Math.round(v * base * (1 + (2 - back) * 0.12)) });
      }
    }
  }

  // ---- Campanhas (28 dias)
  const camps = [
    { sw: "sw_clara", id: "csv:clara_trial_consultores_2026-09", name: "clara_trial_consultores_2026-09", spend: 2800, cpl: 900 },
    { sw: "sw_clara", id: "csv:clara_trial_lookalike_2026-10", name: "clara_trial_lookalike_2026-10", spend: 2000, cpl: 1400 },
    { sw: "sw_imobiliario", id: "csv:imo_demo_brokers_2026-10", name: "imo_demo_brokers_2026-10", spend: 3500, cpl: 3200 },
  ];
  for (const c of camps) {
    for (let d = 0; d < 28; d++) {
      const spend = Math.round(c.spend * (0.7 + rnd() * 0.6));
      const impressions = Math.round(spend * (1.8 + rnd()));
      await db.insert(schema.campaignDaily).values({
        softwareId: c.sw, campaignId: c.id, campaignName: c.name, adsetName: "Conjunto A", adName: "Vídeo 1", date: ago(d).toISOString().slice(0, 10),
        spendCents: spend, impressions, clicks: Math.round(impressions * (0.009 + rnd() * 0.01)), leads: Math.round(spend / c.cpl),
        frequency: (1.2 + d / 14 + rnd() * 0.3).toFixed(2),
      });
    }
  }

  // ---- Alguns alertas de exemplo
  await db.insert(schema.alerts).values([
    { module: "comunidades", softwareId: "sw_clara", severity: "critico", title: "Bug crítico: Agente deixou de responder depois de mudar o número", dedupeKey: "ex-1" },
    { module: "receita", softwareId: "sw_clara", severity: "critico", title: "Pagamento falhado: conta de exemplo", dedupeKey: "ex-2" },
    { module: "campanhas", softwareId: "sw_imobiliario", severity: "aviso", title: "Custo por registo alto: N5 Imobiliário", detail: "Acima de 40,00 € nos últimos dois dias", dedupeKey: "ex-3" },
  ]);

  console.log("Dados de exemplo criados. Entra com socio@exemplo.n5 / exemplo-n5-2026! (ou colaborador@exemplo.n5).");
  await sql.end();
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
