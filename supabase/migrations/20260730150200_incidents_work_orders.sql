-- ============================================================
-- Fase 2A (Domínio de Manutenção) — ocorrências e ordens de serviço.
--
-- Hoje `occurrences` acumula o FATO observado ("tem infiltração na
-- garagem") e o TRABALHO executado (responsável, prazo, custo, status).
-- Isso impede triagem, impede uma ocorrência gerar duas OS, e impede
-- registrar "resolvida sem precisar de OS".
--
-- Tabelas VAZIAS. `occurrences` continua sendo a fonte da verdade e
-- seus triggers seguem ativos — os equivalentes aqui só entram em
-- operação quando a tela for cortada, na Fase 2D, para não duplicar
-- notificação.
-- ============================================================

-- ------------------------------------------------------------
-- incidents — o fato observado
-- ------------------------------------------------------------
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id) on delete cascade,
  number integer,
  title text not null,
  description text not null,
  category text not null default 'outro',
  severity text not null default 'media' check (severity in ('baixa', 'media', 'alta')),
  status text not null default 'nova' check (status in (
    'nova', 'em_triagem', 'aguardando_info', 'encaminhada',
    'resolvida_sem_os', 'convertida_em_os', 'encerrada', 'cancelada', 'reaberta'
  )),
  asset_id uuid references public.assets (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,
  photo_urls text[] not null default '{}',
  reported_by uuid references public.profiles (id) on delete set null,
  triaged_by uuid references public.profiles (id) on delete set null,
  triaged_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_reason text
);

alter table public.incidents enable row level security;

-- ------------------------------------------------------------
-- work_orders — o trabalho
--
-- O check de status aceita os 15 estados da especificação, mas a
-- interface vai expor 8 na Fase 2D. Quinze estados numa tela de celular
-- tornaria o app inutilizável para o funcionário; os demais ficam
-- disponíveis no banco para ativação futura sem nova migration.
-- ------------------------------------------------------------
create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id) on delete cascade,
  number integer,

  origin_type text not null default 'solicitacao_direta'
    check (origin_type in ('incidente', 'preventiva', 'inspecao', 'solicitacao_direta')),
  incident_id uuid references public.incidents (id) on delete set null,
  maintenance_plan_id uuid references public.maintenance_plans (id) on delete set null,
  asset_id uuid references public.assets (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,

  title text not null,
  description text not null default '',
  category text not null default 'outro',
  priority text not null default 'media' check (priority in ('baixa', 'media', 'alta', 'urgente')),
  criticality text not null default 'media' check (criticality in ('baixa', 'media', 'alta', 'critica')),
  status text not null default 'aberta' check (status in (
    'rascunho', 'aberta', 'em_triagem', 'aguardando_aprovacao', 'aguardando_orcamento',
    'aprovada', 'programada', 'em_execucao', 'pausada', 'aguardando_material',
    'aguardando_fornecedor', 'concluida', 'aguardando_validacao', 'encerrada',
    'cancelada', 'reaberta'
  )),

  requested_by uuid references public.profiles (id) on delete set null,
  assigned_user_id uuid references public.profiles (id) on delete set null,
  supplier_id uuid references public.fornecedores (id) on delete set null,

  due_at timestamptz,
  sla_minutes integer check (sla_minutes is null or sla_minutes > 0),
  started_at timestamptz,
  completed_at timestamptz,
  validated_at timestamptz,
  validated_by uuid references public.profiles (id) on delete set null,

  estimated_cost numeric check (estimated_cost is null or estimated_cost >= 0),
  actual_cost numeric check (actual_cost is null or actual_cost >= 0),
  cancellation_reason text,
  reopening_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_reason text
);

alter table public.work_orders enable row level security;

