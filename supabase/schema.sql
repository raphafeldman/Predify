-- Sistema de Gestão Condominial — schema inicial
-- Como usar: Supabase Dashboard > SQL Editor > cole este arquivo inteiro > Run.
-- Pode rodar mais de uma vez sem erro (usa "if not exists" / "on conflict do nothing").

-- ============================================================
-- Extensões
-- ============================================================
create extension if not exists pgcrypto;
create extension if not exists pg_net;

-- ============================================================
-- profiles
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('sindico', 'funcionario')) default 'funcionario',
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid());

-- Função auxiliar: o usuário logado é síndico?
create or replace function public.is_sindico()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'sindico'
  );
$$;

-- Cria automaticamente uma linha em profiles quando um usuário é criado no
-- Authentication do Supabase. Defina nome/papel pelo campo "User Metadata"
-- ao criar o usuário no Dashboard, ex: {"full_name": "João", "role": "sindico"}
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'funcionario'),
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- maintenance_items (cronograma de manutenção preventiva)
-- ============================================================
create table if not exists public.maintenance_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  frequency text not null check (frequency in ('diaria', 'semanal', 'mensal', 'trimestral', 'semestral', 'anual')),
  next_due_date date not null,
  notes text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.maintenance_items enable row level security;

drop policy if exists "maintenance_items_select" on public.maintenance_items;
create policy "maintenance_items_select" on public.maintenance_items
  for select to authenticated using (true);

drop policy if exists "maintenance_items_write_sindico" on public.maintenance_items;
create policy "maintenance_items_write_sindico" on public.maintenance_items
  for all to authenticated using (public.is_sindico()) with check (public.is_sindico());

-- ============================================================
-- maintenance_records (execuções preventivas e corretivas)
-- ============================================================
create table if not exists public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  maintenance_item_id uuid references public.maintenance_items (id) on delete set null,
  type text not null check (type in ('preventiva', 'corretiva')),
  status text not null check (status in ('aberta', 'em_andamento', 'concluida')) default 'concluida',
  description text not null,
  photo_urls text[] not null default '{}',
  performed_by uuid not null references public.profiles (id),
  performed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.maintenance_records enable row level security;

drop policy if exists "maintenance_records_select" on public.maintenance_records;
create policy "maintenance_records_select" on public.maintenance_records
  for select to authenticated using (true);

drop policy if exists "maintenance_records_insert" on public.maintenance_records;
create policy "maintenance_records_insert" on public.maintenance_records
  for insert to authenticated with check (performed_by = auth.uid());

drop policy if exists "maintenance_records_update" on public.maintenance_records;
create policy "maintenance_records_update" on public.maintenance_records
  for update to authenticated using (performed_by = auth.uid() or public.is_sindico());

-- ============================================================
-- checklist_templates + checklist_entries (rotina diária)
-- ============================================================
create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  active boolean not null default true,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.checklist_templates enable row level security;

drop policy if exists "checklist_templates_select" on public.checklist_templates;
create policy "checklist_templates_select" on public.checklist_templates
  for select to authenticated using (true);

drop policy if exists "checklist_templates_write_sindico" on public.checklist_templates;
create policy "checklist_templates_write_sindico" on public.checklist_templates
  for all to authenticated using (public.is_sindico()) with check (public.is_sindico());

create table if not exists public.checklist_entries (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates (id) on delete cascade,
  entry_date date not null default current_date,
  done boolean not null default false,
  done_by uuid references public.profiles (id),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (template_id, entry_date)
);

alter table public.checklist_entries enable row level security;

drop policy if exists "checklist_entries_select" on public.checklist_entries;
create policy "checklist_entries_select" on public.checklist_entries
  for select to authenticated using (true);

drop policy if exists "checklist_entries_write" on public.checklist_entries;
create policy "checklist_entries_write" on public.checklist_entries
  for all to authenticated using (true) with check (true);

-- ============================================================
-- tasks (tarefas avulsas: limpeza, organização, encomendas...)
-- ============================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null check (status in ('pendente', 'concluida')) default 'pendente',
  photo_urls text[] not null default '{}',
  created_by uuid not null references public.profiles (id),
  assigned_to uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.tasks enable row level security;

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select to authenticated using (true);

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update to authenticated using (true);

-- ============================================================
-- occurrences (intercorrências)
-- ============================================================
create table if not exists public.occurrences (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  severity text not null check (severity in ('baixa', 'media', 'alta')) default 'media',
  status text not null check (status in ('aberta', 'resolvida')) default 'aberta',
  photo_urls text[] not null default '{}',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.occurrences enable row level security;

drop policy if exists "occurrences_select" on public.occurrences;
create policy "occurrences_select" on public.occurrences
  for select to authenticated using (true);

drop policy if exists "occurrences_insert" on public.occurrences;
create policy "occurrences_insert" on public.occurrences
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "occurrences_update" on public.occurrences;
create policy "occurrences_update" on public.occurrences
  for update to authenticated using (created_by = auth.uid() or public.is_sindico());

-- ============================================================
-- documents (fotos de documentos)
-- ============================================================
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'geral',
  photo_url text not null,
  notes text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.documents enable row level security;

drop policy if exists "documents_select" on public.documents;
create policy "documents_select" on public.documents
  for select to authenticated using (true);

drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert" on public.documents
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "documents_delete" on public.documents;
create policy "documents_delete" on public.documents
  for delete to authenticated using (created_by = auth.uid() or public.is_sindico());

-- ============================================================
-- comments (interação em qualquer registro acima)
-- ============================================================
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (
    record_type in ('occurrence', 'maintenance_record', 'task', 'checklist_entry', 'document')
  ),
  record_id uuid not null,
  author_id uuid not null references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_record_idx on public.comments (record_type, record_id);

alter table public.comments enable row level security;

drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments
  for select to authenticated using (true);

drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments
  for insert to authenticated with check (author_id = auth.uid());

-- ============================================================
-- push_tokens
-- ============================================================
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null unique,
  created_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_own" on public.push_tokens;
create policy "push_tokens_own" on public.push_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- Realtime (feed do síndico atualiza sozinho)
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'occurrences'
  ) then
    alter publication supabase_realtime add table public.occurrences;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;

