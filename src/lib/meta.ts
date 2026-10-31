import "server-only";
import { eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";

// Leitura do Meta Insights ao nível do anúncio, por dia, para os últimos 28 dias
// (a Meta ainda corrige esses dados). Precisa de META_ACCESS_TOKEN com ads_read.

interface InsightRow {
  campaign_id: string; campaign_name: string; adset_id?: string; adset_name?: string; ad_id?: string; ad_name?: string; date_start: string;
  spend?: string; impressions?: string; clicks?: string; frequency?: string;
  actions?: { action_type: string; value: string }[];
}

const LEAD_ACTIONS = new Set(["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped", "complete_registration", "offsite_conversion.fb_pixel_complete_registration"]);
// Visitas à página e compras: a Meta repete o mesmo evento com nomes diferentes, por isso conta-se o primeiro que aparecer.
const firstAction = (actions: InsightRow["actions"], types: string[]) => {
  for (const t of types) {
    const a = (actions ?? []).find((x) => x.action_type === t);
    if (a) return Math.round(Number(a.value) || 0);
  }
  return 0;
};

export async function syncMetaInsights(days = 28): Promise<{ software: string; rows: number; error?: string }[]> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return [{ software: "-", rows: 0, error: "META_ACCESS_TOKEN não configurado" }];
  const version = process.env.META_API_VERSION ?? "v23.0";
  const sws = await db.select().from(schema.softwares).where(isNotNull(schema.softwares.metaAdAccountId));
  const out = [];
  const until = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  for (const sw of sws) {
    try {
      const account = sw.metaAdAccountId!.startsWith("act_") ? sw.metaAdAccountId! : `act_${sw.metaAdAccountId}`;
      const params = new URLSearchParams({
        level: "ad", time_increment: "1", limit: "500",
        fields: "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,frequency,actions",
        time_range: JSON.stringify({ since, until }), access_token: token,
      });
      let url: string | null = `https://graph.facebook.com/${version}/${account}/insights?${params}`;
      let rows = 0;
      while (url) {
        const res: Response = await fetch(url);
        const json = (await res.json()) as { data?: InsightRow[]; paging?: { next?: string }; error?: { message: string } };
        if (json.error) throw new Error(json.error.message);
        for (const r of json.data ?? []) {
          const leads = (r.actions ?? []).filter((a) => LEAD_ACTIONS.has(a.action_type)).reduce((s, a) => s + Number(a.value), 0);
          const values = {
            softwareId: sw.id, accountId: account, campaignId: r.campaign_id, campaignName: r.campaign_name,
            adsetName: r.adset_name ?? "", adName: r.ad_name ?? "", adsetId: r.adset_id ?? null, adId: r.ad_id ?? null, date: r.date_start,
            spendCents: Math.round(Number(r.spend ?? 0) * 100), impressions: Number(r.impressions ?? 0),
            clicks: Number(r.clicks ?? 0), leads, frequency: r.frequency ?? null,
            landingViews: firstAction(r.actions, ["landing_page_view"]),
            purchases: firstAction(r.actions, ["offsite_conversion.fb_pixel_purchase", "purchase"]),
          };
          await db.insert(schema.campaignDaily).values(values).onConflictDoUpdate({
            target: [schema.campaignDaily.campaignId, schema.campaignDaily.adsetName, schema.campaignDaily.adName, schema.campaignDaily.date],
            set: values,
          });
          rows++;
        }
        url = json.paging?.next ?? null;
      }
      out.push({ software: sw.id, rows });
    } catch (err) {
      out.push({ software: sw.id, rows: 0, error: String(err) });
    }
  }
  return out;
}

/** Importação de CSV exportado do Gestor de Anúncios (alternativa à API). */
export async function importCampaignCsv(softwareId: string, csv: string): Promise<{ rows: number; errors: string[] }> {
  const lines = csv.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { rows: 0, errors: ["O ficheiro não tem linhas de dados."] };
  const sep = lines[0].includes(";") ? ";" : ",";
  const split = (l: string) => {
    const out: string[] = []; let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === sep && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const idx = {
    date: col("dia", "day", "data", "date"), campaign: col("nome da campanha", "campaign name", "campanha"),
    adset: col("conjunto", "ad set"), ad: col("nome do anúncio", "ad name", "anúncio"),
    spend: col("valor gasto", "amount spent", "gasto", "spend"), impressions: col("impress"), clicks: col("cliques", "clicks"),
    leads: col("leads", "resultados", "results", "registos"), frequency: col("frequência", "frequency"),
  };
  const errors: string[] = [];
  if (idx.date < 0 || idx.campaign < 0 || idx.spend < 0) return { rows: 0, errors: ["Faltam colunas obrigatórias: Dia, Nome da campanha e Valor gasto."] };
  const num = (s: string | undefined) => Number((s ?? "0").replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
  let rows = 0;
  const [sw] = await db.select().from(schema.softwares).where(eq(schema.softwares.id, softwareId));
  for (const [i, l] of lines.slice(1).entries()) {
    const c = split(l);
    const date = c[idx.date];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) { errors.push(`Linha ${i + 2}: data inválida (${date}); usa AAAA-MM-DD.`); continue; }
    const campaignName = c[idx.campaign] ?? "";
    const values = {
      softwareId, accountId: sw?.metaAdAccountId ?? null, campaignId: `csv:${campaignName}`, campaignName,
      adsetName: idx.adset >= 0 ? c[idx.adset] ?? "" : "", adName: idx.ad >= 0 ? c[idx.ad] ?? "" : "", date,
      spendCents: Math.round(num(c[idx.spend]) * 100), impressions: Math.round(num(c[idx.impressions])),
      clicks: Math.round(num(c[idx.clicks])), leads: Math.round(num(c[idx.leads])),
      frequency: idx.frequency >= 0 ? String(num(c[idx.frequency])) : null,
    };
    await db.insert(schema.campaignDaily).values(values).onConflictDoUpdate({
      target: [schema.campaignDaily.campaignId, schema.campaignDaily.adsetName, schema.campaignDaily.adName, schema.campaignDaily.date],
      set: values,
    });
    rows++;
  }
  return { rows, errors };
}
