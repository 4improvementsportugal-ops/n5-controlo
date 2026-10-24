import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyGithub } from "@/lib/signatures";
import { raiseAlert } from "@/lib/alerts";
import { phaseGuard, syncFeedbackWithItem } from "@/lib/core";
import { audit } from "@/lib/audit";

// Webhooks da GitHub App (só leitura): pull_request, pull_request_review, deployment_status, release.
// Um PR liga-se ao item do roadmap quando o código (ex.: CLA-12) aparece no título ou no nome do branch.

const CODE_RE = /\b([A-Z]{2,5}-\d+)\b/;

async function softwareForRepo(repo: string): Promise<string | null> {
  const [sw] = await db.select().from(schema.softwares).where(sql`${repo} = any(${schema.softwares.githubRepos})`);
  return sw?.id ?? null;
}

async function itemForCode(text: string) {
  const code = text.match(CODE_RE)?.[1];
  if (!code) return null;
  const [item] = await db.select().from(schema.roadmapItems).where(eq(schema.roadmapItems.code, code));
  return item ?? null;
}

async function movePhase(itemId: number, phase: typeof schema.roadmapItems.$inferSelect.phase, actor: string) {
  const [before] = await db.select().from(schema.roadmapItems).where(eq(schema.roadmapItems.id, itemId));
  if (!before || before.phase === phase) return;
  // As regras de fase valem também para mudanças automáticas: se faltar algo, avisa em vez de avançar
  const blocked = phaseGuard(before, phase);
  if (blocked) {
    await raiseAlert({ module: "pipeline", softwareId: before.softwareId, severity: "aviso",
      title: `${before.code} não avançou para ${phase}`, detail: blocked, dedupeKey: `fase-bloqueada:${before.id}:${phase}` });
    return;
  }
  await db.update(schema.roadmapItems).set({ phase, phaseChangedAt: new Date(), updatedAt: new Date() }).where(eq(schema.roadmapItems.id, itemId));
  await audit(actor, "roadmap.phase", "roadmap_item", itemId, { phase: before.phase }, { phase });
  await syncFeedbackWithItem(itemId, phase, actor);
}

async function handle(event: string, p: Record<string, any>) {
  const repo: string = p.repository?.full_name ?? "";
  const softwareId = await softwareForRepo(repo);

  if (event === "pull_request") {
    const pr = p.pull_request;
    const item = (await itemForCode(pr.title)) ?? (await itemForCode(pr.head?.ref ?? ""));
    const isAgent = String(pr.user?.type) === "Bot" || (pr.labels ?? []).some((l: { name: string }) => l.name.toLowerCase() === "agente");
    const state = pr.merged_at ? "merged" : pr.state;
    const id = `${repo}#${pr.number}`;
    const values = {
      roadmapItemId: item?.id ?? null, softwareId, repo, number: pr.number, title: pr.title, author: pr.user?.login ?? "?",
      isAgent, state, url: pr.html_url, mergedAt: pr.merged_at ? new Date(pr.merged_at) : null, createdAt: new Date(pr.created_at),
    };
    await db.insert(schema.pullRequests).values({ id, ...values }).onConflictDoUpdate({ target: schema.pullRequests.id, set: values });
    // Merge na branch principal passa o item a Testes
    if (item && pr.merged_at && pr.base?.ref === p.repository?.default_branch) await movePhase(item.id, "testes", `webhook:github`);
    return;
  }

  if (event === "pull_request_review") {
    await db.update(schema.pullRequests).set({ reviewedAt: new Date(p.review?.submitted_at ?? Date.now()) })
      .where(eq(schema.pullRequests.id, `${repo}#${p.pull_request.number}`));
    return;
  }

  if (event === "deployment_status") {
    const env = String(p.deployment?.environment ?? "").toLowerCase();
    const status = p.deployment_status?.state as string;
    const id = `${repo}:${p.deployment?.id}`;
    const values = { softwareId, repo, environment: env, status, sha: p.deployment?.sha ?? null, createdAt: new Date(p.deployment_status?.created_at ?? Date.now()) };
    await db.insert(schema.deployments).values({ id, ...values }).onConflictDoUpdate({ target: schema.deployments.id, set: values });
    if ((status === "failure" || status === "error") && env.startsWith("prod")) {
      await raiseAlert({ module: "pipeline", softwareId, severity: "critico", title: `Deploy falhado: ${repo}`,
        detail: `Commit ${String(p.deployment?.sha ?? "").slice(0, 7)} em ${env}`, dedupeKey: `deploy:${id}` });
    }
    if (status === "success") {
      // Itens em Testes/Staging com PR neste commit avançam de fase
      const prs = await db.select().from(schema.pullRequests).where(sql`${schema.pullRequests.repo} = ${repo} and ${schema.pullRequests.state} = 'merged' and ${schema.pullRequests.roadmapItemId} is not null`);
      const target = env.startsWith("prod") ? "producao" : env.startsWith("stag") ? "staging" : null;
      if (target) {
        for (const pr of prs) {
          const [item] = await db.select().from(schema.roadmapItems).where(eq(schema.roadmapItems.id, pr.roadmapItemId!));
          if (!item) continue;
          const order = ["testes", "staging"];
          if (order.includes(item.phase) && !(target === "staging" && item.phase === "staging")) {
            if (target === "producao" && item.productEvents.length === 0) continue; // regra 4: sem eventos não chega a Produção
            await movePhase(item.id, target, "webhook:github");
          }
        }
      }
    }
    return;
  }

  if (event === "release" && p.action === "published" && softwareId) {
    await db.insert(schema.releases).values({
      softwareId, version: p.release?.tag_name ?? "?", notes: p.release?.body ?? "", publishedAt: new Date(p.release?.published_at ?? Date.now()),
    }).onConflictDoNothing();
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  if (!verifyGithub(body, req.headers.get("x-hub-signature-256"), process.env.GITHUB_WEBHOOK_SECRET ?? "")) {
    return new Response("assinatura inválida", { status: 401 });
  }
  const event = req.headers.get("x-github-event") ?? "";
  const delivery = req.headers.get("x-github-delivery");
  const [inbox] = await db.insert(schema.webhookInbox).values({ source: "github", externalId: delivery, body })
    .onConflictDoNothing().returning({ id: schema.webhookInbox.id });
  if (!inbox) return Response.json({ received: true, duplicate: true });
  try {
    if (event !== "ping") await handle(event, JSON.parse(body));
    await db.update(schema.webhookInbox).set({ processedAt: new Date() }).where(eq(schema.webhookInbox.id, inbox.id));
  } catch (err) {
    await db.update(schema.webhookInbox).set({ error: String(err) }).where(eq(schema.webhookInbox.id, inbox.id));
    console.error("Webhook GitHub falhou:", err);
  }
  return Response.json({ received: true });
}
