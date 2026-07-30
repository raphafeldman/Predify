-- ============================================================
-- Fase 2A (Domínio de Manutenção) — planos de manutenção.
--
-- A regra recorrente sai de dentro do equipamento e ganha entidade
-- própria. É o que permite um mesmo ativo ter troca de filtro mensal E
-- revisão anual, ou um plano cobrir uma área inteira em vez de um
-- equipamento específico.
--
-- Tabelas VAZIAS. Nenhum dado copiado, nenhuma tabela existente
-- alterada. maintenance_items continua sendo a fonte da verdade.
-- ============================================================

create table if not exists public.maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id) on delete cascade,

  -- Um plano pode ser de um ativo específico OU de uma área (ex.:
  -- "inspeção mensal dos extintores do bloco A"). A constraint abaixo
  -- exige pelo menos um dos dois.
  asset_id uuid references public.assets (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,

  name text not null,
  description text,
  maintenance_type text not null default 'preventiva'
    check (maintenance_type in ('preventiva', 'preditiva', 'inspecao')),

  -- Além das 6 frequências que já existiam em maintenance_items,
  -- entram quinzenal/bimestral e os gatilhos não-temporais previstos
  -- na especificação (data específica, leitura de medidor, horas de
  -- funcionamento). Os dois últimos ainda não têm interface — ficam
  -- disponíveis no banco para as fases seguintes.
  frequency_type text not null default 'mensal' check (frequency_type in (
    'diaria', 'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral',
    'semestral', 'anual', 'data_especifica', 'medidor', 'horas_funcionamento'
  )),
  -- Multiplicador do frequency_type (ex.: type='mensal', interval=3 => a cada 3 meses).
  frequency_interval integer not null default 1 check (frequency_interval > 0),

  next_due_at date,
  -- Antecedência, em dias, para o plano aparecer como "a vencer".
  lead_time_days integer not null default 7 check (lead_time_days >= 0),

  responsible_user_id uuid references public.profiles (id) on delete set null,
  supplier_id uuid references public.fornecedores (id) on delete set null,
  estimated_duration_minutes integer check (estimated_duration_minutes is null or estimated_duration_minutes > 0),
  estimated_cost numeric check (estimated_cost is null or estimated_cost >= 0),

  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_reason text,

  constraint maintenance_plans_alvo_check check (asset_id is not null or location_id is not null)
);

alter table public.maintenance_plans enable row level security;

-- ------------------------------------------------------------
-- maintenance_plan_steps — o checklist de cada plano.
--
-- Substitui o "checklist de item único" atual: cada etapa tem tipo de
-- resposta próprio, e uma resposta fora da faixa pode gerar não
-- conformidade automaticamente (consumido na Fase 2C/2D).
-- ------------------------------------------------------------
create table if not exists public.maintenance_plan_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.maintenance_plans (id) on delete cascade,
  order_index integer not null default 0,
  title text not null,
  instruction text,
  response_type text not null default 'confirmacao' check (response_type in (
    'confirmacao', 'sim_nao', 'texto', 'numero', 'medidor', 'selecao',
    'foto', 'arquivo', 'assinatura'
  )),
  -- Opções para response_type='selecao'.
  options text[] not null default '{}',
  required boolean not null default true,
  min_value numeric,
  max_value numeric,
  requires_evidence boolean not null default false,
  creates_nonconformity boolean not null default false,
  created_at timestamptz not null default now(),

  constraint maintenance_plan_steps_faixa_check
    check (min_value is null or max_value is null or min_value <= max_value),
  constraint maintenance_plan_steps_ordem_unica unique (plan_id, order_index)
);

alter table public.maintenance_plan_steps enable row level security;

drop trigger if exists stamp_condominio_id on public.maintenance_plans;
create trigger stamp_condominio_id before insert on public.maintenance_plans
  for each row execute function public.stamp_condominio_id();

-- ------------------------------------------------------------
-- RLS. maintenance_plan_steps não tem condominio_id próprio — o
-- isolamento vem por junção com o plano, mesmo padrão que
-- checklist_entries usa hoje via template.
-- ------------------------------------------------------------
drop policy if exists "maintenance_plans_select" on public.maintenance_plans;
create policy "maintenance_plans_select" on public.maintenance_plans
  for select to authenticated
  using (
    (condominio_id = public.current_condominio_id() and (deleted_at is null or public.is_sindico()))
    or public.is_platform_admin()
  );

drop policy if exists "maintenance_plans_write_sindico" on public.maintenance_plans;
create policy "maintenance_plans_write_sindico" on public.maintenance_plans
  for all to authenticated
  using ((condominio_id = public.current_condominio_id() and public.is_sindico()) or public.is_platform_admin())
  with check ((condominio_id = public.current_condominio_id() and public.is_sindico()) or public.is_platform_admin());

drop policy if exists "maintenance_plan_steps_select" on public.maintenance_plan_steps;
create policy "maintenance_plan_steps_select" on public.maintenance_plan_steps
  for select to authenticated
  using (
    exists (
      select 1 from public.maintenance_plans p
      where p.id = plan_id
        and ((p.condominio_id = public.current_condominio_id() and (p.deleted_at is null or public.is_sindico()))
             or public.is_platform_admin())
    )
  );

drop policy if exists "maintenance_plan_steps_write_sindico" on public.maintenance_plan_steps;
create policy "maintenance_plan_steps_write_sindico" on public.maintenance_plan_steps
  for all to authenticated
  using (
    exists (
      select 1 from public.maintenance_plans p
      where p.id = plan_id
        and ((p.condominio_id = public.current_condominio_id() and public.is_sindico()) or public.is_platform_admin())
    )
  )
  with check (
    exists (
      select 1 from public.maintenance_plans p
      where p.id = plan_id
        and ((p.condominio_id = public.current_condominio_id() and public.is_sindico()) or public.is_platform_admin())
    )
  );

drop trigger if exists log_audit_maintenance_plans on public.maintenance_plans;
create trigger log_audit_maintenance_plans
  after insert or update on public.maintenance_plans
  for each row execute function public.log_audit_event('maintenance_plan');

create index if not exists maintenance_plans_condominio_id_idx on public.maintenance_plans (condominio_id);
create index if not exists maintenance_plans_deleted_at_idx on public.maintenance_plans (deleted_at);
create index if not exists maintenance_plans_asset_id_idx on public.maintenance_plans (asset_id);
create index if not exists maintenance_plans_location_id_idx on public.maintenance_plans (location_id);
create index if not exists maintenance_plans_next_due_at_idx on public.maintenance_plans (next_due_at);
create index if not exists maintenance_plan_steps_plan_id_idx on public.maintenance_plan_steps (plan_id);
