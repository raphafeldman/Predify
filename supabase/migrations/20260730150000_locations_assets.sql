-- ============================================================
-- Fase 2A (Domínio de Manutenção) — estrutura física e ativos.
--
-- Primeiro passo da separação entre "o equipamento" e "a regra de
-- manutenção", hoje fundidos em maintenance_items: um gerador não
-- consegue ter troca de filtro mensal E revisão anual, porque só cabe
-- uma frequência por linha.
--
-- Aqui nascem só as tabelas, VAZIAS. Nenhum dado é copiado, nenhuma
-- tabela existente é alterada, nenhuma tela muda. maintenance_items
-- continua sendo a fonte da verdade até a Fase 2D.
-- ============================================================

-- ------------------------------------------------------------
-- locations — hierarquia física do condomínio
-- (condomínio -> bloco -> pavimento -> área -> ambiente)
--
-- Nasce vazia de propósito. maintenance_items.location é texto livre
-- ("Casa de máquinas"); inferir hierarquia a partir disso seria
-- fabricar dado. O texto original vai literalmente para
-- assets.location_text, e o síndico organiza a hierarquia quando (e se)
-- quiser.
-- ------------------------------------------------------------
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id) on delete cascade,
  parent_id uuid references public.locations (id) on delete cascade,
  name text not null,
  kind text not null default 'area' check (kind in ('bloco', 'pavimento', 'area', 'ambiente')),
  code text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_reason text
);

alter table public.locations enable row level security;

-- ------------------------------------------------------------
-- assets — o equipamento/ativo em si, sem regra de manutenção
-- ------------------------------------------------------------
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id) on delete cascade,
  asset_code text,
  name text not null,
  description text,
  category text not null default 'outro',
  location_id uuid references public.locations (id) on delete set null,
  -- Texto livre herdado de maintenance_items.location, preservado
  -- literalmente. Continua útil mesmo depois que a hierarquia existir.
  location_text text,
  manufacturer text,
  model text,
  serial_number text,
  installation_date date,
  warranty_until date,
  criticality text not null default 'media' check (criticality in ('baixa', 'media', 'alta', 'critica')),
  operational_status text not null default 'operando'
    check (operational_status in ('operando', 'parado', 'manutencao', 'desativado')),
  responsible_user_id uuid references public.profiles (id) on delete set null,
  supplier_id uuid references public.fornecedores (id) on delete set null,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_reason text
);

alter table public.assets enable row level security;

-- ------------------------------------------------------------
-- Carimbo automático do condomínio (mesmo padrão das demais tabelas):
-- o cliente nunca envia condominio_id, o servidor deriva de auth.uid().
-- ------------------------------------------------------------
drop trigger if exists stamp_condominio_id on public.locations;
create trigger stamp_condominio_id before insert on public.locations
  for each row execute function public.stamp_condominio_id();

drop trigger if exists stamp_condominio_id on public.assets;
create trigger stamp_condominio_id before insert on public.assets
  for each row execute function public.stamp_condominio_id();

-- ------------------------------------------------------------
-- RLS — mesma regra já consolidada em maintenance_items: todo mundo do
-- condomínio lê (o funcionário precisa consultar o ativo em campo),
-- só o síndico cadastra e edita. Registros excluídos logicamente somem
-- para quem não é síndico.
-- ------------------------------------------------------------
drop policy if exists "locations_select" on public.locations;
create policy "locations_select" on public.locations
  for select to authenticated
  using (
    (condominio_id = public.current_condominio_id() and (deleted_at is null or public.is_sindico()))
    or public.is_platform_admin()
  );

drop policy if exists "locations_write_sindico" on public.locations;
create policy "locations_write_sindico" on public.locations
  for all to authenticated
  using ((condominio_id = public.current_condominio_id() and public.is_sindico()) or public.is_platform_admin())
  with check ((condominio_id = public.current_condominio_id() and public.is_sindico()) or public.is_platform_admin());

drop policy if exists "assets_select" on public.assets;
create policy "assets_select" on public.assets
  for select to authenticated
  using (
    (condominio_id = public.current_condominio_id() and (deleted_at is null or public.is_sindico()))
    or public.is_platform_admin()
  );

drop policy if exists "assets_write_sindico" on public.assets;
create policy "assets_write_sindico" on public.assets
  for all to authenticated
  using ((condominio_id = public.current_condominio_id() and public.is_sindico()) or public.is_platform_admin())
  with check ((condominio_id = public.current_condominio_id() and public.is_sindico()) or public.is_platform_admin());

-- ------------------------------------------------------------
-- Auditoria (Fase 1) estendida às tabelas novas.
-- ------------------------------------------------------------
drop trigger if exists log_audit_locations on public.locations;
create trigger log_audit_locations
  after insert or update on public.locations
  for each row execute function public.log_audit_event('location');

drop trigger if exists log_audit_assets on public.assets;
create trigger log_audit_assets
  after insert or update on public.assets
  for each row execute function public.log_audit_event('asset');

-- ------------------------------------------------------------
-- Índices: condominio_id é filtro de toda policy de RLS; deleted_at
-- entra em quase todo select; os demais suportam as junções previstas.
-- ------------------------------------------------------------
create index if not exists locations_condominio_id_idx on public.locations (condominio_id);
create index if not exists locations_deleted_at_idx on public.locations (deleted_at);
create index if not exists locations_parent_id_idx on public.locations (parent_id);

create index if not exists assets_condominio_id_idx on public.assets (condominio_id);
create index if not exists assets_deleted_at_idx on public.assets (deleted_at);
create index if not exists assets_location_id_idx on public.assets (location_id);
create index if not exists assets_supplier_id_idx on public.assets (supplier_id);
create index if not exists assets_responsible_user_id_idx on public.assets (responsible_user_id);
