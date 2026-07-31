-- ============================================================
-- CORREÇÃO DE SEGURANÇA — funções de operação estavam expostas.
--
-- As funções de operação das Fases 2B/2C/2D foram criadas com
-- `revoke execute ... from public`, na suposição de que isso as
-- tornaria acessíveis só ao dono. Não torna.
--
-- O Supabase mantém `alter default privileges in schema public grant
-- execute on functions to anon, authenticated, service_role`. Toda
-- função nova nasce, portanto, com concessões EXPLÍCITAS para esses
-- papéis. `revoke ... from public` remove a concessão do pseudo-papel
-- PUBLIC — que não era a origem do acesso — e deixa as explícitas
-- intactas:
--
--   proacl: postgres=X/postgres | anon=X/postgres |
--           authenticated=X/postgres | service_role=X/postgres
--
-- O efeito prático era acesso cruzado entre condomínios, sem login:
--
--   fase2_relatorio_migracao()   contagens de TODOS os condomínios
--   fase2_backfill(<uuid>)       escrita disparada em qualquer condomínio
--   gerar_os_preventivas(<uuid>) ordens criadas em qualquer condomínio
--   reverter_corte_dominio(<uuid>) desfaz o corte de qualquer condomínio
--
-- Todas são SECURITY DEFINER e, por isso, passam por cima do RLS.
--
-- Correção em duas camadas: revogar dos papéis certos e, nas funções
-- curtas, checar a autorização no corpo — para que uma futura migration
-- que recrie a função (recebendo as default privileges de novo) não
-- reabra o buraco em silêncio.
-- ============================================================

revoke execute on function public.fase2_backfill(uuid) from public, anon, authenticated;
revoke execute on function public.fase2_relatorio_migracao() from public, anon, authenticated;
revoke execute on function public.gerar_os_preventivas(uuid) from public, anon, authenticated;
revoke execute on function public.reverter_corte_dominio(uuid) from public, anon, authenticated;

-- As de escopo próprio continuam disponíveis: não recebem condomínio
-- por parâmetro e exigem síndico do próprio condomínio.
grant execute on function public.fase2_resincronizar() to authenticated;
grant execute on function public.gerar_minhas_os_preventivas() to authenticated;
grant execute on function public.cortar_dominio_manutencao() to authenticated;

revoke execute on function public.fase2_resincronizar() from anon;
revoke execute on function public.gerar_minhas_os_preventivas() from anon;
revoke execute on function public.cortar_dominio_manutencao() from anon;

-- ------------------------------------------------------------
-- Segunda camada: autorização verificada no corpo.
--
-- `auth.uid() is null` identifica os contextos de servidor legítimos
-- (migration, cron, Edge Function com service role); qualquer chamada
-- vinda de cliente tem usuário e precisa ser administrador da
-- plataforma.
-- ------------------------------------------------------------
create or replace function public.exigir_contexto_de_operacao()
returns void
language plpgsql
stable
as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'Esta função é de operação e não pode ser chamada pelo aplicativo.';
  end if;
end;
$$;

