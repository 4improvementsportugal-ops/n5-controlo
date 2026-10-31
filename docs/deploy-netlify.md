# Alojamento na Netlify

A Netlify corre a app Next.js com o adaptador oficial (instalado automaticamente) e as tarefas agendadas como *scheduled functions* (`netlify/functions/cron-*.mts`). A base de dados é um Postgres externo na UE.

## Base de dados

Recomendado: um projeto Supabase em Frankfurt (`eu-central-1`) ou Irlanda (`eu-west-1`).

- Em `DATABASE_URL` usa a ligação **via pooler** (Supavisor, porta 6543). A app deteta o pooler e desliga os *prepared statements*.
- As migrações correm no build de produção (`npm run db:migrate`), por isso a base de dados tem de aceitar ligações da Netlify.
- A produção é o sistema real: o build não corre o seed e a base não leva dados de exemplo.
- As pré-visualizações dos PR (`deploy-preview`) e os deploys de outros ramos (`branch-deploy`) só correm `npm run build`, sem migrações. Recebem a mesma `DATABASE_URL` da produção, e uma migração por rever não pode chegar à base de produção antes do merge. Uma pré-visualização com migrações novas compila, mas os ecrãs que dependem dessas migrações podem falhar até ao merge.
- Alternativa: Netlify Database (só em planos por créditos). A app lê `NETLIFY_DB_URL` se `DATABASE_URL` não existir.

## Passos

1. Netlify › Add new project › Import an existing project › GitHub › `4improvementsportugal-ops/n5-controlo`, branch `main`. O `netlify.toml` já define o build.
2. Antes do primeiro deploy, em Site configuration › Environment variables:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | Ligação Postgres via pooler |
| `SESSION_SECRET` | String aleatória com 32+ caracteres |
| `CRON_SECRET` | String aleatória longa |
| `APP_URL` | Endereço do site, por exemplo `https://n5-controlo.netlify.app` |
| `DEMO_DATA` e `NEXT_PUBLIC_DEMO_DATA` | Não definir: a produção não leva dados de exemplo (apagar se existirem) |

As restantes (Stripe, GitHub, Slack, Meta, SES, Bedrock para os resumos do Chat) acrescentam-se quando cada ligação for configurada (`docs/integracoes.md`).

3. Deploy. O build de produção aplica as migrações e compila a app. Não cria dados de exemplo.
4. Criar o primeiro utilizador, uma vez, num computador com a `DATABASE_URL` da produção no ambiente:

```bash
npm run user:create -- <email> "<nome>" socio '<palavra-passe com 12+ caracteres>'
```

O mesmo comando repõe a palavra-passe de um utilizador que já existe.

## Tarefas agendadas (UTC)

| Função | Horário | Chama |
| --- | --- | --- |
| `cron-alerts` | a cada 15 min | `/api/cron/alerts` |
| `cron-engagement` | de hora a hora | `/api/cron/engagement` |
| `cron-chat` | 03:23 | `/api/cron/chat` (resume por mês o chat com mais de 90 dias) |
| `cron-meta-sync` | a cada 6 h | `/api/cron/meta-sync` |
| `cron-mrr` | 02:00 | `/api/cron/mrr` |