-- ============================================================
-- Storage: bucket único "photos" para todas as fotos do app
-- ============================================================
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "photos_select_authenticated" on storage.objects;
create policy "photos_select_authenticated" on storage.objects
  for select to authenticated using (bucket_id = 'photos');

drop policy if exists "photos_insert_authenticated" on storage.objects;
create policy "photos_insert_authenticated" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');

drop policy if exists "photos_delete_own_or_sindico" on storage.objects;
create policy "photos_delete_own_or_sindico" on storage.objects
  for delete to authenticated using (
    bucket_id = 'photos' and (owner = auth.uid() or public.is_sindico())
  );

-- ============================================================
-- Notificação push automática ao síndico quando surge uma intercorrência
-- (usa pg_net para chamar a API de push da Expo direto do banco)
-- ============================================================
create or replace function public.notify_sindico_on_occurrence()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  token record;
begin
  for token in
    select pt.expo_push_token
    from public.push_tokens pt
    join public.profiles p on p.id = pt.user_id
    where p.role = 'sindico'
  loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'to', token.expo_push_token,
        'title', 'Nova intercorrência: ' || new.title,
        'body', left(new.description, 120),
        'data', jsonb_build_object('occurrence_id', new.id)
      )
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists on_occurrence_created on public.occurrences;
create trigger on_occurrence_created
  after insert on public.occurrences
  for each row execute function public.notify_sindico_on_occurrence();

-- ============================================================
-- Migração: rotina com foto/observação por item
-- ============================================================
alter table public.checklist_entries add column if not exists notes text;
alter table public.checklist_entries add column if not exists photo_urls text[] not null default '{}';

-- ============================================================
-- Migração: documentos passam a aceitar qualquer tipo de arquivo
-- (não só foto) — renomeia photo_url -> file_url e adiciona metadados
-- ============================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'photo_url'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'file_url'
  ) then
    alter table public.documents rename column photo_url to file_url;
  end if;
end $$;

alter table public.documents add column if not exists file_name text;
alter table public.documents add column if not exists mime_type text not null default 'image/jpeg';

-- ============================================================
-- Migração: agendamento de tarefas (síndico atribui a um funcionário
-- com data). "assigned_to" já existia no schema original.
-- ============================================================
alter table public.tasks add column if not exists scheduled_for date;

-- ============================================================
-- Migração: bloqueio de usuários pelo síndico
-- ============================================================
alter table public.profiles add column if not exists active boolean not null default true;

-- Corrige uma brecha do schema original: a política antiga deixava
-- qualquer usuário alterar sua própria coluna "role". Agora só o síndico
-- pode mudar role/active de alguém (inclusive de si mesmo); cada um
-- continua podendo editar seu próprio nome/telefone/avatar livremente.
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_sindico()
    and (new.role is distinct from old.role or new.active is distinct from old.active)
  then
    raise exception 'Apenas o síndico pode alterar papel ou status de um usuário.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileged_fields on public.profiles;
create trigger protect_profile_privileged_fields
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_fields();

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_sindico());

-- ============================================================
-- Migração: equipamentos (dados extras) + avanço automático da
-- próxima manutenção + aviso de vencimento
-- ============================================================
alter table public.maintenance_items add column if not exists location text;
alter table public.maintenance_items add column if not exists brand text;
alter table public.maintenance_items add column if not exists model text;
alter table public.maintenance_items add column if not exists serial_number text;
alter table public.maintenance_items add column if not exists assigned_to uuid references public.profiles (id);

create or replace function public.frequency_interval(freq text)
returns interval
language sql
immutable
as $$
  select case freq
    when 'diaria' then interval '1 day'
    when 'semanal' then interval '1 week'
    when 'mensal' then interval '1 month'
    when 'trimestral' then interval '3 months'
    when 'semestral' then interval '6 months'
    when 'anual' then interval '1 year'
    else interval '1 month'
  end;
$$;

-- Depois de registrar uma manutenção preventiva ligada a um equipamento,
-- avança sozinha a próxima data de vencimento a partir da frequência dele.
create or replace function public.advance_maintenance_item_next_due()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_frequency text;
begin
  if new.type = 'preventiva' and new.maintenance_item_id is not null then
    select frequency into item_frequency
    from public.maintenance_items
    where id = new.maintenance_item_id;

    if item_frequency is not null then
      update public.maintenance_items
      set next_due_date = (new.performed_at::date + public.frequency_interval(item_frequency))
      where id = new.maintenance_item_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_maintenance_record_advance_due on public.maintenance_records;
create trigger on_maintenance_record_advance_due
  after insert on public.maintenance_records
  for each row execute function public.advance_maintenance_item_next_due();