create or replace function public.gerar_os_preventivas(p_condominio_id uuid default null)
returns table (work_order_id uuid, plano_id uuid, vencimento date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sem_usuario boolean := auth.uid() is null;
begin
  -- Sem condomínio informado, esta função varre a base inteira; com um
  -- informado, escreve num condomínio que o chamador pode nem ter.
  perform public.exigir_contexto_de_operacao();

  if v_sem_usuario then
    alter table public.work_orders disable trigger stamp_condominio_id;
  end if;

  return query
  with novas as (
  insert into public.work_orders (
    condominio_id, origin_type, maintenance_plan_id, asset_id, location_id,
    title, description, category, status, priority,
    requested_by, assigned_user_id, supplier_id,
    due_at, plan_cycle_date, estimated_cost
  )
  select
    p.condominio_id, 'preventiva', p.id, p.asset_id, p.location_id,
    p.name,
    coalesce(p.description, ''),
    coalesce(a.category, 'outro'),
    'aberta',
    case a.criticality when 'critica' then 'urgente' when 'alta' then 'alta' else 'media' end,
    p.created_by, p.responsible_user_id, p.supplier_id,
    p.next_due_at::timestamptz, p.next_due_at, p.estimated_cost
  from public.maintenance_plans p
  left join public.assets a on a.id = p.asset_id
  where p.active
    and p.deleted_at is null
    and p.next_due_at is not null
    and p.next_due_at <= current_date + p.lead_time_days
    and (p_condominio_id is null or p.condominio_id = p_condominio_id)
  on conflict (maintenance_plan_id, plan_cycle_date) do nothing
  returning id, maintenance_plan_id, plan_cycle_date
  )
  select * from novas;

  if v_sem_usuario then
    alter table public.work_orders enable trigger stamp_condominio_id;
  end if;
  return;
end;
$$;

revoke execute on function public.gerar_os_preventivas(uuid) from public, anon, authenticated;

-- gerar_minhas_os_preventivas chama a de operação por dentro; como é
-- SECURITY DEFINER e roda como o dono, a checagem acima barraria o
-- síndico. Ela passa a fazer o trabalho pela via segura: valida o papel
-- e delega já com o condomínio do próprio chamador.
create or replace function public.gerar_minhas_os_preventivas()
returns table (work_order_id uuid, plano_id uuid, vencimento date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_condominio uuid := public.current_condominio_id();
begin
  if v_condominio is null or not public.is_sindico() then
    raise exception 'Apenas o síndico de um condomínio pode gerar ordens preventivas.';
  end if;

  return query
  with novas as (
  insert into public.work_orders (
    condominio_id, origin_type, maintenance_plan_id, asset_id, location_id,
    title, description, category, status, priority,
    requested_by, assigned_user_id, supplier_id,
    due_at, plan_cycle_date, estimated_cost
  )
  select
    p.condominio_id, 'preventiva', p.id, p.asset_id, p.location_id,
    p.name,
    coalesce(p.description, ''),
    coalesce(a.category, 'outro'),
    'aberta',
    case a.criticality when 'critica' then 'urgente' when 'alta' then 'alta' else 'media' end,
    p.created_by, p.responsible_user_id, p.supplier_id,
    p.next_due_at::timestamptz, p.next_due_at, p.estimated_cost
  from public.maintenance_plans p
  left join public.assets a on a.id = p.asset_id
  where p.active
    and p.deleted_at is null
    and p.next_due_at is not null
    and p.next_due_at <= current_date + p.lead_time_days
    and p.condominio_id = v_condominio
  on conflict (maintenance_plan_id, plan_cycle_date) do nothing
  returning id, maintenance_plan_id, plan_cycle_date
  )
  select * from novas;
  return;
end;
$$;

revoke execute on function public.gerar_minhas_os_preventivas() from public, anon;
grant execute on function public.gerar_minhas_os_preventivas() to authenticated;

create or replace function public.reverter_corte_dominio(p_condominio_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_contexto_de_operacao();
  update public.condominios set dominio_cortado_em = null where id = p_condominio_id;
end;
$$;

revoke execute on function public.reverter_corte_dominio(uuid) from public, anon, authenticated;

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
  -- Conta linhas de todos os condomínios: nunca pode responder ao app.
  perform public.exigir_contexto_de_operacao();

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

  select count(*) into v_x
    from public.occurrences o join public.work_orders w on w.id = o.id
   where w.number is distinct from o.os_number;
  verificacao := 'os_number preservado'; origem := v_o; destino := v_o - v_x;
  situacao := case when v_x = 0 then 'OK' else 'DIVERGENTE' end; return next;

  select count(*) into v_o from public.maintenance_records;
  select count(*) into v_d from public.work_orders where legacy_table = 'maintenance_records';
  verificacao := 'maintenance_records -> work_orders'; origem := v_o; destino := v_d;
  situacao := case when v_o = v_d then 'OK' else 'DIVERGENTE' end; return next;

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

  select count(*) into v_d
    from public.work_orders w
   where w.legacy_table is not null
     and ((w.asset_id is not null and not exists (select 1 from public.assets a where a.id = w.asset_id))
       or (w.maintenance_plan_id is not null and not exists (select 1 from public.maintenance_plans p where p.id = w.maintenance_plan_id)));
  verificacao := 'ordens sem ativo/plano valido'; origem := 0; destino := v_d;
  situacao := case when v_d = 0 then 'OK' else 'DIVERGENTE' end; return next;

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

revoke execute on function public.fase2_relatorio_migracao() from public, anon, authenticated;
