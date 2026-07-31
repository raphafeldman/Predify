-- ============================================================
-- Unidades e Encomendas.
--
-- Controle das encomendas que chegam na portaria e são entregues no
-- apartamento: o que chegou, para quem, de qual loja, quando chegou e
-- quando foi entregue.
--
-- `units` vem primeiro porque é o que faz a busca por apartamento
-- responder de verdade. Com apartamento em texto livre, em poucos meses
-- convivem "302B", "302-B" e "Apto 302" no banco, e a pergunta mais
-- frequente ("o que chegou para o 302-B?") passa a devolver resposta
-- incompleta sem avisar ninguém.
-- ============================================================

-- ------------------------------------------------------------
-- units — as unidades do condomínio.
--
-- `block` é NOT NULL com padrão vazio de propósito: prédio sem blocos
-- simplesmente não preenche, e a chave de unicidade fica trivial em vez
-- de depender de coalesce sobre nulo.
-- ------------------------------------------------------------
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id) on delete cascade,

  block text not null default '',
  number text not null,
  floor text,

  -- Como a unidade é escrita e buscada. Coluna gerada: não há como ficar
  -- fora de sincronia com bloco e número.
  label text generated always as (
    case when block = '' then number else block || '-' || number end
  ) stored,

  notes text,
  active boolean not null default true,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_reason text
);

alter table public.units enable row level security;

-- Índice NÃO parcial (lição da Fase 2B): o cadastro em lote usa
-- "on conflict do nothing" para reexecutar sem duplicar, e o Postgres
-- não infere índice parcial como árbitro.
create unique index if not exists units_identificacao_uidx
  on public.units (condominio_id, block, number);

create index if not exists units_condominio_id_idx on public.units (condominio_id);
create index if not exists units_deleted_at_idx on public.units (deleted_at);
create index if not exists units_label_idx on public.units (label);

-- ------------------------------------------------------------
-- deliveries — a encomenda, do recebimento à entrega.
--
-- Dois momentos, não um: recebida na portaria e entregue no
-- apartamento. Guardar os dois separadamente é o que permite responder
-- "quanto tempo uma encomenda fica parada aqui", que é a pergunta que
-- revela problema de operação.
-- ------------------------------------------------------------
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id) on delete cascade,

  unit_id uuid not null references public.units (id) on delete restrict,
  -- Para quem, quando o morador não é o titular da unidade.
  recipient_name text,

  -- Loja/remetente. Texto livre com sugestões na interface: lista
  -- fechada envelhece a cada loja nova que aparece.
  store text,
  tracking_code text,
  notes text,

  status text not null default 'recebida'
    check (status in ('recebida', 'entregue', 'devolvida')),

  received_at timestamptz not null default now(),
  received_by uuid references public.profiles (id) on delete set null,
  photo_urls text[] not null default '{}',

  delivered_at timestamptz,
  delivered_by uuid references public.profiles (id) on delete set null,
  -- Comprovante do momento da entrega, separado da foto do recebimento.
  delivery_photo_urls text[] not null default '{}',
  returned_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_reason text,

  -- Entregue exige quando e por quem: sem isso o registro não serve
  -- como comprovação, que é metade do motivo de existir.
  constraint deliveries_entrega_completa check (
    status <> 'entregue' or (delivered_at is not null and delivered_by is not null)
  )
);

alter table public.deliveries enable row level security;

create index if not exists deliveries_condominio_id_idx on public.deliveries (condominio_id);
create index if not exists deliveries_deleted_at_idx on public.deliveries (deleted_at);
create index if not exists deliveries_unit_id_idx on public.deliveries (unit_id);
create index if not exists deliveries_status_idx on public.deliveries (status);
create index if not exists deliveries_received_at_idx on public.deliveries (received_at desc);
create index if not exists deliveries_store_idx on public.deliveries (store);

-- ------------------------------------------------------------
-- Carimbo do condomínio: o cliente nunca envia condominio_id.
-- ------------------------------------------------------------
drop trigger if exists stamp_condominio_id on public.units;
create trigger stamp_condominio_id before insert on public.units
  for each row execute function public.stamp_condominio_id();

drop trigger if exists stamp_condominio_id on public.deliveries;
create trigger stamp_condominio_id before insert on public.deliveries
  for each row execute function public.stamp_condominio_id();