-- Aviso automático (push) ao síndico quando um equipamento está a 7 dias
-- (ou menos) do vencimento, ou já vencido. Roda uma vez por dia via pg_cron.
create extension if not exists pg_cron;

create or replace function public.notify_maintenance_due()
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  item record;
  token record;
begin
  for item in
    select * from public.maintenance_items
    where next_due_date <= current_date + interval '7 days'
  loop
    for token in
      select pt.expo_push_token
      from public.push_tokens pt
      join public.profiles p on p.id = pt.user_id
      where p.role = 'sindico'
    loop
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'to', token.expo_push_token,
          'title', case
            when item.next_due_date < current_date then 'Manutenção vencida: ' || item.name
            else 'Manutenção vencendo: ' || item.name
          end,
          'body', 'Próxima data: ' || to_char(item.next_due_date, 'DD/MM/YYYY'),
          'data', jsonb_build_object('maintenance_item_id', item.id)
        )
      );
    end loop;
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'check-maintenance-due') then
    perform cron.unschedule('check-maintenance-due');
  end if;
  perform cron.schedule('check-maintenance-due', '0 8 * * *', $cron$select public.notify_maintenance_due();$cron$);
end $$;

-- ============================================================
-- Migração: rotinas com periodicidade e responsável
-- ============================================================
alter table public.checklist_templates
  add column if not exists frequency text not null default 'diaria'
  check (frequency in ('diaria', 'semanal', 'mensal', 'trimestral', 'semestral', 'anual'));
alter table public.checklist_templates add column if not exists assigned_to uuid references public.profiles (id);

-- ============================================================
-- Migração: dados do condomínio (aparecem no cabeçalho dos relatórios)
-- ============================================================
create table if not exists public.condominio_settings (
  id integer primary key default 1 check (id = 1),
  name text,
  cnpj text,
  address text,
  phone text,
  administradora text,
  updated_at timestamptz not null default now()
);

insert into public.condominio_settings (id) values (1) on conflict (id) do nothing;

alter table public.condominio_settings enable row level security;

drop policy if exists "condominio_settings_select" on public.condominio_settings;
create policy "condominio_settings_select" on public.condominio_settings
  for select to authenticated using (true);

drop policy if exists "condominio_settings_write_sindico" on public.condominio_settings;
create policy "condominio_settings_write_sindico" on public.condominio_settings
  for all to authenticated using (public.is_sindico()) with check (public.is_sindico());

-- ============================================================
-- Migração: multi-tenant — cada condomínio é um cliente
-- independente, sem acesso aos dados dos outros.
-- ============================================================

