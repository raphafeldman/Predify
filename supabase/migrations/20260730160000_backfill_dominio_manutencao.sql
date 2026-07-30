-- ============================================================
-- Fase 2B (Domínio de Manutenção) — migração dos dados existentes.
--
-- Copia o conteúdo de maintenance_items, occurrences e
-- maintenance_records para as tabelas criadas na 2A. As tabelas antigas
-- NÃO são alteradas nem esvaziadas: continuam sendo a fonte da verdade
-- até a Fase 2D cortar cada tela.
--
-- O backfill é uma FUNÇÃO idempotente, não um script de uma vez só.
-- Entre esta fase e o corte das telas, escritas novas continuam indo
-- para as tabelas antigas; reexecutar a função imediatamente antes de
-- cada corte captura tudo que entrou nessa janela.
--
--   select * from public.fase2_backfill();           -- migra (ou re-migra)
--   select * from public.fase2_relatorio_migracao(); -- confere
-- ============================================================

-- ------------------------------------------------------------
-- Rastreamento da origem.
--
-- assets, incidents e work_orders (vindas de occurrences) preservam o
-- MESMO id do registro antigo — a própria chave já é o mapeamento, e é
-- o que faz comentários e notificações antigos continuarem resolvendo.
--
-- maintenance_plans não tem equivalente antigo (nasce da metade
-- "regra" de maintenance_items), então precisa de coluna própria para
-- ser idempotente.
-- ------------------------------------------------------------
alter table public.maintenance_plans
  add column if not exists legacy_maintenance_item_id uuid;

-- Índice NÃO parcial de propósito: o Postgres não consegue inferir um
-- índice parcial como árbitro de "on conflict" sem repetir o predicado,
-- e um índice único comum já aceita vários NULL (planos criados pela
-- interface, sem origem legada) enquanto garante unicidade nos demais.
create unique index if not exists maintenance_plans_legacy_item_uidx
  on public.maintenance_plans (legacy_maintenance_item_id);

-- De qual tabela antiga a OS veio. Torna o relatório de divergência
-- direto e permite um rollback cirúrgico (apagar só o que foi migrado,
-- sem tocar no que a interface nova vier a criar depois).
alter table public.work_orders
  add column if not exists legacy_table text;

alter table public.work_orders drop constraint if exists work_orders_legacy_table_check;
alter table public.work_orders add constraint work_orders_legacy_table_check
  check (legacy_table is null or legacy_table in ('occurrences', 'maintenance_records'));

create index if not exists work_orders_legacy_table_idx on public.work_orders (legacy_table);

-- Evita anexar a mesma foto duas vezes ao reexecutar o backfill.
create unique index if not exists work_order_evidence_dedup_uidx
  on public.work_order_evidence (work_order_id, file_url);

