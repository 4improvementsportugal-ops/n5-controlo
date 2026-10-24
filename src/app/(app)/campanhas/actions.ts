"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { importCampaignCsv, syncMetaInsights } from "@/lib/meta";
import { audit } from "@/lib/audit";

export async function importCsv(_prev: { message?: string; error?: string } | undefined, form: FormData) {
  const user = await requireUser("campanhas");
  const file = form.get("file");
  const softwareId = String(form.get("softwareId"));
  if (!(file instanceof File) || file.size === 0) return { error: "Escolhe um ficheiro CSV." };
  if (file.size > 5_000_000) return { error: "O ficheiro tem mais de 5 MB. Exporta menos dias de cada vez." };
  const res = await importCampaignCsv(softwareId, await file.text());
  await audit(`user:${user.sub}`, "campaigns.csv_import", "campaign_daily", softwareId, null, { rows: res.rows, errors: res.errors.length });
  revalidatePath("/campanhas");
  if (res.rows === 0) return { error: res.errors.slice(0, 3).join(" ") || "Nenhuma linha importada." };
  return { message: `${res.rows} linhas importadas.${res.errors.length ? ` ${res.errors.length} linhas ignoradas: ${res.errors.slice(0, 2).join(" ")}` : ""}` };
}

export async function syncNow() {
  const user = await requireUser("campanhas");
  const r = await syncMetaInsights();
  await audit(`user:${user.sub}`, "campaigns.meta_sync", "campaign_daily", null, null, r);
  revalidatePath("/campanhas");
}
