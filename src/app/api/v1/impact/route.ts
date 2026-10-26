import { z } from "zod";
import { authenticate, errorResponse, ApiError } from "@/lib/apikeys";
import { resolveRange } from "@/lib/filters";
import { hoursPerMonth, loadImpact } from "@/lib/impact";

// GET /api/v1/impact?organization=org_...&software=sw_clara&period=30d
// Resumo do impacto de uma conta, para o software o mostrar ao utilizador ("este mês poupou 12 horas").
const query = z.object({
  organization: z.string().min(3),
  software: z.string().min(3),
  period: z.enum(["7d", "30d", "90d", "mes", "mes_anterior"]).default("30d"),
});

export async function GET(req: Request) {
  try {
    const caller = await authenticate(req, "impact:read");
    const p = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!p.success) throw new ApiError(400, "Indica organization e software (e opcionalmente period: 7d, 30d, 90d, mes, mes_anterior).", "bad_request");
    if (caller.softwareId && caller.softwareId !== p.data.software) throw new ApiError(403, "A chave não pode ler este software.", "forbidden_software");
    const range = resolveRange(p.data.period);
    const { accounts, bySoftware, months } = await loadImpact([p.data.software], range, p.data.organization);
    const a = accounts.find((x) => x.orgId === p.data.organization && x.softwareId === p.data.software);
    const tasks = bySoftware.get(p.data.software)?.tasks ?? [];
    return Response.json({
      data: {
        organization: p.data.organization, software: p.data.software, period: { key: range.key, from: range.from, to: range.to },
        hours_saved: a ? Math.round((a.minutesSaved / 60) * 10) / 10 : 0,
        hours_saved_per_month: a ? Math.round(hoursPerMonth(a.minutesSaved, months) * 10) / 10 : 0,
        time_value_eur: a ? a.timeValueCents / 100 : 0,
        leads: a?.leadsTotal ?? 0,
        after_hours_leads_answered_by_ai: a?.afterHoursByAi ?? 0,
        visits_scheduled_by_ai: a?.visitsByAi ?? 0,
        deals_first_answered_by_ai: a?.dealsFirstByAi ?? 0,
        commission_first_answered_by_ai_eur: a ? a.commissionFirstByAiCents / 100 : 0,
        return_on_time: a?.roiTime != null ? Math.round(a.roiTime * 100) / 100 : null,
        tasks: tasks.filter((t) => t.known).map((t) => ({ task: t.key, label: t.label, done: t.count, by_ai: t.ai + t.assisted, hours_saved: Math.round((t.minutesSaved / 60) * 10) / 10 })),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