-- ------------------------------------------------------------
-- Backfill. Retorna quantas linhas existem em cada destino ao final.
--
-- Sobre desligar o gatilho stamp_condominio_id: ele faz
-- `new.condominio_id := current_condominio_id()` INCONDICIONALMENTE, e
-- aqui não existe auth.uid() (roda como postgres, pela migration). Sem
-- desligar, o carimbo viraria NULL e o insert quebraria no not null.
--
-- Optei por desligar o gatilho durante a cópia, e NÃO por afrouxar a
-- função para "só carimba se vier nulo": esse afrouxamento deixaria um
-- cliente autenticado enviar um condominio_id de outro condomínio em
-- occurrences/tasks/documents, cujas policies de insert só conferem
-- created_by. O desligamento é transacional — se algo falhar, o rollback
-- religa sozinho — e não muda nenhuma regra de segurança permanente.
-- ------------------------------------------------------------
create or replace function public.fase2_backfill(p_condominio_id uuid default null)
returns table (destino text, linhas bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Só a migration roda sem usuário; aí o carimbo precisa sair do
  -- caminho. Chamado por um síndico autenticado, o gatilho carimba
  -- justamente o condomínio certo — não há o que desligar, e assim
  -- evitamos DDL (lock exclusivo) disparado a partir do aplicativo.
  v_sem_usuario boolean := auth.uid() is null;
begin
  if v_sem_usuario then
    alter table public.assets disable trigger stamp_condominio_id;
    alter table public.maintenance_plans disable trigger stamp_condominio_id;
    alter table public.incidents disable trigger stamp_condominio_id;
    alter table public.work_orders disable trigger stamp_condominio_id;
  end if;
  -- stamp_number continua LIGADO: as OS vindas de maintenance_records
  -- não têm número antigo e precisam receber um do contador do condomínio.

  -- 1) maintenance_items -> assets  (mesmo id)
  --
  -- location é texto livre ("Casa de máquinas"). Vai literalmente para
  -- location_text; location_id fica nulo, para o síndico organizar a
  -- hierarquia quando quiser. Inferir bloco/pavimento de texto livre
  -- seria fabricar dado.
  insert into public.assets (
    id, condominio_id, name, category, location_text, manufacturer, model,
    serial_number, notes, responsible_user_id, created_by, created_at,
    deleted_at, deleted_by, deletion_reason
  )
  select
    mi.id, mi.condominio_id, mi.name, mi.category, mi.location, mi.brand, mi.model,
    mi.serial_number, mi.notes, mi.assigned_to, mi.created_by, mi.created_at,
    mi.deleted_at, mi.deleted_by, mi.deletion_reason
  from public.maintenance_items mi
  where p_condominio_id is null or mi.condominio_id = p_condominio_id
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    location_text = excluded.location_text,
    manufacturer = excluded.manufacturer,
    model = excluded.model,
    serial_number = excluded.serial_number,
    notes = excluded.notes,
    responsible_user_id = excluded.responsible_user_id,
    deleted_at = excluded.deleted_at,
    deleted_by = excluded.deleted_by,
    deletion_reason = excluded.deletion_reason,
    updated_at = now();

  -- 2) maintenance_items -> maintenance_plans  (id novo, rastreado por
  --    legacy_maintenance_item_id). É aqui que a regra de recorrência
  --    finalmente se separa do equipamento.
  insert into public.maintenance_plans (
    condominio_id, asset_id, legacy_maintenance_item_id, name, maintenance_type,
    frequency_type, frequency_interval, next_due_at, responsible_user_id,
    active, created_by, created_at, deleted_at, deleted_by, deletion_reason
  )
  select
    mi.condominio_id,
    mi.id,
    mi.id,
    'Manutenção ' || mi.frequency,
    'preventiva',
    mi.frequency,          -- as 6 frequências antigas existem no enum novo
    1,
    mi.next_due_date,
    mi.assigned_to,
    mi.deleted_at is null,
    mi.created_by,
    mi.created_at,
    mi.deleted_at, mi.deleted_by, mi.deletion_reason
  from public.maintenance_items mi
  where p_condominio_id is null or mi.condominio_id = p_condominio_id
  on conflict (legacy_maintenance_item_id) do update set
    frequency_type = excluded.frequency_type,
    next_due_at = excluded.next_due_at,
    responsible_user_id = excluded.responsible_user_id,
    active = excluded.active,
    deleted_at = excluded.deleted_at,
    deleted_by = excluded.deleted_by,
    deletion_reason = excluded.deletion_reason,
    updated_at = now();

  -- 3) occurrences -> incidents  (mesmo id, mesmo número)
  insert into public.incidents (
    id, condominio_id, number, title, description, category, severity, status,
    photo_urls, reported_by, created_at, deleted_at, deleted_by, deletion_reason
  )
  select
    o.id, o.condominio_id, o.os_number, o.title, o.description, o.category, o.severity,
    case o.status
      when 'aberta' then 'nova'
      when 'em_andamento' then 'convertida_em_os'
      when 'concluida' then 'encerrada'
      when 'cancelada' then 'cancelada'
      else 'nova'
    end,
    o.photo_urls, o.created_by, o.created_at,
    o.deleted_at, o.deleted_by, o.deletion_reason
  from public.occurrences o
  where p_condominio_id is null or o.condominio_id = p_condominio_id
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    status = excluded.status,
    photo_urls = excluded.photo_urls,
    deleted_at = excluded.deleted_at,
    deleted_by = excluded.deleted_by,
    deletion_reason = excluded.deletion_reason,
    updated_at = now();

  -- 4) occurrences -> work_orders  (mesmo id, MESMO os_number)
  --
  -- Preservar o número é inegociável: é por ele que o síndico e a
  -- equipe se referem à ordem no dia a dia.
  insert into public.work_orders (
    id, condominio_id, number, origin_type, incident_id, title, description,
    category, priority, status, requested_by, assigned_user_id, estimated_cost,
    completed_at, created_at, legacy_table, deleted_at, deleted_by, deletion_reason
  )
  select
    o.id, o.condominio_id, o.os_number, 'incidente', o.id, o.title, o.description,
    o.category,
    o.severity,            -- baixa/media/alta existem nos dois checks
    case o.status
      when 'aberta' then 'aberta'
      when 'em_andamento' then 'em_execucao'
      when 'concluida' then 'encerrada'
      when 'cancelada' then 'cancelada'
      else 'aberta'
    end,
    o.created_by, o.assigned_to, o.estimated_cost,
    o.resolved_at, o.created_at, 'occurrences',
    o.deleted_at, o.deleted_by, o.deletion_reason
  from public.occurrences o
  where p_condominio_id is null or o.condominio_id = p_condominio_id
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    status = excluded.status,
    assigned_user_id = excluded.assigned_user_id,
    estimated_cost = excluded.estimated_cost,
    completed_at = excluded.completed_at,
    deleted_at = excluded.deleted_at,
    deleted_by = excluded.deleted_by,
    deletion_reason = excluded.deletion_reason,
    updated_at = now();

  -- 5) maintenance_records -> work_orders  (mesmo id, número novo)
  --
  -- Um registro de manutenção JÁ É uma ordem de serviço executada — só
  -- não era chamada assim. Preventiva vira origin_type='preventiva' e se
  -- liga ao plano; corretiva não tem plano de origem, então entra como
  -- solicitação direta.
  insert into public.work_orders (
    id, condominio_id, origin_type, maintenance_plan_id, asset_id,
    title, description, category, status, requested_by, assigned_user_id,
    supplier_id, started_at, completed_at, created_at, legacy_table,
    deleted_at, deleted_by, deletion_reason
  )
  select
    mr.id, mr.condominio_id,
    case mr.type when 'preventiva' then 'preventiva' else 'solicitacao_direta' end,
    p.id,
    mr.maintenance_item_id,
    coalesce(mi.name, 'Manutenção') || ' — ' || mr.type,
    mr.description,
    coalesce(mi.category, 'outro'),
    case mr.status
      when 'aberta' then 'aberta'
      when 'em_andamento' then 'em_execucao'
      else 'encerrada'
    end,
    mr.performed_by, mr.performed_by, mr.fornecedor_id,
    mr.performed_at,
    case when mr.status = 'concluida' then mr.performed_at else null end,
    mr.created_at, 'maintenance_records',
    mr.deleted_at, mr.deleted_by, mr.deletion_reason
  from public.maintenance_records mr
  left join public.maintenance_items mi on mi.id = mr.maintenance_item_id
  left join public.maintenance_plans p on p.legacy_maintenance_item_id = mr.maintenance_item_id
  where p_condominio_id is null or mr.condominio_id = p_condominio_id
  on conflict (id) do update set
    description = excluded.description,
    status = excluded.status,
    supplier_id = excluded.supplier_id,
    maintenance_plan_id = excluded.maintenance_plan_id,
    asset_id = excluded.asset_id,
    completed_at = excluded.completed_at,
    deleted_at = excluded.deleted_at,
    deleted_by = excluded.deleted_by,
    deletion_reason = excluded.deletion_reason,
    updated_at = now();

  -- 6) Fotos e OM -> work_order_evidence
  --
  -- Nenhum arquivo é movido no Storage: só o caminho passa a ser
  -- referenciado também aqui.
  insert into public.work_order_evidence (work_order_id, kind, file_url, uploaded_by, created_at)
  select distinct o.id, 'foto_depois', foto, o.created_by, o.created_at
  from public.occurrences o, unnest(o.photo_urls) as foto
  where p_condominio_id is null or o.condominio_id = p_condominio_id
  on conflict (work_order_id, file_url) do nothing;

  insert into public.work_order_evidence (work_order_id, kind, file_url, uploaded_by, created_at)
  select distinct mr.id, 'foto_depois', foto, mr.performed_by, mr.created_at
  from public.maintenance_records mr, unnest(mr.photo_urls) as foto
  where p_condominio_id is null or mr.condominio_id = p_condominio_id
  on conflict (work_order_id, file_url) do nothing;

  insert into public.work_order_evidence (
    work_order_id, kind, file_url, file_name, mime_type, uploaded_by, created_at
  )
  select mr.id, 'om_fornecedor', mr.om_file_url, mr.om_file_name, mr.om_mime_type,
         mr.performed_by, mr.created_at
  from public.maintenance_records mr
  where mr.om_file_url is not null
    and (p_condominio_id is null or mr.condominio_id = p_condominio_id)
  on conflict (work_order_id, file_url) do nothing;

  if v_sem_usuario then
    alter table public.assets enable trigger stamp_condominio_id;
    alter table public.maintenance_plans enable trigger stamp_condominio_id;
    alter table public.incidents enable trigger stamp_condominio_id;
    alter table public.work_orders enable trigger stamp_condominio_id;
  end if;

  -- As contagens respeitam o mesmo filtro: chamada por um síndico, esta
  -- função não pode devolver o volume de dados de outro condomínio.
  destino := 'assets';
  linhas := (select count(*) from public.assets a
              where p_condominio_id is null or a.condominio_id = p_condominio_id);
  return next;

  destino := 'maintenance_plans';
  linhas := (select count(*) from public.maintenance_plans p
              where p_condominio_id is null or p.condominio_id = p_condominio_id);
  return next;

  destino := 'incidents';
  linhas := (select count(*) from public.incidents i
              where p_condominio_id is null or i.condominio_id = p_condominio_id);
  return next;

  destino := 'work_orders';
  linhas := (select count(*) from public.work_orders w
              where p_condominio_id is null or w.condominio_id = p_condominio_id);
  return next;

  destino := 'work_order_evidence';
  linhas := (select count(*) from public.work_order_evidence e
              join public.work_orders w on w.id = e.work_order_id
              where p_condominio_id is null or w.condominio_id = p_condominio_id);
  return next;

  return;