-- ------------------------------------------------------------
-- condominios (um por cliente) + platform_admins (administrador
-- da plataforma, não pertence a nenhum condomínio específico)
-- ------------------------------------------------------------
create table if not exists public.condominios (
  id uuid primary key default gen_random_uuid(),
  name text,
  cnpj text,
  address text,
  phone text,
  administradora text,
  plan text not null default 'free' check (plan in ('free', 'paid')),
  paid_seats integer not null default 0,
  billing_status text not null default 'trialing'
    check (billing_status in ('trialing', 'active', 'exempt', 'suspended')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.condominios enable row level security;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

drop policy if exists "platform_admins_select_self" on public.platform_admins;
create policy "platform_admins_select_self" on public.platform_admins
  for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());

-- ------------------------------------------------------------
-- profiles ganha condominio_id + função auxiliar current_condominio_id()
-- ------------------------------------------------------------
alter table public.profiles add column if not exists condominio_id uuid references public.condominios (id);

create or replace function public.current_condominio_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select condominio_id from public.profiles where id = auth.uid();
$$;

-- ------------------------------------------------------------
-- Cria o primeiro condomínio a partir dos dados que já existiam em
-- condominio_settings (o prédio do próprio síndico), e migra todo
-- profile existente (sem condominio_id ainda) pra ele. Só roda uma
-- vez — se já existe algum condomínio, não faz nada.
-- ------------------------------------------------------------
do $$
declare
  v_condominio_id uuid;
begin
  if not exists (select 1 from public.condominios) then
    if exists (select 1 from public.condominio_settings where id = 1) then
      insert into public.condominios (name, cnpj, address, phone, administradora, plan, paid_seats, billing_status)
      select coalesce(name, 'Meu Condomínio'), cnpj, address, phone, administradora, 'paid', 999, 'exempt'
      from public.condominio_settings
      where id = 1
      returning id into v_condominio_id;
    else
      insert into public.condominios (name, plan, paid_seats, billing_status)
      values ('Meu Condomínio', 'paid', 999, 'exempt')
      returning id into v_condominio_id;
    end if;

    update public.profiles set condominio_id = v_condominio_id where condominio_id is null;
  end if;
end $$;

alter table public.profiles alter column condominio_id set not null;

drop table if exists public.condominio_settings;

-- ------------------------------------------------------------
-- condominio_id em toda tabela "de dados do condomínio" +
-- preenchimento automático via gatilho (sempre sobrescreve com o
-- condomínio de quem está logado — o cliente nunca escolhe isso)
-- ------------------------------------------------------------
do $$
declare
  t text;
  default_condominio uuid;
begin
  select id into default_condominio from public.condominios order by created_at limit 1;

  foreach t in array array[
    'maintenance_items', 'maintenance_records', 'checklist_templates',
    'checklist_entries', 'tasks', 'occurrences', 'documents', 'comments'
  ]
  loop
    execute format('alter table public.%I add column if not exists condominio_id uuid', t);
    execute format('update public.%I set condominio_id = $1 where condominio_id is null', t) using default_condominio;
    execute format('alter table public.%I alter column condominio_id set not null', t);
    begin
      execute format(
        'alter table public.%I add constraint %I foreign key (condominio_id) references public.condominios (id)',
        t, t || '_condominio_id_fkey'
      );
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

create or replace function public.stamp_condominio_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.condominio_id := public.current_condominio_id();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'maintenance_items', 'maintenance_records', 'checklist_templates',
    'checklist_entries', 'tasks', 'occurrences', 'documents', 'comments'
  ]
  loop
    execute format('drop trigger if exists stamp_condominio_id on public.%I', t);
    execute format(
      'create trigger stamp_condominio_id before insert on public.%I for each row execute function public.stamp_condominio_id()',
      t
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- Políticas RLS: toda leitura passa a exigir mesmo condomínio (ou
-- ser administrador da plataforma); toda escrita hoje restrita a
-- "is_sindico()" passa também a exigir mesmo condomínio.
-- ------------------------------------------------------------
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated
  using (condominio_id = public.current_condominio_id() or public.is_platform_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (
    id = auth.uid()
    or (condominio_id = public.current_condominio_id() and public.is_sindico())
    or public.is_platform_admin()
  );

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() and new.condominio_id is distinct from old.condominio_id then
    raise exception 'Apenas o administrador da plataforma pode mover um usuário de condomínio.';
  end if;
  if not public.is_sindico()
    and not public.is_platform_admin()
    and (new.role is distinct from old.role or new.active is distinct from old.active)
  then
    raise exception 'Apenas o síndico pode alterar papel ou status de um usuário.';
  end if;
  return new;
end;
$$;

drop policy if exists "maintenance_items_select" on public.maintenance_items;
create policy "maintenance_items_select" on public.maintenance_items
  for select to authenticated
  using (condominio_id = public.current_condominio_id() or public.is_platform_admin());

drop policy if exists "maintenance_items_write_sindico" on public.maintenance_items;
create policy "maintenance_items_write_sindico" on public.maintenance_items
  for all to authenticated
  using ((condominio_id = public.current_condominio_id() and public.is_sindico()) or public.is_platform_admin())
  with check ((condominio_id = public.current_condominio_id() and public.is_sindico()) or public.is_platform_admin());

drop policy if exists "maintenance_records_select" on public.maintenance_records;
create policy "maintenance_records_select" on public.maintenance_records
  for select to authenticated
  using (condominio_id = public.current_condominio_id() or public.is_platform_admin());

drop policy if exists "maintenance_records_update" on public.maintenance_records;
create policy "maintenance_records_update" on public.maintenance_records
  for update to authenticated
  using (
    ((performed_by = auth.uid() or public.is_sindico()) and condominio_id = public.current_condominio_id())
    or public.is_platform_admin()
  );

drop policy if exists "checklist_templates_select" on public.checklist_templates;
create policy "checklist_templates_select" on public.checklist_templates
  for select to authenticated
  using (condominio_id = public.current_condominio_id() or public.is_platform_admin());

drop policy if exists "checklist_templates_write_sindico" on public.checklist_templates;
create policy "checklist_templates_write_sindico" on public.checklist_templates
  for all to authenticated
  using ((condominio_id = public.current_condominio_id() and public.is_sindico()) or public.is_platform_admin())
  with check ((condominio_id = public.current_condominio_id() and public.is_sindico()) or public.is_platform_admin());

drop policy if exists "checklist_entries_select" on public.checklist_entries;
create policy "checklist_entries_select" on public.checklist_entries
  for select to authenticated
  using (condominio_id = public.current_condominio_id() or public.is_platform_admin());

drop policy if exists "checklist_entries_write" on public.checklist_entries;
create policy "checklist_entries_write" on public.checklist_entries
  for all to authenticated
  using (condominio_id = public.current_condominio_id() or public.is_platform_admin())
  with check (condominio_id = public.current_condominio_id() or public.is_platform_admin());

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select to authenticated
  using (condominio_id = public.current_condominio_id() or public.is_platform_admin());

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update to authenticated
  using (condominio_id = public.current_condominio_id() or public.is_platform_admin());

drop policy if exists "occurrences_select" on public.occurrences;
create policy "occurrences_select" on public.occurrences
  for select to authenticated
  using (condominio_id = public.current_condominio_id() or public.is_platform_admin());

drop policy if exists "occurrences_update" on public.occurrences;
create policy "occurrences_update" on public.occurrences
  for update to authenticated
  using (
    ((created_by = auth.uid() or public.is_sindico()) and condominio_id = public.current_condominio_id())
    or public.is_platform_admin()
  );

drop policy if exists "documents_select" on public.documents;
create policy "documents_select" on public.documents
  for select to authenticated
  using (condominio_id = public.current_condominio_id() or public.is_platform_admin());

drop policy if exists "documents_delete" on public.documents;
create policy "documents_delete" on public.documents
  for delete to authenticated
  using (
    ((created_by = auth.uid() or public.is_sindico()) and condominio_id = public.current_condominio_id())
    or public.is_platform_admin()
  );

drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments
  for select to authenticated
  using (condominio_id = public.current_condominio_id() or public.is_platform_admin());

-- condominios: síndico lê/edita dados descritivos do próprio; só o
-- administrador da plataforma cria condomínio novo ou mexe em
-- plano/assentos pagos/status de cobrança.
drop policy if exists "condominios_select" on public.condominios;
create policy "condominios_select" on public.condominios
  for select to authenticated
  using (id = public.current_condominio_id() or public.is_platform_admin());

drop policy if exists "condominios_insert_admin" on public.condominios;
create policy "condominios_insert_admin" on public.condominios
  for insert to authenticated with check (public.is_platform_admin());

drop policy if exists "condominios_update" on public.condominios;
create policy "condominios_update" on public.condominios
  for update to authenticated
  using ((id = public.current_condominio_id() and public.is_sindico()) or public.is_platform_admin());

create or replace function public.protect_condominio_billing_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin()
    and (
      new.plan is distinct from old.plan
      or new.paid_seats is distinct from old.paid_seats
      or new.billing_status is distinct from old.billing_status
    )
  then
    raise exception 'Apenas o administrador da plataforma pode alterar plano/cobrança.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_condominio_billing_fields on public.condominios;
create trigger protect_condominio_billing_fields
  before update on public.condominios
  for each row execute function public.protect_condominio_billing_fields();

-- ------------------------------------------------------------
-- Storage: as fotos também ficam isoladas por condomínio — o
-- caminho do arquivo agora começa com o id do condomínio
-- (condominioId/pasta/usuarioId/arquivo), e a política de acesso
-- confere esse primeiro pedaço do caminho.
-- ------------------------------------------------------------
drop policy if exists "photos_select_authenticated" on storage.objects;
create policy "photos_select_authenticated" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and ((storage.foldername(name))[1] = public.current_condominio_id()::text or public.is_platform_admin())
  );

drop policy if exists "photos_insert_authenticated" on storage.objects;
create policy "photos_insert_authenticated" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = public.current_condominio_id()::text);

