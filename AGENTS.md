# Regras para agentes de código

Este ficheiro é lido por agentes de código (Claude Code, Codex e outros) antes de trabalharem neste repositório. As pessoas da equipa seguem as mesmas regras.

## Como trabalhar

- Trabalha sempre num branch com o código do item do roadmap: `CLA-12-descricao-curta`. Põe o código também no título do PR.
- Nunca faças merge. Abre o PR e espera pela revisão do dono humano do item.
- Antes de abrir o PR, corre `npm run typecheck`, `npm test` e `npm run build`. Sem os três a passar, não abras o PR.
- PRs pequenos: um item, uma alteração. Se o item for grande, divide-o e diz porquê no PR.
- Escreve a descrição do PR em português de Portugal: o que muda, como testaste, o que ficou de fora.

## O que não podes tocar

- `drizzle/` (migrações já aplicadas): para mudar a base de dados, altera `src/db/schema.ts` e gera uma migração nova com `npm run db:generate`. Nunca edites uma migração existente.
- `src/lib/signatures.ts`, `src/lib/session.ts`, `src/lib/apikeys.ts` e `src/middleware.ts`: segurança. Mudanças aqui só por uma pessoa da equipa.
- `.env`, segredos, chaves e tokens: nunca os escrevas em código, testes ou logs.
- Dados de produção: os agentes não têm acesso, e o `db:seed` recusa correr em produção.

## Convenções

- Interface e mensagens em português de Portugal. Valores em euros sem IVA, datas DD/MM/AAAA, fuso Europe/Lisbon.
- Cálculos de métricas vão para `src/lib/metrics.ts`, como funções puras com teste em `tests/`.
- Acesso a dados nos ecrãs passa por `src/lib/queries.ts`. Escritas passam por server actions que chamam `requireUser(<módulo>)` e registam em `audit_log`.
- Uma rota nova da API valida o corpo com `zod`, autentica com `authenticate(req, "<permissão>")` e devolve erros no formato `{ error: { code, message } }`.
- Uma regra de alerta nova vai para `src/lib/alerts.ts`, com `dedupeKey` estável para não repetir.