end;
$$;

revoke execute on function public.fase2_backfill(uuid) from public;

-- ------------------------------------------------------------
-- Re-sincronização por condomínio, disponível ao próprio síndico.
--
-- Enquanto as telas antigas continuarem gravando em occurrences/
-- maintenance_records (até a Fase 2D), o espelho novo envelhece. Esta é
-- a forma segura de atualizá-lo: o condomínio não é parâmetro, é sempre
-- o do próprio chamador — não há como pedir a cópia dos dados alheios.
-- ------------------------------------------------------------
create or replace function public.fase2_resincronizar()
returns table (destino text, linhas bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_condominio uuid := public.current_condominio_id();
begin
  if v_condominio is null or not public.is_sindico() then
    raise exception 'Apenas o síndico de um condomínio pode re-sincronizar.';
  end if;
  return query select * from public.fase2_backfill(v_condominio);
end;
$$;

revoke execute on function public.fase2_resincronizar() from public;
grant execute on function public.fase2_resincronizar() to authenticated;

-- ------------------------------------------------------------
-- Relatório de divergência. Cada linha é uma verificação com veredito
-- explícito — para não depender de conferência visual.
--
-- Sem grant para authenticated: conta linhas de TODOS os condomínios,
-- então é ferramenta de operação (postgres/CLI), não de aplicação.
-- Expor isso a um usuário logado vazaria volume de dados alheios.
-- ------------------------------------------------------------
create or replace function public.fase2_relatorio_migracao()
returns table (verificacao text, origem bigint, destino bigint, situacao text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o bigint;
  v_d bigint;
  v_x bigint;
begin
  select count(*) into v_o from public.maintenance_items;
  select count(*) into v_d from public.assets;
  verificacao := 'maintenance_items -> assets'; origem := v_o; destino := v_d;
  situacao := case when v_o = v_d then 'OK' else 'DIVERGENTE' end; return next;

  select count(*) into v_d from public.maintenance_plans where legacy_maintenance_item_id is not null;
  verificacao := 'maintenance_items -> maintenance_plans'; origem := v_o; destino := v_d;
  situacao := case when v_o = v_d then 'OK' else 'DIVERGENTE' end; return next;

  select count(*) into v_o from public.occurrences;
  select count(*) into v_d from public.incidents;
  verificacao := 'occurrences -> incidents'; origem := v_o; destino := v_d;
  situacao := case when v_o = v_d then 'OK' else 'DIVERGENTE' end; return next;

  select count(*) into v_d from public.work_orders where legacy_table = 'occurrences';
  verificacao := 'occurrences -> work_orders'; origem := v_o; destino := v_d;
  situacao := case when v_o = v_d then 'OK' else 'DIVERGENTE' end; return next;

  -- O número da OS é a referência que a equipe usa no dia a dia:
  -- qualquer divergência aqui é bloqueante.
  select count(*) into v_x
    from public.occurrences o join public.work_orders w on w.id = o.id
   where w.number is distinct from o.os_number;
  verificacao := 'os_number preservado'; origem := v_o; destino := v_o - v_x;
  situacao := case when v_x = 0 then 'OK' else 'DIVERGENTE' end; return next;

  select count(*) into v_o from public.maintenance_records;
  select count(*) into v_d from public.work_orders where legacy_table = 'maintenance_records';
  verificacao := 'maintenance_records -> work_orders'; origem := v_o; destino := v_d;
  situacao := case when v_o = v_d then 'OK' else 'DIVERGENTE' end; return next;

  -- Nenhuma foto pode ficar para trás. Conta pares distintos
  -- (registro, arquivo) na origem, que é o que o destino comporta.
  select count(*) into v_o from (
    select distinct o.id, foto from public.occurrences o, unnest(o.photo_urls) as foto
    union all
    select distinct mr.id, foto from public.maintenance_records mr, unnest(mr.photo_urls) as foto
  ) t;
  select count(*) into v_d from public.work_order_evidence where kind = 'foto_depois';
  verificacao := 'fotos -> evidencias'; origem := v_o; destino := v_d;
  situacao := case when v_o = v_d then 'OK' else 'DIVERGENTE' end; return next;

  select count(*) into v_o from public.maintenance_records where om_file_url is not null;
  select count(*) into v_d from public.work_order_evidence where kind = 'om_fornecedor';
  verificacao := 'OM do fornecedor -> evidencias'; origem := v_o; destino := v_d;
  situacao := case when v_o = v_d then 'OK' else 'DIVERGENTE' end; return next;

  -- Órfãos: OS migrada apontando para ativo/plano inexistente.
  select count(*) into v_d
    from public.work_orders w
   where w.legacy_table is not null
     and ((w.asset_id is not null and not exists (select 1 from public.assets a where a.id = w.asset_id))
       or (w.maintenance_plan_id is not null and not exists (select 1 from public.maintenance_plans p where p.id = w.maintenance_plan_id)));
  verificacao := 'ordens sem ativo/plano valido'; origem := 0; destino := v_d;
  situacao := case when v_d = 0 then 'OK' else 'DIVERGENTE' end; return next;

  -- Vazamento de condomínio: toda linha migrada tem de manter o
  -- condominio_id do registro de origem.
  select count(*) into v_d from (
    select 1 from public.assets a join public.maintenance_items mi on mi.id = a.id
      where a.condominio_id is distinct from mi.condominio_id
    union all
    select 1 from public.incidents i join public.occurrences o on o.id = i.id
      where i.condominio_id is distinct from o.condominio_id
    union all
    select 1 from public.work_orders w join public.occurrences o on o.id = w.id
      where w.condominio_id is distinct from o.condominio_id
    union all
    select 1 from public.work_orders w join public.maintenance_records mr on mr.id = w.id
      where w.condominio_id is distinct from mr.condominio_id
  ) t;
  verificacao := 'condominio_id preservado'; origem := 0; destino := v_d;
  situacao := case when v_d = 0 then 'OK' else 'DIVERGENTE' end; return next;

  return;
end;
$$;

revoke execute on function public.fase2_relatorio_migracao() from public;

-- A execução propriamente dita fica na migration seguinte: separar
-- "criar a maquinaria" de "mover os dados" deixa a cópia re-executável
-- e, se ela falhar, o erro não leva junto a definição das funções.
