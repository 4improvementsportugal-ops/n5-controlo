import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { archiveSummaries, canUseChannel, channelsFor, GENERAL, lastSummary, listMessages, pipelineFor, teamList, unreadCounts } from "@/lib/chat";
import { ARCHIVE_AFTER_DAYS } from "@/lib/chat-rules";
import { llmConfigured } from "@/lib/llm";
import { fmtDateTime } from "@/lib/format";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { ChatClient, SummaryButtons } from "./ChatClient";

type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const FILTERS = [
  { key: "todas", label: "Todas" }, { key: "decisoes", label: "Decisões" }, { key: "pendentes", label: "Pendentes" },
  { key: "fixadas", label: "Fixadas" }, { key: "mencoes", label: "Menções a mim" },
];
const monthName = (d: Date) => new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);

export default async function Chat({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("chat");
  const sp = await searchParams;
  const channels = await channelsFor(user);
  const wanted = str(sp.canal) ?? GENERAL;
  const channel = channels.find((c) => c.id === wanted && canUseChannel(user, c.id)) ?? channels[0];
  const filter = str(sp.filtro) ?? "todas";
  const q = str(sp.q)?.trim().slice(0, 100) || undefined;
  const month = str(sp.mes);
  const allowed = channels.filter((c) => c.id !== GENERAL).map((c) => c.id);

  const [messages, unread, archive, summary, team, items] = await Promise.all([
    listMessages(channel.id, { q, month, filter, userId: user.sub }),
    unreadCounts(user.sub, channels.map((c) => c.id)),
    archiveSummaries(channel.id),
    lastSummary(channel.id),
    teamList(),
    pipelineFor(channel.id, allowed),
  ]);
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ canal: channel.id, ...extra })) if (v) p.set(k, v);
    return `/chat?${p}`;
  };
  const pinned = messages.filter((m) => m.pinned && !m.deletedAt);
  const openPending = messages.filter((m) => m.kind === "pendente" && !m.resolvedAt && !m.deletedAt).length;
  const browsing = q ? `Resultados da pesquisa "${q}" em todo o histórico` : month ? `Mensagens originais de ${monthName(new Date(`${month}-01T00:00:00Z`))} (arquivo)` : null;

  return (
    <>
      <PageHeader title="Chat" lead={`Conversa de trabalho por projeto. Todo o histórico fica guardado; o que tem mais de ${ARCHIVE_AFTER_DAYS} dias é resumido automaticamente por mês, e as mensagens originais continuam a um clique.`} />
      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)_300px]">
        <nav aria-label="Canais" className="card p-2 h-fit">
          <div className="text-xs font-semibold text-muted px-2 py-1">Canais</div>
          <ul>
            {channels.map((c) => {
              const u = unread.get(c.id);
              return (
                <li key={c.id}>
                  <Link href={`/chat?canal=${c.id}`} className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${c.id === channel.id ? "bg-accent-soft text-accent font-semibold" : "hover:bg-canvas"}`} aria-current={c.id === channel.id ? "page" : undefined}>
                    <span># {c.name}</span>
                    {u?.mentions ? <span className="pill text-white bg-bad border-bad">@{u.mentions}</span> : u?.unread && c.id !== channel.id ? <span className="pill text-accent border-accent/40 bg-accent-soft">{u.unread}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted px-2 mt-2">Cada software tem o seu canal; o Geral é para assuntos de todos.</p>
        </nav>

        <section className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <nav className="flex flex-wrap gap-1" aria-label="Filtros">
              {FILTERS.map((f) => (
                <Link key={f.key} href={href({ filtro: f.key === "todas" ? undefined : f.key })} className={`tab ${f.key === filter && !q && !month ? "tab-active" : ""}`}>
                  {f.label}{f.key === "pendentes" && openPending && filter !== "pendentes" ? ` (${openPending})` : ""}
                </Link>
              ))}
            </nav>
            <form action="/chat" className="ml-auto flex gap-1" role="search">
              <input type="hidden" name="canal" value={channel.id} />
              <input name="q" defaultValue={q} placeholder="Pesquisar em todo o histórico" className="input w-56" aria-label="Pesquisar mensagens" />
              <button className="btn">Pesquisar</button>
            </form>
          </div>
          {browsing ? (
            <div className="card mb-3 flex items-center justify-between text-sm bg-accent-soft border-accent/30">
              <span>{browsing} · {messages.length} mensagem(ns)</span>
              <Link href={href({})} className="btn">Voltar à conversa</Link>
            </div>
          ) : null}

          {!browsing && archive.length && filter === "todas" ? (
            <details className="card mb-3">
              <summary className="cursor-pointer text-sm font-semibold">Arquivo resumido · {archive.length} {archive.length === 1 ? "mês" : "meses"} com mais de {ARCHIVE_AFTER_DAYS} dias</summary>
              <ul className="mt-3 space-y-3">
                {archive.map((a) => {
                  const m = a.periodStart.toISOString().slice(0, 7);
                  return (
                    <li key={a.id} className="border-t border-line pt-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="capitalize">{monthName(a.periodStart)}</span>
                        <span className="text-muted text-xs">{a.messages} mensagens · resumo por {a.engine === "regras" ? "regras" : "IA"}</span>
                        <Link href={href({ mes: m })} className="text-accent text-xs hover:underline ml-auto">Ver mensagens originais</Link>
                      </div>
                      <div className="text-sm whitespace-pre-wrap mt-1">{a.content}</div>
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null}

          <ChatClient
            key={`${channel.id}:${filter}:${q ?? ""}:${month ?? ""}`}
            channel={channel.id}
            channelName={channel.name}
            me={user.sub}
            canModerate={user.role !== "colaborador"}
            live={!browsing}
            team={team.map((t) => ({ id: t.id, name: t.name }))}
            items={items.map((i) => ({ id: i.id, code: i.code, title: i.title, phase: i.phase }))}
            messages={messages.map((m) => ({
              id: m.id, userId: m.userId, userName: m.userName, body: m.body, kind: m.kind, parentId: m.parentId, pinned: m.pinned,
              resolved: !!m.resolvedAt, edited: !!m.editedAt, deleted: !!m.deletedAt, mentions: m.mentions, createdAt: m.createdAt.toISOString(),
            }))}
            emptyText={browsing ? "Nada encontrado." : filter !== "todas" ? "Nenhuma mensagem com este filtro." : "Ainda não há mensagens neste canal. Começa a conversa."}
          />
        </section>

        <aside className="space-y-4">
          <section className="card">
            <h2 className="h2">Pôr-me a par</h2>
            <p className="text-xs text-muted mb-3">Resume a conversa e cruza-a com o pipeline, o roadmap e o backlog {channel.id === GENERAL ? "de todos os softwares" : `do ${channel.name}`}.</p>
            <SummaryButtons channel={channel.id} />
            {!llmConfigured() ? <p className="text-xs text-muted mt-2">Sem modelo de IA ligado: o resumo é feito por regras (temas, decisões e pendentes). Liga o Bedrock em LLM_PROVIDER para um texto corrido.</p> : null}
          </section>
          {summary ? (
            <section className="card" aria-live="polite">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="h2 mb-0">{summary.kind === "pendentes" ? "Pendentes" : "O que se falou"}</h2>
                <Pill tone={summary.engine === "regras" ? "neutro" : "accent"}>{summary.engine === "regras" ? "regras" : "IA"}</Pill>
              </div>
              <div className="text-xs text-muted mb-2">Pedido a {fmtDateTime(summary.createdAt)} · {summary.messages} mensagens analisadas</div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{summary.content}</div>
            </section>
          ) : (
            <Empty title="Sem resumos ainda">Carrega num dos botões acima.</Empty>
          )}
          {pinned.length ? (
            <section className="card">
              <h2 className="h2">Fixadas</h2>
              <ul className="space-y-2 text-sm">
                {pinned.map((p) => <li key={p.id}><a href={`#${p.id}`} className="hover:underline">{p.body.slice(0, 120)}</a> <span className="text-xs text-muted">— {p.userName}</span></li>)}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}