drop policy if exists "photos_delete_own_or_sindico" on storage.objects;
create policy "photos_delete_own_or_sindico" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and (owner = auth.uid() or public.is_sindico())
    and ((storage.foldername(name))[1] = public.current_condominio_id()::text or public.is_platform_admin())
  );

-- ------------------------------------------------------------
-- Notificações push não podem mais avisar síndicos de outros
-- condomínios quando surge uma ocorrência ou manutenção vencendo.
-- ------------------------------------------------------------
create or replace function public.notify_sindico_on_occurrence()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  token record;
begin
  for token in
    select pt.expo_push_token
    from public.push_tokens pt
    join public.profiles p on p.id = pt.user_id
    where p.role = 'sindico' and p.condominio_id = new.condominio_id
  loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'to', token.expo_push_token,
        'title', 'Nova intercorrência: ' || new.title,
        'body', left(new.description, 120),
        'data', jsonb_build_object('occurrence_id', new.id)
      )
    );
  end loop;
  return new;
end;
$$;

create or replace function public.notify_maintenance_due()
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  item record;
  token record;
begin
  for item in
    select * from public.maintenance_items
    where next_due_date <= current_date + interval '7 days'
  loop
    for token in
      select pt.expo_push_token
      from public.push_tokens pt
      join public.profiles p on p.id = pt.user_id
      where p.role = 'sindico' and p.condominio_id = item.condominio_id
    loop
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'to', token.expo_push_token,
          'title', case
            when item.next_due_date < current_date then 'Manutenção vencida: ' || item.name
            else 'Manutenção vencendo: ' || item.name
          end,
          'body', 'Próxima data: ' || to_char(item.next_due_date, 'DD/MM/YYYY'),
          'data', jsonb_build_object('maintenance_item_id', item.id)
        )
      );
    end loop;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- handle_new_user passa a também ler condominio_id do metadata
-- (preenchido pelo administrador da plataforma ao criar o primeiro
-- síndico de um condomínio novo, e pela Edge Function admin-users
-- ao criar um funcionário — sempre o mesmo condomínio de quem criou).
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, phone, condominio_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'funcionario'),
    new.raw_user_meta_data ->> 'phone',
    nullif(new.raw_user_meta_data ->> 'condominio_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ============================================================
-- Migração: prestadores de serviço / solicitações de orçamento
-- ============================================================
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id),
  occurrence_id uuid references public.occurrences (id) on delete set null,
  title text not null,
  category text not null default 'outro',
  status text not null default 'aberta'
    check (status in ('aberta', 'orcamento_solicitado', 'orcado', 'aprovado', 'concluido', 'cancelado')),
  provider_name text,
  provider_contact text,
  quote_value numeric,
  notes text,
  photo_urls text[] not null default '{}',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_requests enable row level security;

drop policy if exists "service_requests_select" on public.service_requests;
create policy "service_requests_select" on public.service_requests
  for select to authenticated
  using (condominio_id = public.current_condominio_id() or public.is_platform_admin());

drop policy if exists "service_requests_insert" on public.service_requests;
create policy "service_requests_insert" on public.service_requests
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "service_requests_update" on public.service_requests;
create policy "service_requests_update" on public.service_requests
  for update to authenticated
  using (condominio_id = public.current_condominio_id() or public.is_platform_admin());

drop trigger if exists stamp_condominio_id on public.service_requests;
create trigger stamp_condominio_id
  before insert on public.service_requests
  for each row execute function public.stamp_condominio_id();

-- Comentários também podem ser feitos em solicitações de orçamento.
alter table public.comments drop constraint if exists comments_record_type_check;
alter table public.comments add constraint comments_record_type_check
  check (record_type in ('occurrence', 'maintenance_record', 'task', 'checklist_entry', 'document', 'service_request'));

