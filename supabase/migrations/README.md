# Migrations versionadas (a partir da Fase 1)

A partir de 2026-07-29, `supabase/schema.sql` está **congelado** como
documentação histórica — nenhuma mudança de banco deve mais ser anexada ao
final desse arquivo. Toda alteração nova de schema vira um arquivo aqui,
numerado (`YYYYMMDDHHMMSS_descricao.sql`), aplicado manualmente no SQL
Editor do Supabase, na ordem dos arquivos.

## Por quê

O `schema.sql` monolítico (1800+ linhas) tornava difícil saber o estado
final esperado, revisar diffs, e já causou pelo menos um bug real de
produção (uma migração referenciava uma tabela definida mais adiante no
mesmo arquivo — o script abortava no meio e ninguém percebia, porque "colar
o schema.sql inteiro" parecia ter funcionado). Migrations pequenas e
numeradas tornam cada mudança revisável e rastreável isoladamente.

## Como aplicar

Nenhum arquivo desta pasta foi aplicado em produção pela Fase 1 — são
locais, aguardando você colar manualmente no SQL Editor do Supabase, **na
ordem dos nomes** (a numeração já garante a ordem certa):

1. `20260729120000_baseline_historico.sql` — cópia fiel do `schema.sql`
   atual. Já está tudo aplicado em produção; colar de novo é seguro (é
   idempotente) mas não é obrigatório — é só o marco zero da versionagem.
2. `20260729120100_soft_delete.sql` — adiciona `deleted_at`/`deleted_by`/
   `deletion_reason` em 8 tabelas e ajusta as políticas de select pra
   esconder registros excluídos de quem não é síndico.
3. `20260729120200_audit_events.sql` — cria a tabela `audit_events`
   (imutável) e os triggers que registram criação, mudança de status,
   responsável e custo em 5 tabelas.
4. `20260729120300_condominio_id_indexes.sql` — índices de performance,
   sem mudança de comportamento.

## Pendências conhecidas (não resolvidas nesta fase — precisam da sua confirmação)

- **`trigger_whatsapp_daily_digest()`** (dentro do baseline, linha ~1634
  do `schema.sql` original) grava o placeholder literal
  `'Bearer <SUA-ANON-KEY>'` no cabeçalho da chamada HTTP. Se esse
  placeholder nunca foi trocado pela chave anon real em produção, o cron
  diário do WhatsApp falha autenticação silenciosamente todo dia. Não
  mexemos nisso nesta fase — depende de você confirmar se já foi
  corrigido manualmente.
- Ausência de policy de **update/delete em `comments`** e de
  **update/delete em `whatsapp_messages`** — não resolvido, porque não
  ficou claro se é decisão de produto (imutabilidade proposital) ou
  esquecimento. `documents` ganhou uma policy de update nova (necessária
  pro soft delete funcionar), mas isso foi o único caso onde a ausência
  claramente impedia uma funcionalidade pedida nesta fase.
## Validação em homologação (2026-07-29)

As 4 migrations acima foram aplicadas num projeto Supabase de
homologação (separado da produção) e validadas por testes automatizados
que rodam contra ele — ver `supabase/tests/rls-isolation.test.ts` e
`.env.test.example`. Os testes provam, com dois condomínios reais
criados pelo fluxo self-service do app:

- um síndico não lê, não altera e não exclui (nem logicamente) ordens de
  outro condomínio;
- o mesmo vale para documentos, tarefas e fornecedores;
- `audit_events` não vaza entre condomínios, e o trigger de auditoria
  realmente grava o evento de criação (o síndico do próprio condomínio
  enxerga o evento).

Isso também confirma na prática que as colunas de soft delete e a tabela
`audit_events` funcionam num Postgres real — não só na revisão manual do
SQL. **A produção continua sem essas migrations aplicadas.**

Para rodar os testes você precisa, no projeto de homologação:
`.env.test` preenchido (copie de `.env.test.example`), provider de e-mail
habilitado para signup e **"Confirm email" desligado** em Authentication
→ Sign In / Providers → Email. Sem `.env.test`, os testes são pulados
automaticamente e `npm test` continua verde.

## Aplicando com o CLI (a partir da Fase 2)

A Fase 1 foi aplicada em produção com `npx supabase db push --linked`, que
funciona e dispensa colar SQL no editor. Dois cuidados aprendidos na prática:

**1. Confira sempre em qual projeto o CLI está linkado antes de dar push.**

```bash
npx supabase projects list   # procure "linked": true
npx supabase link --project-ref <ref>
```

Trocar de projeto para testar em homologação e **esquecer de voltar** faria o
próximo push cair no lugar errado.

**2. Se um projeto recebeu migrations manualmente (coladas no SQL Editor), o
CLI não sabe disso** e vai tentar reaplicar tudo desde o começo. Marque-as como
já aplicadas antes do primeiro push:

```bash
npx supabase migration repair --status applied 20260729120000
```

Foi exatamente o que aconteceu em homologação na Fase 2A: o push tentou
reaplicar o baseline e falhou em
`alter table public.profiles alter column condominio_id set not null`, porque
lá existem contas de teste sem condomínio (criadas pelos próprios testes de
escalonamento de privilégio). **O baseline não é seguro de reaplicar num banco
que tenha perfis sem `condominio_id`** — em produção passou porque todos os
perfis têm condomínio.

## Voltando atrás (rollback)

Nenhuma migration desta fase remove tabela, coluna ou dado — só adiciona
colunas (`deleted_at` etc.), uma tabela nova (`audit_events`), índices, e
substitui *policies* (nunca dados). Reverter é seguro:

```sql
-- reverter soft_delete (mantém os dados, só recua a estrutura)
alter table public.occurrences drop column if exists deleted_at, drop column if exists deleted_by, drop column if exists deletion_reason;
-- repetir pra tasks, maintenance_records, documents, service_requests, fornecedores, maintenance_items, checklist_templates
-- e recolar as versões anteriores das policies de select a partir do schema.sql original

-- reverter audit_events
drop trigger if exists log_audit_occurrences on public.occurrences;
drop trigger if exists log_audit_tasks on public.tasks;
drop trigger if exists log_audit_maintenance_records on public.maintenance_records;
drop trigger if exists log_audit_documents on public.documents;
drop trigger if exists log_audit_service_requests on public.service_requests;
drop function if exists public.log_audit_event();
drop table if exists public.audit_events;

-- reverter índices
drop index if exists public.occurrences_condominio_id_idx; -- etc, um por índice criado
```
