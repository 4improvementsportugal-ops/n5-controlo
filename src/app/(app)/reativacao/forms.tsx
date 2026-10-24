"use client";
import { useActionState } from "react";
import { saveRule, saveTemplate, sendManual } from "./actions";

type Opt = { id: string | number; name: string };
type Result = { error?: string; ok?: string } | undefined;

function Msg({ s }: { s: Result }) {
  if (s?.error) return <p role="alert" className="text-bad text-sm">{s.error}</p>;
  if (s?.ok) return <p role="status" className="text-good text-sm">{s.ok}</p>;
  return null;
}

const TYPES: [string, string][] = [["lembrete", "Lembrete"], ["dica", "Dica de funcionalidade"], ["novidade", "Novidade"], ["oferta", "Oferta"], ["feedback", "Pedido de feedback"], ["fim_trial", "Fim do trial"], ["reativacao", "Reativação"]];

export type TemplateRow = { id: number; name: string; softwareId: string | null; type: string; channel: string; subject: string; body: string; ctaLabel: string | null; ctaUrl: string | null };

export function TemplateForm({ softwares, t }: { softwares: Opt[]; t?: TemplateRow }) {
  const [s, action, pending] = useActionState(saveTemplate, undefined);
  const k = t ? `t${t.id}` : "tnew";
  return (
    <form action={action} className="space-y-3">
      {t ? <input type="hidden" name="id" value={t.id} /> : null}
      <div className="grid sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2"><label className="label" htmlFor={`${k}-n`}>Nome interno</label><input id={`${k}-n`} name="name" defaultValue={t?.name} className="input" required /></div>
        <div><label className="label" htmlFor={`${k}-c`}>Canal</label><select id={`${k}-c`} name="channel" defaultValue={t?.channel ?? "inapp"} className="input"><option value="inapp">Na app</option><option value="email">E-mail</option></select></div>
        <div><label className="label" htmlFor={`${k}-t`}>Tipo</label><select id={`${k}-t`} name="type" defaultValue={t?.type ?? "lembrete"} className="input">{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="sm:col-span-2"><label className="label" htmlFor={`${k}-sw`}>Software</label><select id={`${k}-sw`} name="softwareId" defaultValue={t?.softwareId ?? ""} className="input"><option value="">Todos</option>{softwares.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
      </div>
      <div><label className="label" htmlFor={`${k}-s`}>Assunto do e-mail ou título na app</label><input id={`${k}-s`} name="subject" defaultValue={t?.subject} className="input" required /></div>
      <div><label className="label" htmlFor={`${k}-b`}>Texto (variáveis: {"{{nome}}"}, {"{{dias}}"}, {"{{software}}"})</label><textarea id={`${k}-b`} name="body" rows={5} defaultValue={t?.body} className="input" required /></div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="label" htmlFor={`${k}-cl`}>Texto do botão</label><input id={`${k}-cl`} name="ctaLabel" defaultValue={t?.ctaLabel ?? ""} className="input" placeholder="Abrir o N5 Clara" /></div>
        <div><label className="label" htmlFor={`${k}-cu`}>Link do botão (https://)</label><input id={`${k}-cu`} name="ctaUrl" defaultValue={t?.ctaUrl ?? ""} className="input" /></div>
      </div>
      <Msg s={s} />
      <button className="btn btn-primary" disabled={pending}>{t ? "Guardar modelo" : "Criar modelo"}</button>
    </form>
  );
}

export type RuleRow = { id: number; name: string; softwareId: string | null; inactiveDays: number; audience: string; templateId: number; active: boolean };

export function RuleForm({ softwares, templates, r }: { softwares: Opt[]; templates: Opt[]; r?: RuleRow }) {
  const [s, action, pending] = useActionState(saveRule, undefined);
  const k = r ? `r${r.id}` : "rnew";
  return (
    <form action={action} className="space-y-3">
      {r ? <input type="hidden" name="id" value={r.id} /> : null}
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label className="label" htmlFor={`${k}-n`}>Nome</label><input id={`${k}-n`} name="name" defaultValue={r?.name} className="input" required /></div>
        <div><label className="label" htmlFor={`${k}-d`}>Dias sem usar</label><input id={`${k}-d`} name="inactiveDays" type="number" min={1} defaultValue={r?.inactiveDays ?? 7} className="input" required /></div>
        <div><label className="label" htmlFor={`${k}-a`}>Para quem</label><select id={`${k}-a`} name="audience" defaultValue={r?.audience ?? "todos"} className="input"><option value="todos">Todos</option><option value="pagante">Pagantes</option><option value="trial">Trials</option><option value="beta">Beta</option></select></div>
        <div><label className="label" htmlFor={`${k}-sw`}>Software</label><select id={`${k}-sw`} name="softwareId" defaultValue={r?.softwareId ?? ""} className="input"><option value="">Todos</option>{softwares.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        <div className="sm:col-span-2"><label className="label" htmlFor={`${k}-t`}>Comunicação a enviar</label><select id={`${k}-t`} name="templateId" defaultValue={r?.templateId ?? ""} className="input" required><option value="">Escolhe um modelo</option>{templates.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={r?.active ?? true} /> Regra ativa</label>
      <Msg s={s} />
      <button className="btn btn-primary" disabled={pending}>{r ? "Guardar regra" : "Criar regra"}</button>
    </form>
  );
}

export function ManualSend({ personId, templates }: { personId: string; templates: Opt[] }) {
  const [s, action, pending] = useActionState(sendManual, undefined);
  return (
    <form action={action} className="flex flex-wrap gap-2 items-center">
      <input type="hidden" name="personId" value={personId} />
      <select name="templateId" className="input w-56" aria-label="Modelo a enviar" required><option value="">Enviar comunicação…</option>{templates.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      <button className="btn" disabled={pending}>Enviar</button>
      <Msg s={s} />
    </form>
  );
}
