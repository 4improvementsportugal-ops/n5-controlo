# Ligações externas

Todas as ligações verificam a assinatura de cada pedido e guardam o pedido em bruto 30 dias (`webhook_inbox`), para poder reprocessar se algo falhar. Pedidos repetidos são ignorados.

## Stripe

- Endpoint: `https://<domínio>/api/webhooks/stripe`
- Eventos: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`.
- Segredo: `STRIPE_WEBHOOK_SECRET`.
- Convenções obrigatórias:
  - Cada subscrição leva `metadata.n5_software` (ex.: `sw_clara`). Opcionalmente leva `metadata.n5_org_name`.
  - Cada preço leva `metadata.included_minutes` e `metadata.included_leads`: é o incluído no plano.
  - Preços de consumo (`usage_type: metered`) ficam fora do MRR.
- A fatura certificada AT é emitida pelo faturador (Moloni ou InvoiceXpress) a partir do mesmo evento `invoice.paid`. Essa ligação ainda não está neste repositório.

## GitHub

- Criar uma GitHub App só de leitura (Pull requests, Deployments, Contents: read).
- Instalar a app nos repositórios dos softwares.
- Webhook: `https://<domínio>/api/webhooks/github`, com o segredo em `GITHUB_WEBHOOK_SECRET`.
- Eventos: Pull request, Pull request review, Deployment status, Release.
- Em Definições › Softwares, preencher os repositórios de cada software (`org/repo`).
- Para um PR se ligar a um item do roadmap, o código do item (ex.: `CLA-12`) tem de estar no título do PR ou no nome do branch.
- Um PR conta como de agente quando o autor é um bot do GitHub ou o PR tem a etiqueta `agente`.
- O que acontece automaticamente:
  - Merge na branch principal passa o item a Testes.
  - Deploy com sucesso em staging passa o item a Staging; em produção, passa a Produção.
  - Se faltarem dono, critérios de aceitação ou eventos de produto, o item não avança e é criado um alerta.
  - Deploy de produção falhado gera um alerta crítico.

## Slack (workspace da comunidade N5)

- Criar uma app Slack com:
  - Slash command `/feedback`, com o URL `https://<domínio>/api/webhooks/slack`.
  - Event Subscriptions no mesmo URL, com o evento de bot `reaction_added`.
  - Bot token scopes: `chat:write`, `commands`, `reactions:read`, `channels:history`, `channels:read`.
- Variáveis:
  - `SLACK_SIGNING_SECRET` e `SLACK_BOT_TOKEN`.
  - `SLACK_ALERTS_CHANNEL`, o canal interno de alertas (por omissão `n5-alertas`).
  - `SLACK_FEEDBACK_REACTION` (por omissão `bulb`).
- Canais com o prefixo de cada software: `clara-feedback`, `clara-novidades`, `clara-ajuda`. O prefixo define-se em Definições › Softwares.
- Como se usa:
  - `/feedback bug: o calendário não abre` regista o feedback e responde só a quem escreveu.
  - A reação `:bulb:` numa mensagem transforma-a em feedback.
  - `:+1:` numa mensagem que já é feedback conta como voto.
  - Publicar uma versão no Pipeline envia o changelog para `#<prefixo>-novidades`.
  - Mudanças de estado (planeado, lançado, recusado) respondem na conversa original.

## Meta (anúncios)

- Token de utilizador de sistema do Business Portfolio N5, com `ads_read`, em `META_ACCESS_TOKEN`.
- Em Definições › Softwares, preencher a conta de anúncios de cada software (`act_…`).
- `/api/cron/meta-sync` lê os últimos 28 dias ao nível do anúncio, por dia, a cada 6 horas. Também existe o botão "Sincronizar Meta agora".
- Alternativa sem token: importar o CSV exportado do Gestor de Anúncios em Campanhas e funil.
- Atribuição: as UTMs chegam com o evento `account.signed_up` (propriedades `utm_campaign`, `fbclid`, …). O nome da campanha tem de ser igual a `utm_campaign`.
