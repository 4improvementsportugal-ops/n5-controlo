"use client";
import { useActionState } from "react";
import { saveSettings, saveTask } from "./actions";

type Result = { error?: string; ok?: string } | undefined;

function Msg({ s }: { s: Result }) {
  if (s?.error) return <p role="alert" className="text-bad text-sm">{s.error}</p>;
  if (s?.ok) return <p role="status" className="text-good text-sm">{s.ok}</p>;
  return null;
}

export function SettingsForm({ softwareId, hourValue, fastResponseMinutes, minSample }: { softwareId: string; hourValue: number; fastResponseMinutes: number; minSample: number }) {
  const [s, action, pending] = useActionState(saveSettings, undefined);
  const k = `set-${softwareId}`;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="softwareId" value={softwareId} />
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label className="label" htmlFor={`${k}-h`}>Valor de uma hora do utilizador (€)</label><input id={`${k}-h`} name="hourValue" type="number" step="0.5" min="1" defaultValue={hourValue} className="input" required /></div>
        <div><label className="label" htmlFor={`${k}-f`}>Resposta rápida até (min)</label><input id={`${k}-f`} name="fastResponseMinutes" type="number" step="1" min="1" defaultValue={fastResponseMinutes} className="input" required /></div>
        <div><label className="label" htmlFor={`${k}-m`}>Amostra mínima por grupo (leads)</label><input id={`${k}-m`} name="minSample" type="number" step="1" min="10" defaultValue={minSample} className="input" required /></div>
      </div>
      <Msg s={s} />
      <button className="btn btn-primary" disabled={pending}>Guardar pressupostos</button>
    </form>
  );
}

export type TaskFormRow = { id: number; softwareId: string; key: string; label: string; manualMinutes: string; remainingMinutes: string; basis: string | null; validated: boolean; active: boolean };

export function TaskForm({ softwareId, t }: { softwareId: string; t?: TaskFormRow }) {
  const [s, action, pending] = useActionState(saveTask, undefined);
  const k = t ? `task-${t.id}` : `task-new-${softwareId}`;
  return (
    <form action={action} className="space-y-3">
      {t ? <input type="hidden" name="id" value={t.id} /> : null}
      <input type="hidden" name="softwareId" value={softwareId} />
      <div className="grid sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2"><label className="label" htmlFor={`${k}-l`}>Tarefa</label><input id={`${k}-l`} name="label" defaultValue={t?.label} className="input" required /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor={`${k}-k`}>Código no evento (task)</label><input id={`${k}-k`} name="key" defaultValue={t?.key} className="input font-mono" required readOnly={!!t} /></div>
        <div><label className="label" htmlFor={`${k}-m`}>Minutos à mão, sem o software</label><input id={`${k}-m`} name="manualMinutes" type="number" step="0.1" min="0.1" defaultValue={t ? Number(t.manualMinutes) : undefined} className="input" required /></div>
        <div><label className="label" htmlFor={`${k}-r`}>Minutos que ficam para a pessoa</label><input id={`${k}-r`} name="remainingMinutes" type="number" step="0.1" min="0" defaultValue={t ? Number(t.remainingMinutes) : 0} className="input" required /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor={`${k}-b`}>Como se mediu o tempo</label><input id={`${k}-b`} name="basis" defaultValue={t?.basis ?? ""} className="input" placeholder="Ex.: cronometragem com 5 consultores, out 2026" /></div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="validated" defaultChecked={t?.validated} /> Tempo validado com utilizadores</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="active" value="on" defaultChecked={t?.active ?? true} onChange={(e) => { const h = e.currentTarget.form?.querySelector<HTMLInputElement>(`input[name=active][type=hidden]`); if (h) h.disabled = e.currentTarget.checked; }} /> Conta para o impacto</label>
        <input type="hidden" name="active" value="off" disabled={t?.active ?? true} />
      </div>
      <Msg s={s} />
      <button className="btn btn-primary" disabled={pending}>{t ? "Guardar tarefa" : "Acrescentar tarefa"}</button>
    </form>
  );
}
