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
- **Testes de isolamento multi-tenant contra um banco real** não foram
  executados — este ambiente não tem um projeto Supabase de teste
  separado nem Docker confirmado para rodar `supabase start` localmente.
  As migrations acima foram revisadas manualmente (sintaxe, predicados,
  parênteses) mas não têm confirmação de execução real contra Postgres.

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
