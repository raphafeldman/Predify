-- ============================================================
-- Fase 1 (Confiabilidade) — soft delete nas entidades operacionais.
--
-- Substitui exclusão física por "marcar como excluído": em vez de uma
-- policy de delete real, cada tabela ganha deleted_at/deleted_by/
-- deletion_reason, e o select deixa de mostrar linhas excluídas pra
-- quem não é síndico/admin da plataforma — que continuam vendo tudo
-- (inclusive excluído), o que permite restaurar (basta um update
-- voltando deleted_at pra null, usando a mesma policy de update que
-- já existe pra cada tabela).
--
-- Não apaga nenhuma tabela/coluna/policy existente. Não roda nada em
-- produção — arquivo local, versionado, pendente de aplicação manual
-- no SQL Editor do Supabase (mesmo processo já usado neste projeto).
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'occurrences', 'tasks', 'maintenance_records', 'documents',
    'service_requests', 'fornecedores', 'maintenance_items', 'checklist_templates'
  ]
  loop
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
    execute format(
      'alter table public.%I add column if not exists deleted_by uuid references public.profiles (id) on delete set null',
      t
    );
    execute format('alter table public.%I add column if not exists deletion_reason text', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- Tabelas com policy de select simples (condominio_id = current OR
-- platform admin) — só precisam do filtro "não excluído, a menos que
-- seja síndico" dentro do mesmo bloco condominio-scoped.
-- ------------------------------------------------------------

drop policy if exists "maintenance_items_select" on public.maintenance_items;
create policy "maintenance_items_select" on public.maintenance_items
  for select to authenticated
  using (
    (condominio_id = public.current_condominio_id() and (deleted_at is null or public.is_sindico()))
    or public.is_platform_admin()
  );

drop policy if exists "maintenance_records_select" on public.maintenance_records;
create policy "maintenance_records_select" on public.maintenance_records
  for select to authenticated
  using (
    (condominio_id = public.current_condominio_id() and (deleted_at is null or public.is_sindico()))
    or public.is_platform_admin()
  );

drop policy if exists "checklist_templates_select" on public.checklist_templates;
create policy "checklist_templates_select" on public.checklist_templates
  for select to authenticated
  using (
    (condominio_id = public.current_condominio_id() and (deleted_at is null or public.is_sindico()))
    or public.is_platform_admin()
  );

drop policy if exists "fornecedores_select" on public.fornecedores;
create policy "fornecedores_select" on public.fornecedores
  for select to authenticated
  using (
    (condominio_id = public.current_condominio_id() and (deleted_at is null or public.is_sindico()))
    or public.is_platform_admin()
  );

drop policy if exists "service_requests_select" on public.service_requests;
create policy "service_requests_select" on public.service_requests
  for select to authenticated
  using (
    (condominio_id = public.current_condominio_id() and (deleted_at is null or public.is_sindico()))
    or public.is_platform_admin()
  );

-- ------------------------------------------------------------
-- Tabelas com policy de select restrita por autoria/responsável
-- (occurrences, documents, tasks) — mesma lógica, preservando
-- integralmente a regra de visibilidade já existente.
-- ------------------------------------------------------------

drop policy if exists "occurrences_select" on public.occurrences;
create policy "occurrences_select" on public.occurrences
  for select to authenticated
  using (
    (
      condominio_id = public.current_condominio_id()
      and (created_by = auth.uid() or assigned_to = auth.uid() or public.is_sindico())
      and (deleted_at is null or public.is_sindico())
    )
    or public.is_platform_admin()
  );

drop policy if exists "documents_select" on public.documents;
create policy "documents_select" on public.documents
  for select to authenticated
  using (
    (
      condominio_id = public.current_condominio_id()
      and (created_by = auth.uid() or public.is_sindico())
      and (deleted_at is null or public.is_sindico())
    )
    or public.is_platform_admin()
  );

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select to authenticated
  using (
    (
      condominio_id = public.current_condominio_id()
      and (created_by = auth.uid() or assigned_to = auth.uid() or public.is_sindico())
      and (deleted_at is null or public.is_sindico())
    )
    or public.is_platform_admin()
  );

-- ------------------------------------------------------------
-- `documents` nunca teve policy de update (achado da Fase 0 — hoje só
-- dá pra inserir/apagar via cliente). Sem isso, soft delete de
-- documento não teria como funcionar. Mesma regra de quem já pode
-- apagar (documents_delete), agora também pra editar/restaurar.
-- ------------------------------------------------------------

drop policy if exists "documents_update" on public.documents;
create policy "documents_update" on public.documents
  for update to authenticated
  using (
    ((created_by = auth.uid() or public.is_sindico()) and condominio_id = public.current_condominio_id())
    or public.is_platform_admin()
  )
  with check (
    ((created_by = auth.uid() or public.is_sindico()) and condominio_id = public.current_condominio_id())
    or public.is_platform_admin()
  );
