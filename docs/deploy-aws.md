# Alojamento na organização AWS N5

Recomendação da especificação: uma conta AWS só para o controlo, dentro da organização N5, na região da Irlanda (`eu-west-1`) ou de Frankfurt (`eu-central-1`).

## Peças

| Peça | Serviço | Notas |
| --- | --- | --- |
| Aplicação | ECS Fargate, 1 tarefa (0,5 vCPU, 1 GB) atrás de um Application Load Balancer com HTTPS | Imagem do `Dockerfile`; health check em `/api/health` |
| Base de dados | RDS Postgres 16, `db.t4g.micro` para começar, cópias diárias 7 dias | Sem acesso público; só a partir da tarefa ECS |
| Segredos | Secrets Manager | `DATABASE_URL`, `SESSION_SECRET`, `STRIPE_WEBHOOK_SECRET`, `GITHUB_WEBHOOK_SECRET`, `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `META_ACCESS_TOKEN`, `CRON_SECRET` |
| Imagens | ECR | Uma por versão, com a tag do commit |
| Tarefas agendadas | EventBridge Scheduler → pedido HTTPS com `Authorization: Bearer $CRON_SECRET` | `/api/cron/alerts` a cada 15 min; `/api/cron/mrr` às 02:00; `/api/cron/meta-sync` a cada 6 h; `/api/cron/engagement` de hora a hora; `/api/cron/chat` uma vez por dia |
| IA dos resumos do Chat (opcional) | Amazon Bedrock em `eu-central-1` | `LLM_PROVIDER=bedrock`, `BEDROCK_MODEL_ID`; o papel da tarefa precisa de `bedrock:InvokeModel` só nesse modelo. Sem isto, os resumos fazem-se por regras |
| Domínio | Route 53 + ACM | Por exemplo `controlo.n5...` |
| Registos | CloudWatch Logs, 30 dias | |

As tarefas agendadas podem também ser uma Lambda simples que faz o pedido; o importante é enviar o cabeçalho com o segredo.

## Primeiro deploy

1. Criar a base de dados e guardar a `DATABASE_URL` no Secrets Manager.
2. Construir e enviar a imagem:
   ```bash
   docker build -t n5-controlo:$(git rev-parse --short HEAD) .
   docker tag … <conta>.dkr.ecr.eu-west-1.amazonaws.com/n5-controlo:<tag>
   docker push …
   ```
3. Correr as migrações como tarefa única com a mesma imagem: comando `node scripts/migrate.mjs`.
4. Criar o serviço ECS com a imagem, as variáveis do Secrets Manager e o load balancer.
5. Criar o primeiro utilizador (tarefa única): `npx tsx scripts/create-user.ts …`. Em alternativa, corre o script localmente apontado à base de dados por um túnel.
6. Configurar as ligações (`docs/integracoes.md`) e confirmar em Definições › Ligações.

## Deploys seguintes

Cada merge em `main` passa a CI (`.github/workflows/ci.yml`). O deploy é manual nesta versão: nova imagem, tarefa de migrações, atualizar o serviço. O passo seguinte é automatizar o deploy por GitHub Actions com OIDC para a conta AWS, sem chaves guardadas.

## Custos de referência

Para uma equipa pequena, contar com Fargate (0,5 vCPU/1 GB 24/7), RDS micro, load balancer e registos. Confirmar no AWS Pricing Calculator para a região escolhida antes de fechar o orçamento.

## E-mail (módulo Reativação)

- Amazon SES em `eu-west-1`, com o domínio de envio verificado (SPF, DKIM e DMARC) e a conta fora do modo sandbox.
- Define `SES_FROM_ADDRESS` (por exemplo `N5 <ola@n5...>`) e `SES_REGION`. A função da app precisa de `ses:SendEmail`.
- Sem `SES_FROM_ADDRESS`, os envios ficam registados como simulados e não sai nenhum e-mail.
- Os e-mails levam `List-Unsubscribe` com cancelamento num clique (`/api/unsubscribe`).
