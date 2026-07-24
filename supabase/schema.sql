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
