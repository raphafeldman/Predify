-- ============================================================
-- Fase 1 (Confiabilidade) — trilha de auditoria imutável.
--
-- audit_events registra quem mudou o quê: criação, mudança de status,
-- de responsável, de prazo (maintenance_items fica de fora aqui — só
-- as 5 tabelas citadas no plano da Fase 1), de custo, exclusão lógica
-- e restauração — nas 5 tabelas indicadas no diagnóstico (occurrences,
-- tasks, maintenance_records, documents, service_requests).
--
-- Ninguém edita ou apaga um evento de auditoria pelo cliente — nem
-- síndico, nem admin da plataforma: só o trigger (security definer)
-- escreve, e não existe policy de update/delete pra "authenticated".
-- Mesmo padrão já usado em notifications/whatsapp_messages neste
-- projeto (tabela de log, insert só via função do servidor).
--
-- Arquivo local, versionado, não aplicado em produção por esta tarefa.
-- ============================================================

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id) on delete cascade,
  record_type text not null,
  record_id uuid not null,
  action text not null check (
    action in ('created', 'status_changed', 'assignee_changed', 'due_date_changed', 'cost_changed', 'deleted', 'restored')
  ),
  actor_id uuid references public.profiles (id) on delete set null,
  field_name text,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

alter table public.audit_events enable row level security;

drop policy if exists "audit_events_select" on public.audit_events;
create policy "audit_events_select" on public.audit_events
  for select to authenticated
  using (
    (condominio_id = public.current_condominio_id() and public.is_sindico())
    or public.is_platform_admin()
  );

-- Função genérica reaproveitada pelas 5 tabelas — usa to_jsonb(new)/(old)
-- pra checar dinamicamente se a tabela tem a coluna em questão (status,
-- assigned_to, estimated_cost, quote_value, next_due_date), em vez de
-- escrever uma função quase-idêntica pra cada tabela. record_type vem
-- do argumento passado na criação de cada trigger (TG_ARGV[0]).
create or replace function public.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_type text := TG_ARGV[0];
  v_actor uuid := auth.uid();
  v_new jsonb;
  v_old jsonb;
begin
  if TG_OP = 'INSERT' then
    insert into public.audit_events (condominio_id, record_type, record_id, action, actor_id)
    values (new.condominio_id, v_record_type, new.id, 'created', v_actor);
    return new;
  end if;

  if TG_OP = 'UPDATE' then
    v_new := to_jsonb(new);
    v_old := to_jsonb(old);

    if (v_new ? 'deleted_at') and (v_new ->> 'deleted_at') is distinct from (v_old ->> 'deleted_at') then
      insert into public.audit_events (condominio_id, record_type, record_id, action, actor_id, field_name, old_value, new_value)
      values (
        new.condominio_id, v_record_type, new.id,
        case when v_new ->> 'deleted_at' is null then 'restored' else 'deleted' end,
        v_actor, 'deleted_at', v_old ->> 'deleted_at', v_new ->> 'deleted_at'
      );
    end if;

    if (v_new ? 'status') and (v_new ->> 'status') is distinct from (v_old ->> 'status') then
      insert into public.audit_events (condominio_id, record_type, record_id, action, actor_id, field_name, old_value, new_value)
      values (new.condominio_id, v_record_type, new.id, 'status_changed', v_actor, 'status', v_old ->> 'status', v_new ->> 'status');
    end if;

    if (v_new ? 'assigned_to') and (v_new ->> 'assigned_to') is distinct from (v_old ->> 'assigned_to') then
      insert into public.audit_events (condominio_id, record_type, record_id, action, actor_id, field_name, old_value, new_value)
      values (new.condominio_id, v_record_type, new.id, 'assignee_changed', v_actor, 'assigned_to', v_old ->> 'assigned_to', v_new ->> 'assigned_to');
    end if;

    if (v_new ? 'estimated_cost') and (v_new ->> 'estimated_cost') is distinct from (v_old ->> 'estimated_cost') then
      insert into public.audit_events (condominio_id, record_type, record_id, action, actor_id, field_name, old_value, new_value)
      values (new.condominio_id, v_record_type, new.id, 'cost_changed', v_actor, 'estimated_cost', v_old ->> 'estimated_cost', v_new ->> 'estimated_cost');
    end if;

    if (v_new ? 'quote_value') and (v_new ->> 'quote_value') is distinct from (v_old ->> 'quote_value') then
      insert into public.audit_events (condominio_id, record_type, record_id, action, actor_id, field_name, old_value, new_value)
      values (new.condominio_id, v_record_type, new.id, 'cost_changed', v_actor, 'quote_value', v_old ->> 'quote_value', v_new ->> 'quote_value');
    end if;

    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists log_audit_occurrences on public.occurrences;
create trigger log_audit_occurrences
  after insert or update on public.occurrences
  for each row execute function public.log_audit_event('occurrence');

drop trigger if exists log_audit_tasks on public.tasks;
create trigger log_audit_tasks
  after insert or update on public.tasks
  for each row execute function public.log_audit_event('task');

drop trigger if exists log_audit_maintenance_records on public.maintenance_records;
create trigger log_audit_maintenance_records
  after insert or update on public.maintenance_records
  for each row execute function public.log_audit_event('maintenance_record');

drop trigger if exists log_audit_documents on public.documents;
create trigger log_audit_documents
  after insert or update on public.documents
  for each row execute function public.log_audit_event('document');

drop trigger if exists log_audit_service_requests on public.service_requests;
create trigger log_audit_service_requests
  after insert or update on public.service_requests
  for each row execute function public.log_audit_event('service_request');
