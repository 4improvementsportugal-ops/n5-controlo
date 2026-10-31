import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { SCOPES } from "@/lib/apikeys";
import { fmtDate, LABELS } from "@/lib/format";
import { PageHeader, Pill, Tabs } from "@/components/ui";
import { ApiKeyForm, ExampleDataForm, SoftwareForm, UserForm } from "./forms";
import { countExampleData } from "@/lib/exampleDataDb";
import { revokeApiKey, toggleUser } from "./actions";

export default async function Definicoes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser("definicoes");
  const sp = await searchParams;
  const vista = typeof sp.vista === "string" ? sp.vista : "softwares";
  const sws = await db.select().from(schema.softwares).orderBy(schema.softwares.createdAt);
  const tabs = [{ key: "softwares", label: "Softwares" }, { key: "utilizadores", label: "Utilizadores" }, { key: "chaves", label: "Chaves de API" }, { key: "ligacoes", label: "Ligações" }, { key: "exemplo", label: "Dados de exemplo" }]
    .map((t) => ({ ...t, href: `/definicoes?vista=${t.key}` }));
  return (
    <>
      <PageHeader title="Definições" />
      <Tabs items={tabs} active={vista} />
      {vista === "softwares" ? (
        <div className="space-y-4">
          {sws.map((s) => <details key={s.id} className="card"><summary className="cursor-pointer font-semibold">{s.name} <span className="num text-muted text-xs">{s.id}</span></summary><div className="mt-3"><SoftwareForm sw={s} /></div></details>)}
          <section className="card"><h2 className="h2">Novo software</h2><SoftwareForm /></section>
        </div>
      ) : null}
      {vista === "utilizadores" ? <Users softwares={sws} /> : null}
      {vista === "chaves" ? <Keys softwares={sws} /> : null}
      {vista === "ligacoes" ? <Connections /> : null}
      {vista === "exemplo" ? <ExampleData /> : null}
    </>
  );
}

async function Users({ softwares }: { softwares: { id: string; name: string }[] }) {
  const users = await db.select().from(schema.users).orderBy(schema.users.name);
  const links = await db.select().from(schema.userSoftwares);
  return (
    <div className="grid lg:grid-cols-[1fr_420px] gap-4">
      <section className="card overflow-x-auto">
        <table className="tbl"><thead><tr><th>Nome</th><th>E-mail</th><th>Função</th><th>Softwares</th><th>Estado</th><th /></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{LABELS.role[u.role]}</td>
              <td>{u.role === "colaborador" ? links.filter((l) => l.userId === u.id).map((l) => softwares.find((s) => s.id === l.softwareId)?.name).join(", ") || "nenhum" : "todos"}</td>
              <td>{u.active ? <Pill tone="verde">ativo</Pill> : <Pill>desativado</Pill>}</td>
              <td><form action={toggleUser}><input type="hidden" name="id" value={u.id} /><button className="text-sm underline">{u.active ? "Desativar" : "Ativar"}</button></form></td></tr>))}</tbody></table>
      </section>
      <section className="card h-fit"><h2 className="h2">Criar ou atualizar utilizador</h2><UserForm softwares={softwares} /></section>
    </div>
  );
}

async function Keys({ softwares }: { softwares: { id: string; name: string }[] }) {
  const keys = await db.select().from(schema.apiKeys).orderBy(desc(schema.apiKeys.createdAt));
  return (
    <div className="space-y-4">
      <section className="card overflow-x-auto">
        <table className="tbl"><thead><tr><th>Nome</th><th>Prefixo</th><th>Permissões</th><th>Software</th><th>Expira</th><th>Último uso</th><th /></tr></thead>
          <tbody>{keys.map((k) => (
            <tr key={k.id}><td>{k.name}</td><td className="num">{k.prefix}</td><td className="num text-xs">{k.scopes.join(", ")}</td>
              <td>{k.softwareId ? softwares.find((s) => s.id === k.softwareId)?.name : "todos"}</td><td>{fmtDate(k.expiresAt)}</td><td>{fmtDate(k.lastUsedAt)}</td>
              <td>{k.revokedAt ? <Pill>revogada</Pill> : <form action={revokeApiKey}><input type="hidden" name="id" value={k.id} /><button className="text-sm underline text-bad">Revogar</button></form>}</td></tr>))}</tbody></table>
      </section>
      <section className="card"><h2 className="h2">Nova chave</h2><ApiKeyForm softwares={softwares} scopes={SCOPES} /></section>
    </div>
  );
}