-- ------------------------------------------------------------
-- work_order_evidence — fotos e documentos, tipados por momento
-- ------------------------------------------------------------
create table if not exists public.work_order_evidence (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  kind text not null default 'outro' check (kind in (
    'foto_antes', 'foto_durante', 'foto_depois', 'om_fornecedor',
    'nota_fiscal', 'relatorio', 'laudo', 'assinatura', 'outro'
  )),
  file_url text not null,
  file_name text,
  mime_type text,
  notes text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.work_order_evidence enable row level security;

-- ------------------------------------------------------------
-- Numeração sequencial por condomínio.
--
-- IMPORTANTE: reutiliza o MESMO contador condominios.next_os_number que
-- occurrences já usa. Assim, quando a Fase 2B copiar as ordens antigas
-- preservando o os_number, e a Fase 2D passar a criar OS aqui, a
-- sequência continua de onde parou — sem colisão e sem reiniciar.
-- ------------------------------------------------------------
create or replace function public.stamp_work_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  if new.number is not null then
    return new;
  end if;
  update public.condominios
     set next_os_number = next_os_number + 1
   where id = new.condominio_id
  returning next_os_number - 1 into v_number;
  new.number := v_number;
  return new;
end;
$$;

create or replace function public.stamp_incident_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  if new.number is not null then
    return new;
  end if;
  select coalesce(max(number), 0) + 1 into v_number
    from public.incidents where condominio_id = new.condominio_id;
  new.number := v_number;
  return new;
end;
$$;

-- A ordem alfabética dos nomes importa: stamp_condominio_id precisa
-- rodar antes, para que o carimbo do número saiba de qual condomínio
-- ler o contador. Mesmo cuidado já documentado em occurrences.
drop trigger if exists stamp_condominio_id on public.incidents;
create trigger stamp_condominio_id before insert on public.incidents
  for each row execute function public.stamp_condominio_id();

drop trigger if exists stamp_number on public.incidents;
create trigger stamp_number before insert on public.incidents
  for each row execute function public.stamp_incident_number();

drop trigger if exists stamp_condominio_id on public.work_orders;
create trigger stamp_condominio_id before insert on public.work_orders
  for each row execute function public.stamp_condominio_id();

drop trigger if exists stamp_number on public.work_orders;
create trigger stamp_number before insert on public.work_orders
  for each row execute function public.stamp_work_order_number();

-- ------------------------------------------------------------
-- RLS.
--
-- Visibilidade espelha a regra já validada em occurrences: o
-- funcionário vê o que abriu ou o que lhe foi atribuído; o síndico vê
-- tudo do condomínio. Incidents são mais abertos (qualquer um do
-- condomínio vê), porque relatar e acompanhar ocorrência é justamente
-- o que se quer incentivar.
-- ------------------------------------------------------------
drop policy if exists "incidents_select" on public.incidents;
create policy "incidents_select" on public.incidents
  for select to authenticated
  using (
    (condominio_id = public.current_condominio_id() and (deleted_at is null or public.is_sindico()))
    or public.is_platform_admin()
  );

drop policy if exists "incidents_insert" on public.incidents;
create policy "incidents_insert" on public.incidents
  for insert to authenticated
  with check (reported_by = auth.uid());

drop policy if exists "incidents_update" on public.incidents;
create policy "incidents_update" on public.incidents
  for update to authenticated
  using (
    ((reported_by = auth.uid() or public.is_sindico()) and condominio_id = public.current_condominio_id())
    or public.is_platform_admin()
  )
  with check (
    ((reported_by = auth.uid() or public.is_sindico()) and condominio_id = public.current_condominio_id())
    or public.is_platform_admin()
  );

drop policy if exists "work_orders_select" on public.work_orders;
create policy "work_orders_select" on public.work_orders
  for select to authenticated
  using (
    (
      condominio_id = public.current_condominio_id()
      and (requested_by = auth.uid() or assigned_user_id = auth.uid() or public.is_sindico())
      and (deleted_at is null or public.is_sindico())
    )
    or public.is_platform_admin()
  );

drop policy if exists "work_orders_insert" on public.work_orders;
create policy "work_orders_insert" on public.work_orders
  for insert to authenticated
  with check (requested_by = auth.uid());

drop policy if exists "work_orders_update" on public.work_orders;
create policy "work_orders_update" on public.work_orders
  for update to authenticated
  using (
    ((requested_by = auth.uid() or assigned_user_id = auth.uid() or public.is_sindico())
      and condominio_id = public.current_condominio_id())
    or public.is_platform_admin()
  )
  with check (
    ((requested_by = auth.uid() or assigned_user_id = auth.uid() or public.is_sindico())
      and condominio_id = public.current_condominio_id())
    or public.is_platform_admin()
  );

-- Evidência não tem condominio_id próprio: o isolamento vem por junção
-- com a OS, reaproveitando integralmente a regra acima.
drop policy if exists "work_order_evidence_select" on public.work_order_evidence;
create policy "work_order_evidence_select" on public.work_order_evidence
  for select to authenticated
  using (
    exists (
      select 1 from public.work_orders w
      where w.id = work_order_id
        and ((w.condominio_id = public.current_condominio_id()
              and (w.requested_by = auth.uid() or w.assigned_user_id = auth.uid() or public.is_sindico())
              and (w.deleted_at is null or public.is_sindico()))
             or public.is_platform_admin())
    )
  );

drop policy if exists "work_order_evidence_insert" on public.work_order_evidence;
create policy "work_order_evidence_insert" on public.work_order_evidence
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.work_orders w
      where w.id = work_order_id
        and w.condominio_id = public.current_condominio_id()
        and (w.requested_by = auth.uid() or w.assigned_user_id = auth.uid() or public.is_sindico())
    )
  );

