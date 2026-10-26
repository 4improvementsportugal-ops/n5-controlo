# Alojamento na Netlify

A Netlify corre a app Next.js com o adaptador oficial (instalado automaticamente) e as tarefas agendadas como *scheduled functions* (`netlify/functions/cron-*.mts`). A base de dados é um Postgres externo na UE.

## Base de dados

Recomendado: um projeto Supabase em Frankfurt (`eu-central-1`) ou Irlanda (`eu-west-1`).

- Em `DATABASE_URL` usa a ligação **Session pooler** do Supabase (botão Connect, porta 5432). Funciona em IPv4, que a Netlify precisa, e aceita as migrações. A app deteta o pooler e abre poucas ligações.
- Projeto criado: **N5 Controlo** (`peyjcrrfgtsgjickznjx`), Frankfurt.
- As migrações correm em cada build (`npm run db:migrate`), por isso a base de dados tem de aceitar ligações da Netlify.
- Alternativa: Netlify Database (só em planos por créditos). A app lê `NETLIFY_DB_URL` se `DATABASE_URL` não existir.

## Passos

1. Netlify › Add new project › Import an existing project › GitHub › `4improvementsportugal-ops/n5-controlo`, branch `main`. O `netlify.toml` já define o build.
2. Antes do primeiro deploy, em Site configuration › Environment variables:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | Ligação Session pooler do Supabase, com a palavra-passe da base de dados |
| `SESSION_SECRET` | String aleatória com 32+ caracteres |
| `CRON_SECRET` | String aleatória longa |
| `APP_URL` | Endereço do site, por exemplo `https://n5-controlo.netlify.app` |
| `DEMO_DATA` e `NEXT_PUBLIC_DEMO_DATA` | `true` enquanto for demonstração com dados de exemplo; apagar antes de usar dados reais |

As restantes (Stripe, GitHub, Slack, Meta, SES, Bedrock para os resumos do Chat) acrescentam-se quando cada ligação for configurada (`docs/integracoes.md`).

3. Deploy. O build aplica as migrações, cria os dados de exemplo se a base estiver vazia e `DEMO_DATA=true`, e compila a app.
4. Entrar com `socio@exemplo.n5` / `exemplo-n5-2026!` (só com dados de exemplo).

## Tarefas agendadas (UTC)

| Função | Horário | Chama |
| --- | --- | --- |
| `cron-alerts` | a cada 15 min | `/api/cron/alerts` |
| `cron-engagement` | de hora a hora | `/api/cron/engagement` |
| `cron-chat` | 03:23 | `/api/cron/chat` (resume por mês o chat com mais de 90 dias) |
| `cron-meta-sync` | a cada 6 h | `/api/cron/meta-sync` |
| `cron-mrr` | 02:00 | `/api/cron/mrr` |
