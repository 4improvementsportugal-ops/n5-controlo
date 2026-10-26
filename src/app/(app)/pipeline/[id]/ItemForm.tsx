"use client";
import { useActionState } from "react";

type Item = {
  id: number; title: string; description: string | null; impact: number; reach: number; confidence: number; effort: number;
  ownerUserId: string | null; agent: boolean; acceptanceCriteria: string | null; productEvents: string[]; sprint: string | null; version: string | null; phase: string; dueDate: string | null;
};

export function ItemForm({ item, team, phases, action }: {
  item: Item; team: { id: string; name: string }[]; phases: [string, string][];
  action: (prev: { error?: string; ok?: boolean } | undefined, form: FormData) => Promise<{ error?: string; ok?: boolean }>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="card space-y-3">
      <div><label className="label" htmlFor="t">Título</label><input id="t" name="title" defaultValue={item.title} className="input" /></div>
      <div className="grid sm:grid-cols-4 gap-3">
        <div><label className="label" htmlFor="ph">Fase</label><select id="ph" name="phase" defaultValue={item.phase} className="input">{phases.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label" htmlFor="ow">Dono</label><select id="ow" name="owner" defaultValue={item.ownerUserId ?? ""} className="input"><option value="">Sem dono</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><label className="label" htmlFor="due">Prazo para produção</label><input id="due" name="dueDate" type="date" defaultValue={item.dueDate ?? ""} className="input" /></div>
        <div className="flex items-end gap-2 pb-1.5"><input id="ag" name="agent" type="checkbox" defaultChecked={item.agent} className="size-4" /><label htmlFor="ag" className="text-sm">Pode ir para um agente de código</label></div>
      </div>
      <div><label className="label" htmlFor="d">Descrição</label><textarea id="d" name="description" rows={3} defaultValue={item.description ?? ""} className="input" /></div>
      <div><label className="label" htmlFor="ac">Critérios de aceitação (obrigatórios para Desenvolvimento)</label><textarea id="ac" name="acceptanceCriteria" rows={4} defaultValue={item.acceptanceCriteria ?? ""} className="input" /></div>
      <div><label className="label" htmlFor="ev">Eventos de produto que vai enviar (obrigatórios antes de Testes, separados por vírgula)</label><input id="ev" name="productEvents" defaultValue={item.productEvents.join(", ")} className="input" placeholder="feature.used, lead.replied_by_agent" /></div>
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div><label className="label" htmlFor="im">Impacto</label><input id="im" name="impact" type="number" min={1} max={3} defaultValue={item.impact} className="input" /></div>
        <div><label className="label" htmlFor="re">Alcance</label><input id="re" name="reach" type="number" defaultValue={item.reach} className="input" /></div>
        <div><label className="label" htmlFor="co">Confiança %</label><input id="co" name="confidence" type="number" defaultValue={item.confidence} className="input" /></div>
        <div><label className="label" htmlFor="ef">Esforço</label><input id="ef" name="effort" type="number" min={1} defaultValue={item.effort} className="input" /></div>
        <div><label className="label" htmlFor="sp">Sprint</label><input id="sp" name="sprint" defaultValue={item.sprint ?? ""} className="input" /></div>
        <div><label className="label" htmlFor="ve">Versão</label><input id="ve" name="version" defaultValue={item.version ?? ""} className="input" /></div>
      </div>
      {state?.error ? <p role="alert" className="text-bad text-sm">{state.error}</p> : null}
      {state?.ok ? <p role="status" className="text-good text-sm">Guardado.</p> : null}
      <button className="btn btn-primary" disabled={pending}>{pending ? "A guardar…" : "Guardar"}</button>
    </form>
  );
}