drop policy if exists "work_order_evidence_delete" on public.work_order_evidence;
create policy "work_order_evidence_delete" on public.work_order_evidence
  for delete to authenticated
  using (
    exists (
      select 1 from public.work_orders w
      where w.id = work_order_id
        and ((w.condominio_id = public.current_condominio_id()
              and (uploaded_by = auth.uid() or public.is_sindico()))
             or public.is_platform_admin())
    )
  );

drop trigger if exists log_audit_incidents on public.incidents;
create trigger log_audit_incidents
  after insert or update on public.incidents
  for each row execute function public.log_audit_event('incident');

drop trigger if exists log_audit_work_orders on public.work_orders;
create trigger log_audit_work_orders
  after insert or update on public.work_orders
  for each row execute function public.log_audit_event('work_order');

create index if not exists incidents_condominio_id_idx on public.incidents (condominio_id);
create index if not exists incidents_deleted_at_idx on public.incidents (deleted_at);
create index if not exists incidents_asset_id_idx on public.incidents (asset_id);
create index if not exists incidents_status_idx on public.incidents (status);

create index if not exists work_orders_condominio_id_idx on public.work_orders (condominio_id);
create index if not exists work_orders_deleted_at_idx on public.work_orders (deleted_at);
create index if not exists work_orders_incident_id_idx on public.work_orders (incident_id);
create index if not exists work_orders_maintenance_plan_id_idx on public.work_orders (maintenance_plan_id);
create index if not exists work_orders_asset_id_idx on public.work_orders (asset_id);
create index if not exists work_orders_assigned_user_id_idx on public.work_orders (assigned_user_id);
create index if not exists work_orders_status_idx on public.work_orders (status);
create index if not exists work_orders_due_at_idx on public.work_orders (due_at);

create index if not exists work_order_evidence_work_order_id_idx on public.work_order_evidence (work_order_id);

-- ------------------------------------------------------------
-- Amplia os check constraints polimórficos para aceitar os tipos novos.
-- Sem isso, comentar numa OS ou notificar sobre um ativo seria
-- rejeitado pelo banco. Só ADICIONA valores — nada existente é
-- invalidado.
-- ------------------------------------------------------------
alter table public.comments drop constraint if exists comments_record_type_check;
alter table public.comments add constraint comments_record_type_check check (
  record_type in (
    'occurrence', 'maintenance_record', 'task', 'checklist_entry', 'document',
    'service_request', 'incident', 'work_order', 'asset', 'maintenance_plan'
  )
);