-- ------------------------------------------------------------
-- RLS.
--
-- Unidades: todo mundo do condomínio lê (a portaria precisa escolher o
-- apartamento); só o síndico cadastra e edita.
--
-- Encomendas: quem recebe é a portaria, então qualquer funcionário do
-- condomínio registra e dá baixa — inclusive numa encomenda recebida
-- pelo turno anterior, que é o caso comum. Excluir é só do síndico.
-- ------------------------------------------------------------
drop policy if exists "units_select" on public.units;
create policy "units_select" on public.units
  for select to authenticated
  using (
    (condominio_id = public.current_condominio_id() and (deleted_at is null or public.is_sindico()))
    or public.is_platform_admin()
  );

drop policy if exists "units_write_sindico" on public.units;
create policy "units_write_sindico" on public.units
  for all to authenticated
  using ((condominio_id = public.current_condominio_id() and public.is_sindico()) or public.is_platform_admin())
  with check ((condominio_id = public.current_condominio_id() and public.is_sindico()) or public.is_platform_admin());

drop policy if exists "deliveries_select" on public.deliveries;
create policy "deliveries_select" on public.deliveries
  for select to authenticated
  using (
    (condominio_id = public.current_condominio_id() and (deleted_at is null or public.is_sindico()))
    or public.is_platform_admin()
  );

drop policy if exists "deliveries_insert" on public.deliveries;
create policy "deliveries_insert" on public.deliveries
  for insert to authenticated
  with check (received_by = auth.uid() and condominio_id = public.current_condominio_id());

drop policy if exists "deliveries_update" on public.deliveries;
create policy "deliveries_update" on public.deliveries
  for update to authenticated
  using (condominio_id = public.current_condominio_id() or public.is_platform_admin())
  with check (condominio_id = public.current_condominio_id() or public.is_platform_admin());

drop policy if exists "deliveries_delete_sindico" on public.deliveries;
create policy "deliveries_delete_sindico" on public.deliveries
  for delete to authenticated
  using ((condominio_id = public.current_condominio_id() and public.is_sindico()) or public.is_platform_admin());

-- ------------------------------------------------------------
-- Auditoria: uma encomenda é registro com valor de comprovação, então
-- quem deu baixa e quando fica na trilha imutável da Fase 1.
-- ------------------------------------------------------------
drop trigger if exists log_audit_units on public.units;
create trigger log_audit_units
  after insert or update on public.units
  for each row execute function public.log_audit_event('unit');

drop trigger if exists log_audit_deliveries on public.deliveries;
create trigger log_audit_deliveries
  after insert or update on public.deliveries
  for each row execute function public.log_audit_event('delivery');

-- ------------------------------------------------------------
-- Carimbo automático da baixa.
--
-- Fica no banco, e não na tela, porque a data e o autor da entrega são
-- exatamente o que dá valor de comprovação ao registro: nenhuma tela
-- futura pode "esquecer" de preenchê-los.
-- ------------------------------------------------------------
create or replace function public.stamp_delivery_baixa()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'entregue' and old.status is distinct from 'entregue' then
    if new.delivered_at is null then new.delivered_at := now(); end if;
    if new.delivered_by is null then new.delivered_by := auth.uid(); end if;
  end if;

  -- Voltar de "entregue" limpa a baixa: manter data e autor de uma
  -- entrega desfeita seria guardar uma comprovação falsa.
  if new.status <> 'entregue' and old.status = 'entregue' then
    new.delivered_at := null;
    new.delivered_by := null;
    new.delivery_photo_urls := '{}';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists stamp_baixa on public.deliveries;
create trigger stamp_baixa before update on public.deliveries
  for each row execute function public.stamp_delivery_baixa();

-- ------------------------------------------------------------
-- Amplia os tipos aceitos em comments para as entidades novas.
-- Só adiciona valores.
-- ------------------------------------------------------------
alter table public.comments drop constraint if exists comments_record_type_check;
alter table public.comments add constraint comments_record_type_check check (
  record_type in (
    'occurrence', 'maintenance_record', 'task', 'checklist_entry', 'document',
    'service_request', 'incident', 'work_order', 'asset', 'maintenance_plan',
    'delivery', 'unit'
  )
);