-- ============================================================
-- Migração: cadastro self-service — a pessoa baixa o app, cria a
-- própria conta e, em seguida, cria seu próprio condomínio (fica
-- automaticamente síndico dele). O fluxo de administrador criar
-- condomínio + primeiro síndico manualmente continua existindo,
-- útil pra suporte, mas deixa de ser o único caminho.
-- ============================================================

-- Conta recém-criada ainda não pertence a nenhum condomínio.
alter table public.profiles alter column condominio_id drop not null;

-- Sem isso, um usuário sem condomínio (condominio_id null) não conseguia
-- nem ler a própria linha em profiles: a política antiga só liberava
-- select quando condominio_id batia com current_condominio_id(), e
-- "null = null" nunca é verdadeiro em SQL.
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or condominio_id = public.current_condominio_id()
    or public.is_platform_admin()
  );

-- Permite a transição única "sem condomínio -> tenho meu condomínio,
-- viro síndico dele", mas só quando ela vem da função
-- create_own_condominio() abaixo (sinalizado pela variável de sessão
-- app.claiming_condominio) — uma chamada direta de update pelo cliente
-- não consegue definir essa variável, então não dá pra "entrar" num
-- condomínio de outra pessoa só chamando update em profiles.
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claiming boolean := coalesce(current_setting('app.claiming_condominio', true), 'false') = 'true';
begin
  if new.condominio_id is distinct from old.condominio_id then
    if old.condominio_id is not null and not public.is_platform_admin() then
      raise exception 'Apenas o administrador da plataforma pode mover um usuário de condomínio.';
    end if;
    if old.condominio_id is null and not public.is_platform_admin() and not claiming then
      raise exception 'Use a função de criar condomínio para associar sua conta a um condomínio.';
    end if;
  end if;

  if not public.is_sindico()
    and not public.is_platform_admin()
    and (new.role is distinct from old.role or new.active is distinct from old.active)
    and not (claiming and new.role = 'sindico' and new.active = old.active)
  then
    raise exception 'Apenas o síndico pode alterar papel ou status de um usuário.';
  end if;

  return new;
end;
$$;