async function Connections() {
  const inbox = await db.select().from(schema.webhookInbox).orderBy(desc(schema.webhookInbox.receivedAt)).limit(200);
  const last = (src: string) => inbox.find((i) => i.source === src);
  const items = [
    { name: "Stripe", env: "STRIPE_WEBHOOK_SECRET", src: "stripe", path: "/api/webhooks/stripe" },
    { name: "GitHub", env: "GITHUB_WEBHOOK_SECRET", src: "github", path: "/api/webhooks/github" },
    { name: "Slack", env: "SLACK_SIGNING_SECRET", src: "slack", path: "/api/webhooks/slack" },
    { name: "Meta Insights", env: "META_ACCESS_TOKEN", src: null, path: "/api/cron/meta-sync (a cada 6 h)" },
    { name: "Tarefas agendadas", env: "CRON_SECRET", src: null, path: "/api/cron/alerts, /api/cron/mrr" },
  ];
  return (
    <section className="card overflow-x-auto">
      <table className="tbl"><thead><tr><th>Ligação</th><th>Configuração</th><th>Endereço</th><th>Último pedido</th><th>Estado</th></tr></thead>
        <tbody>{items.map((i) => {
          const configured = !!process.env[i.env];
          const l = i.src ? last(i.src) : undefined;
          return (
            <tr key={i.name}><td className="font-medium">{i.name}</td><td className="num text-xs">{i.env}</td><td className="num text-xs">{i.path}</td>
              <td>{l ? fmtDate(l.receivedAt) : "–"}</td>
              <td>{!configured ? <Pill tone="aviso">por configurar</Pill> : l?.error ? <Pill tone="critico">com erro</Pill> : <Pill tone="verde">ligada</Pill>}</td></tr>
          );
        })}</tbody></table>
      <p className="text-xs text-muted mt-3">Os segredos ficam nas variáveis de ambiente do servidor (AWS Secrets Manager), nunca na base de dados.</p>
    </section>
  );
}

async function ExampleData() {
  const counts = await countExampleData();
  const total = counts.reduce((s, c) => s + c.rows, 0);
  return (
    <div className="grid lg:grid-cols-[1fr_420px] gap-4">
      <section className="card overflow-x-auto">
        <h2 className="h2">O que é de exemplo</h2>
        <p className="text-sm text-muted mb-3">Dados inventados pelo seed da demonstração: contas, pessoas, subscrições, faturas, eventos, feedback, roadmap, deploys, custos, campanhas, chat, alertas e os dois logins de exemplo. Os softwares, os pressupostos do Impacto e tudo o que entrou pelas ligações reais ficam.</p>
        <table className="tbl"><thead><tr><th>Onde</th><th className="text-right">Registos</th></tr></thead>
          <tbody>{counts.map((c) => <tr key={c.table}><td>{c.label}</td><td className="num text-right">{c.rows.toLocaleString("pt-PT")}</td></tr>)}
            <tr><td className="font-semibold">Total</td><td className="num text-right font-semibold">{total.toLocaleString("pt-PT")}</td></tr></tbody></table>
      </section>
      <section className="card h-fit">
        <h2 className="h2">Apagar dados de exemplo</h2>
        <p className="text-sm text-muted mb-3">Apaga de uma vez tudo o que está na tabela ao lado e fica registado na auditoria. Não se desfaz. Só sócios.</p>
        <ExampleDataForm total={total} />
      </section>
    </div>
  );
}