-- Cria um condomínio novo em nome de quem está logado e o promove a
-- síndico dele. Só funciona uma vez por conta (quem já tem condomínio
-- não consegue trocar por aqui — só o administrador da plataforma move
-- alguém de condomínio).
create or replace function public.create_own_condominio(
  p_name text,
  p_cnpj text default null,
  p_address text default null,
  p_phone text default null,
  p_administradora text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_condominio_id uuid;
  v_current uuid;
begin
  if auth.uid() is null then
    raise exception 'Você precisa estar logado.';
  end if;

  select condominio_id into v_current from public.profiles where id = auth.uid();
  if v_current is not null then
    raise exception 'Sua conta já está associada a um condomínio.';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Dê um nome para o condomínio.';
  end if;

  insert into public.condominios (name, cnpj, address, phone, administradora, created_by)
  values (
    nullif(trim(p_name), ''),
    nullif(trim(coalesce(p_cnpj, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_administradora, '')), ''),
    auth.uid()
  )
  returning id into v_condominio_id;

  perform set_config('app.claiming_condominio', 'true', true);

  update public.profiles
  set condominio_id = v_condominio_id, role = 'sindico'
  where id = auth.uid();

  return v_condominio_id;
end;
$$;

revoke execute on function public.create_own_condominio(text, text, text, text, text) from public;
grant execute on function public.create_own_condominio(text, text, text, text, text) to authenticated;

-- ============================================================
-- Migração: estatísticas de uso por condomínio (pro administrador
-- da plataforma acompanhar volume de dados/armazenamento de cada
-- condomínio — útil pra suporte e, futuramente, pra cobrança).
-- ============================================================
create or replace function public.condominio_usage_stats()
returns table (
  condominio_id uuid,
  users_count bigint,
  occurrences_count bigint,
  tasks_count bigint,
  maintenance_items_count bigint,
  maintenance_records_count bigint,
  documents_count bigint,
  checklist_entries_count bigint,
  service_requests_count bigint,
  photos_count bigint,
  photos_bytes bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Apenas o administrador da plataforma pode ver estatísticas de uso.';
  end if;

  return query
  select
    c.id,
    (select count(*) from public.profiles p where p.condominio_id = c.id),
    (select count(*) from public.occurrences o where o.condominio_id = c.id),
    (select count(*) from public.tasks t where t.condominio_id = c.id),
    (select count(*) from public.maintenance_items mi where mi.condominio_id = c.id),
    (select count(*) from public.maintenance_records m where m.condominio_id = c.id),
    (select count(*) from public.documents d where d.condominio_id = c.id),
    (
      select count(*)
      from public.checklist_entries ce
      join public.checklist_templates ct on ct.id = ce.template_id
      where ct.condominio_id = c.id
    ),
    (select count(*) from public.service_requests sr where sr.condominio_id = c.id),
    (
      select count(*)
      from storage.objects so
      where so.bucket_id = 'photos' and (storage.foldername(so.name))[1] = c.id::text
    ),
    (
      select coalesce(sum((so.metadata ->> 'size')::bigint), 0)
      from storage.objects so
      where so.bucket_id = 'photos' and (storage.foldername(so.name))[1] = c.id::text
    )
  from public.condominios c;
end;
$$;

revoke execute on function public.condominio_usage_stats() from public;
grant execute on function public.condominio_usage_stats() to authenticated;

-- ============================================================
-- Migração: Ordens de Serviço — a Ocorrência ganha número de OS
-- (sequencial por condomínio), categoria, custo estimado e um status
-- intermediário "em_andamento". Continua sendo a mesma tabela
-- (occurrences) por baixo dos panos; só o nome visível pro usuário muda.
-- ============================================================

-- Contador por condomínio, usado pra gerar o número da próxima OS.
alter table public.condominios add column if not exists next_os_number integer not null default 1;

alter table public.occurrences add column if not exists os_number integer;
alter table public.occurrences add column if not exists category text not null default 'outro';
alter table public.occurrences add column if not exists estimated_cost numeric;

alter table public.occurrences drop constraint if exists occurrences_category_check;
alter table public.occurrences add constraint occurrences_category_check
  check (category in ('infiltracao', 'eletrica', 'hidraulica', 'estrutural', 'pintura', 'portas_janelas', 'elevador', 'outro'));

-- Status ganha "em_andamento" e "cancelada"; "resolvida" vira "concluida".
update public.occurrences set status = 'concluida' where status = 'resolvida';
alter table public.occurrences drop constraint if exists occurrences_status_check;
alter table public.occurrences add constraint occurrences_status_check
  check (status in ('aberta', 'em_andamento', 'concluida', 'cancelada'));

-- Preenche os_number das ordens já existentes, sequencial por condomínio
-- (ordenado pela data de criação), e ajusta o contador de cada condomínio
-- pra continuar dali em diante.
update public.occurrences o
set os_number = sub.rn
from (
  select id, row_number() over (partition by condominio_id order by created_at) as rn
  from public.occurrences
  where os_number is null
) sub
where o.id = sub.id;

update public.condominios c
set next_os_number = sub.next_number
from (
  select condominio_id, max(os_number) + 1 as next_number
  from public.occurrences
  group by condominio_id
) sub
where c.id = sub.condominio_id;

alter table public.occurrences alter column os_number set not null;
alter table public.occurrences drop constraint if exists occurrences_os_number_unique;
alter table public.occurrences add constraint occurrences_os_number_unique unique (condominio_id, os_number);

-- Preenche o número da OS sozinho, incrementando o contador do condomínio
-- de forma atômica (evita duas ordens criadas ao mesmo tempo com o mesmo
-- número). Precisa rodar depois de stamp_condominio_id — o nome
-- "stamp_os_number" vem depois de "stamp_condominio_id" em ordem
-- alfabética, que é a ordem que o Postgres usa pra disparar gatilhos
-- BEFORE INSERT do mesmo tipo na mesma tabela.
create or replace function public.stamp_os_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  update public.condominios
  set next_os_number = next_os_number + 1
  where id = new.condominio_id
  returning next_os_number - 1 into v_number;
  new.os_number := v_number;
  return new;
end;
$$;

drop trigger if exists stamp_os_number on public.occurrences;
create trigger stamp_os_number
  before insert on public.occurrences
  for each row execute function public.stamp_os_number();

-- ============================================================
-- Migração: cargos de equipe, ordens atribuíveis, visibilidade privada
-- por criador/atribuído (Ordens, Documentos, Tarefas) e portal de
-- mensagens. Rotina e Manutenção continuam visíveis pra toda a equipe do
-- condomínio, de propósito (ver notas no plano/commit).
-- ============================================================

-- Cargo é só rótulo de exibição — a permissão continua vindo de "role"
-- (sindico/funcionario). Síndico não usa esse campo.
alter table public.profiles add column if not exists job_title text;
alter table public.profiles drop constraint if exists profiles_job_title_check;
alter table public.profiles add constraint profiles_job_title_check
  check (job_title is null or job_title in ('zelador', 'manutencista_1', 'manutencista_2', 'porteiro', 'faxineiro', 'outro'));

-- handle_new_user passa a também gravar o cargo vindo do metadata (setado
-- pela Edge Function admin-users).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, phone, condominio_id, job_title)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'funcionario'),
    new.raw_user_meta_data ->> 'phone',
    (new.raw_user_meta_data ->> 'condominio_id')::uuid,
    new.raw_user_meta_data ->> 'job_title'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Síndico atribui uma ordem de serviço a um funcionário pra ele resolver
-- (mesmo padrão já usado em tasks/maintenance_items/checklist_templates).
alter table public.occurrences add column if not exists assigned_to uuid references public.profiles (id);

-- Visibilidade: funcionário só vê o que ele criou (ou pro que foi
-- designado); síndico sempre vê tudo do condomínio.
drop policy if exists "occurrences_select" on public.occurrences;
create policy "occurrences_select" on public.occurrences
  for select to authenticated
  using (
    (
      condominio_id = public.current_condominio_id()
      and (created_by = auth.uid() or assigned_to = auth.uid() or public.is_sindico())
    )
    or public.is_platform_admin()
  );

drop policy if exists "occurrences_update" on public.occurrences;
create policy "occurrences_update" on public.occurrences
  for update to authenticated
  using (
    (
      (created_by = auth.uid() or assigned_to = auth.uid() or public.is_sindico())
      and condominio_id = public.current_condominio_id()
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
    )
    or public.is_platform_admin()
  );

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update to authenticated
  using (
    (
      condominio_id = public.current_condominio_id()
      and (created_by = auth.uid() or assigned_to = auth.uid() or public.is_sindico())
    )
    or public.is_platform_admin()
  );

-- comments_select precisa acompanhar a mesma regra do registro pai —
-- senão dava pra ler o comentário de uma ordem/documento/tarefa que a
-- pessoa não tem mais acesso pra ver na tela. Rotina, manutenção e
-- solicitação de orçamento continuam liberados pra toda a equipe do
-- condomínio, sem mudança.
drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments
  for select to authenticated
  using (
    condominio_id = public.current_condominio_id()
    and (
      (record_type = 'occurrence' and exists (
        select 1 from public.occurrences o
        where o.id = comments.record_id
          and (o.created_by = auth.uid() or o.assigned_to = auth.uid() or public.is_sindico())
      ))
      or (record_type = 'document' and exists (
        select 1 from public.documents d
        where d.id = comments.record_id
          and (d.created_by = auth.uid() or public.is_sindico())
      ))
      or (record_type = 'task' and exists (
        select 1 from public.tasks t
        where t.id = comments.record_id
          and (t.created_by = auth.uid() or t.assigned_to = auth.uid() or public.is_sindico())
      ))
      or record_type in ('maintenance_record', 'checklist_entry', 'service_request')
    )
    or public.is_platform_admin()
  );

-- ============================================================
-- Portal de mensagens: notificações internas (independente do push, que
-- pode falhar/ser ignorado) — cada usuário só vê as suas.
-- ============================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  record_type text,
  record_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications
  for update to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

-- Sem política de insert: só os gatilhos abaixo (security definer)
-- escrevem aqui.

create or replace function public.notify_os_assigned()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  token record;
begin
  if new.assigned_to is not null and new.assigned_to is distinct from old.assigned_to then
    insert into public.notifications (condominio_id, user_id, title, body, record_type, record_id)
    values (
      new.condominio_id,
      new.assigned_to,
      'Nova ordem de serviço atribuída a você',
      'OS #' || new.os_number || ' — ' || left(new.title, 100),
      'occurrence',
      new.id
    );

    for token in
      select expo_push_token from public.push_tokens where user_id = new.assigned_to
    loop
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'to', token.expo_push_token,
          'title', 'Nova ordem de serviço atribuída a você',
          'body', 'OS #' || new.os_number || ' — ' || left(new.title, 100),
          'data', jsonb_build_object('occurrence_id', new.id)
        )
      );
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists on_occurrence_assigned on public.occurrences;
create trigger on_occurrence_assigned
  after update on public.occurrences
  for each row execute function public.notify_os_assigned();

create or replace function public.notify_os_completed()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  sindico record;
  token record;
begin
  if new.status = 'concluida' and old.status is distinct from new.status and new.assigned_to is not null then
    for sindico in
      select id from public.profiles
      where role = 'sindico' and condominio_id = new.condominio_id and active = true
    loop
      insert into public.notifications (condominio_id, user_id, title, body, record_type, record_id)
      values (
        new.condominio_id,
        sindico.id,
        'Ordem de serviço concluída',
        'OS #' || new.os_number || ' — ' || left(new.title, 100),
        'occurrence',
        new.id
      );

      for token in
        select expo_push_token from public.push_tokens where user_id = sindico.id
      loop
        perform net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := jsonb_build_object(
            'to', token.expo_push_token,
            'title', 'Ordem de serviço concluída',
            'body', 'OS #' || new.os_number || ' — ' || left(new.title, 100),
            'data', jsonb_build_object('occurrence_id', new.id)
          )
        );
      end loop;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists on_occurrence_completed on public.occurrences;
create trigger on_occurrence_completed
  after update on public.occurrences
  for each row execute function public.notify_os_completed();

-- ============================================================
-- Migração: agente de WhatsApp (fase 1 — só envio: lembrete diário de
-- pendências e aviso avulso do síndico). O token de verdade da Meta nunca
-- entra aqui — mora só nas Edge Functions (Deno.env), mesmo padrão de
-- SUPABASE_SERVICE_ROLE_KEY. O gatilho de cron abaixo só chama a Edge
-- Function usando a anon key (pública, não é segredo).
-- ============================================================
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id),
  user_id uuid not null references public.profiles (id),
  phone text not null,
  kind text not null check (kind in ('lembrete_diario', 'aviso_sindico')),
  body text not null,
  status text not null check (status in ('enviado', 'falha')),
  error text,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_messages enable row level security;

drop policy if exists "whatsapp_messages_select" on public.whatsapp_messages;
create policy "whatsapp_messages_select" on public.whatsapp_messages
  for select to authenticated
  using (
    (condominio_id = public.current_condominio_id() and public.is_sindico())
    or public.is_platform_admin()
  );

-- Sem política de insert: só as Edge Functions (service role) escrevem.

-- IMPORTANTE: troque <SUA-ANON-KEY> pelo valor real (Project Settings >
-- API > anon public key — o mesmo que já está no seu .env) antes de rodar
-- esse bloco. Sem isso o cron chama a função sem autenticação válida.
create or replace function public.trigger_whatsapp_daily_digest()
returns void
language plpgsql
security definer
set search_path = public, net
as $$
begin
  perform net.http_post(
    url := 'https://qkatokyhufovtwwhowzo.supabase.co/functions/v1/whatsapp-daily-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <SUA-ANON-KEY>'),
    body := '{}'::jsonb
  );
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'whatsapp-daily-digest') then
    perform cron.unschedule('whatsapp-daily-digest');
  end if;
  perform cron.schedule('whatsapp-daily-digest', '0 10 * * *', $cron$select public.trigger_whatsapp_daily_digest();$cron$);
end $$;
