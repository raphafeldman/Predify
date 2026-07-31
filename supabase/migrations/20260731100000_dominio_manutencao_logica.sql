-- ============================================================
-- Fase 2C (Domínio de Manutenção) — lógica de domínio.
--
-- A 2A criou a estrutura e a 2B copiou os dados. Aqui o modelo passa a
-- ter COMPORTAMENTO: plano gera ordem sozinho, status obedece a uma
-- máquina de estados, concluir preventiva empurra o próximo vencimento,
-- e resposta fora da faixa vira não conformidade.
--
-- Nenhuma tela muda nesta fase. As telas antigas continuam gravando em
-- occurrences/maintenance_records; nada aqui interfere nelas.
-- ============================================================

-- ------------------------------------------------------------
-- Cálculo do próximo vencimento.
--
-- Função pura, testável isoladamente. Devolve NULL para os gatilhos não
-- temporais (data específica, medidor, horas de funcionamento): esses
-- não se calculam por calendário, e devolver uma data qualquer seria
-- inventar uma recorrência que o síndico não pediu.
-- ------------------------------------------------------------
create or replace function public.proximo_vencimento(
  p_frequencia text,
  p_intervalo integer,
  p_base date
)
returns date
language sql
immutable
as $$
  select case p_frequencia
    when 'diaria'     then p_base + (p_intervalo || ' days')::interval
    when 'semanal'    then p_base + (p_intervalo || ' weeks')::interval
    when 'quinzenal'  then p_base + (2 * p_intervalo || ' weeks')::interval
    when 'mensal'     then p_base + (p_intervalo || ' months')::interval
    when 'bimestral'  then p_base + (2 * p_intervalo || ' months')::interval
    when 'trimestral' then p_base + (3 * p_intervalo || ' months')::interval
    when 'semestral'  then p_base + (6 * p_intervalo || ' months')::interval
    when 'anual'      then p_base + (p_intervalo || ' years')::interval
    else null
  end::date;
$$;

-- ------------------------------------------------------------
-- Geração de OS preventiva a partir do plano.
--
-- plan_cycle_date guarda PARA QUAL vencimento a ordem foi gerada. É o
-- que torna a geração idempotente: rodar duas vezes no mesmo dia não
-- cria duas ordens do mesmo ciclo.
--
-- Índice NÃO parcial, pela mesma razão aprendida na 2B: o Postgres não
-- infere índice parcial como árbitro de "on conflict". Aqui funciona
-- naturalmente porque, em Postgres, linhas com NULL em qualquer coluna
-- da chave nunca conflitam — ordens não preventivas simplesmente não
-- disputam este índice.
-- ------------------------------------------------------------
alter table public.work_orders
  add column if not exists plan_cycle_date date;

create unique index if not exists work_orders_plan_cycle_uidx
  on public.work_orders (maintenance_plan_id, plan_cycle_date);

create or replace function public.gerar_os_preventivas(p_condominio_id uuid default null)
returns table (work_order_id uuid, plano_id uuid, vencimento date)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Mesmo cuidado da 2B: sem usuário (cron/migration) o carimbo de
  -- condomínio viraria NULL. Chamado por um síndico, o gatilho já
  -- carimba o condomínio certo e não há DDL a fazer.
  v_sem_usuario boolean := auth.uid() is null;
begin
  if v_sem_usuario then
    alter table public.work_orders disable trigger stamp_condominio_id;
  end if;

  -- CTE que modifica dados: é a forma garantida de devolver as linhas
  -- de um INSERT ... RETURNING por RETURN QUERY.
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
    -- lead_time_days é a antecedência com que o plano vira trabalho.
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

revoke execute on function public.gerar_os_preventivas(uuid) from public;

-- Versão segura para o próprio síndico: o condomínio não é parâmetro.
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
  return query select * from public.gerar_os_preventivas(v_condominio);
end;
$$;

revoke execute on function public.gerar_minhas_os_preventivas() from public;
grant execute on function public.gerar_minhas_os_preventivas() to authenticated;

-- ------------------------------------------------------------
-- Máquina de estados da ordem de serviço.
--
-- Sem isto, "encerrada" volta para "em_triagem" e o histórico deixa de
-- significar alguma coisa. A tabela abaixo é deliberadamente permissiva
-- dentro do fluxo normal e rígida só onde o retrocesso não faz sentido:
-- de um estado final só se sai reabrindo.
--
-- Só vale para UPDATE. A carga da 2B entrou por INSERT e não passa por
-- aqui — migrar dado histórico não é transição de estado.
-- ------------------------------------------------------------
create or replace function public.transicoes_work_order(p_de text)
returns text[]
language sql
immutable
as $$
  select case p_de
    when 'rascunho'              then array['aberta','cancelada']
    when 'aberta'                then array['em_triagem','aguardando_aprovacao','aguardando_orcamento','aprovada','programada','em_execucao','cancelada']
    when 'em_triagem'            then array['aberta','aguardando_aprovacao','aguardando_orcamento','aprovada','programada','cancelada']
    when 'aguardando_aprovacao'  then array['em_triagem','aguardando_orcamento','aprovada','cancelada']
    when 'aguardando_orcamento'  then array['em_triagem','aguardando_aprovacao','aprovada','cancelada']
    when 'aprovada'              then array['programada','em_execucao','cancelada']
    when 'programada'            then array['em_execucao','pausada','cancelada']
    when 'em_execucao'           then array['pausada','aguardando_material','aguardando_fornecedor','concluida','cancelada']
    when 'pausada'               then array['em_execucao','cancelada']
    when 'aguardando_material'   then array['em_execucao','cancelada']
    when 'aguardando_fornecedor' then array['em_execucao','cancelada']
    when 'concluida'             then array['aguardando_validacao','encerrada','reaberta']
    when 'aguardando_validacao'  then array['encerrada','reaberta']
    when 'encerrada'             then array['reaberta']
    when 'cancelada'             then array['reaberta']
    when 'reaberta'              then array['aberta','programada','em_execucao','cancelada']
    else array[]::text[]
  end;
$$;

-- O backfill da 2B não faz transições de negócio: ele espelha um estado
-- decidido nas telas antigas. Se uma ocorrência já migrada for reaberta
-- no modelo antigo, a re-sincronização precisaria mover a ordem de
-- "encerrada" para "em_execucao" — proibido aqui, e com razão, porque
-- ninguém executou essa transição.
--
-- Por isso a função de backfill se identifica, e os gatilhos de domínio
-- se afastam enquanto ela roda. O portador do sinal é application_name
-- por um motivo prático: o papel `postgres` do Supabase não tem
-- permissão para definir parâmetro personalizado ("permission denied to
-- set parameter"), e application_name é USERSET. Com ALTER FUNCTION ...
-- SET, o valor vale só durante a chamada e é restaurado na saída —
-- inclusive quando fase2_resincronizar() chama o backfill por dentro.
create or replace function public.sincronizando_legado()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('application_name', true), '') = 'predify-sincronizando';
$$;

alter function public.fase2_backfill(uuid) set application_name = 'predify-sincronizando';

create or replace function public.validar_transicao_work_order()
returns trigger
language plpgsql
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if public.sincronizando_legado() then
    return new;
  end if;

  if not (new.status = any (public.transicoes_work_order(old.status))) then
    raise exception
      'Transição inválida na ordem de serviço: % -> %. A partir de "%" só é possível ir para: %',
      old.status, new.status, old.status,
      array_to_string(public.transicoes_work_order(old.status), ', ');
  end if;

  -- Carimbos de tempo que o domínio garante, para não depender de cada
  -- tela lembrar de preenchê-los.
  if new.status = 'em_execucao' and new.started_at is null then
    new.started_at := now();
  end if;
  if new.status in ('concluida', 'encerrada') and new.completed_at is null then
    new.completed_at := now();
  end if;
  if new.status = 'reaberta' then
    new.completed_at := null;
    new.validated_at := null;
    new.validated_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists validar_transicao on public.work_orders;
create trigger validar_transicao before update on public.work_orders
  for each row execute function public.validar_transicao_work_order();

-- ------------------------------------------------------------
-- Concluir uma preventiva empurra o próximo vencimento do plano.
--
-- A cadência é ancorada no vencimento PROGRAMADO, não na data em que a
-- pessoa concluiu: ancorar na conclusão faz a manutenção mensal andar
-- para frente um pouco a cada mês até desalinhar do calendário. O laço
-- adiante só existe para o caso de a ordem ficar meses parada — aí
-- avança de ciclo em ciclo até cair no futuro.
-- ------------------------------------------------------------
create or replace function public.avancar_plano_ao_concluir()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plano public.maintenance_plans%rowtype;
  v_proximo date;
  v_guarda integer := 0;
begin
  if new.maintenance_plan_id is null then
    return new;
  end if;
  if new.status not in ('concluida', 'encerrada') then
    return new;
  end if;
  if old.status in ('concluida', 'encerrada') then
    return new;
  end if;

  -- Durante a re-sincronização o vencimento já vem calculado do modelo
  -- antigo (o gatilho de auto-avanço de maintenance_items fez a conta e
  -- o backfill copiou). Avançar de novo aqui pularia um ciclo inteiro.
  if public.sincronizando_legado() then
    return new;
  end if;

  select * into v_plano from public.maintenance_plans where id = new.maintenance_plan_id;
  if not found or v_plano.next_due_at is null then
    return new;
  end if;

  v_proximo := public.proximo_vencimento(
    v_plano.frequency_type, v_plano.frequency_interval, v_plano.next_due_at
  );
  if v_proximo is null then
    return new;   -- gatilho não temporal: nada a calcular
  end if;

  while v_proximo <= current_date and v_guarda < 500 loop
    v_proximo := public.proximo_vencimento(
      v_plano.frequency_type, v_plano.frequency_interval, v_proximo
    );
    v_guarda := v_guarda + 1;
  end loop;

  update public.maintenance_plans
     set next_due_at = v_proximo, updated_at = now()
   where id = v_plano.id;

  return new;
end;
$$;

drop trigger if exists avancar_plano on public.work_orders;
create trigger avancar_plano after update on public.work_orders
  for each row execute function public.avancar_plano_ao_concluir();

-- ------------------------------------------------------------
-- Execução do checklist: as respostas de cada etapa.
--
-- maintenance_plan_steps (2A) é o MODELO; esta tabela é o que de fato
-- foi respondido numa ordem. Guarda cópia do título e do tipo porque o
-- plano pode ser editado depois — um laudo não pode mudar
-- retroativamente porque alguém renomeou a etapa.
-- ------------------------------------------------------------
create table if not exists public.work_order_step_results (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  plan_step_id uuid references public.maintenance_plan_steps (id) on delete set null,

  order_index integer not null default 0,
  title text not null,
  response_type text not null default 'confirmacao',

  value_text text,
  value_number numeric,
  value_boolean boolean,
  file_urls text[] not null default '{}',

  -- Falso quando a resposta viola a faixa configurada na etapa.
  conforme boolean not null default true,
  notes text,
  answered_by uuid references public.profiles (id) on delete set null,
  answered_at timestamptz not null default now(),

  constraint work_order_step_results_etapa_unica unique (work_order_id, plan_step_id)
);

alter table public.work_order_step_results enable row level security;

-- Isolamento por junção com a OS, mesmo padrão de work_order_evidence.
drop policy if exists "work_order_step_results_select" on public.work_order_step_results;
create policy "work_order_step_results_select" on public.work_order_step_results
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

drop policy if exists "work_order_step_results_write" on public.work_order_step_results;
create policy "work_order_step_results_write" on public.work_order_step_results
  for all to authenticated
  using (
    exists (
      select 1 from public.work_orders w
      where w.id = work_order_id
        and w.condominio_id = public.current_condominio_id()
        and (w.assigned_user_id = auth.uid() or w.requested_by = auth.uid() or public.is_sindico())
    )
  )
  with check (
    answered_by = auth.uid()
    and exists (
      select 1 from public.work_orders w
      where w.id = work_order_id
        and w.condominio_id = public.current_condominio_id()
        and (w.assigned_user_id = auth.uid() or w.requested_by = auth.uid() or public.is_sindico())
    )
  );

create index if not exists work_order_step_results_wo_idx
  on public.work_order_step_results (work_order_id);
create index if not exists work_order_step_results_conforme_idx
  on public.work_order_step_results (conforme) where not conforme;

-- ------------------------------------------------------------
-- Não conformidade.
--
-- Uma leitura fora da faixa é o sinal mais barato que a manutenção
-- preventiva produz — é ele que transforma "passei lá e olhei" em
-- "medi 1,2 bar onde o mínimo é 2". Antes de gravar, a resposta é
-- classificada; se violar a faixa de uma etapa marcada para gerar não
-- conformidade, nasce uma ocorrência ligada ao mesmo ativo.
-- ------------------------------------------------------------
create or replace function public.classificar_resposta_etapa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step public.maintenance_plan_steps%rowtype;
begin
  new.conforme := true;

  if new.plan_step_id is null then
    return new;
  end if;

  select * into v_step from public.maintenance_plan_steps where id = new.plan_step_id;
  if not found then
    return new;
  end if;

  if new.value_number is not null then
    if (v_step.min_value is not null and new.value_number < v_step.min_value)
       or (v_step.max_value is not null and new.value_number > v_step.max_value) then
      new.conforme := false;
    end if;
  end if;

  -- Um "não" numa etapa de sim/não também é desvio.
  if v_step.response_type = 'sim_nao' and new.value_boolean is false then
    new.conforme := false;
  end if;

  return new;
end;
$$;

drop trigger if exists classificar_resposta on public.work_order_step_results;
create trigger classificar_resposta before insert or update on public.work_order_step_results
  for each row execute function public.classificar_resposta_etapa();

create or replace function public.abrir_nao_conformidade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step public.maintenance_plan_steps%rowtype;
  v_os public.work_orders%rowtype;
  v_faixa text;
begin
  if new.conforme then
    return new;
  end if;
  if TG_OP = 'UPDATE' and not old.conforme then
    return new;   -- já havia gerado a ocorrência
  end if;
  if new.plan_step_id is null then
    return new;
  end if;

  select * into v_step from public.maintenance_plan_steps where id = new.plan_step_id;
  if not found or not v_step.creates_nonconformity then
    return new;
  end if;

  select * into v_os from public.work_orders where id = new.work_order_id;
  if not found then
    return new;
  end if;

  v_faixa := coalesce(
    'faixa esperada: ' || coalesce(v_step.min_value::text, '—') || ' a ' || coalesce(v_step.max_value::text, '—'),
    'fora do esperado'
  );

  insert into public.incidents (
    condominio_id, title, description, category, severity, status,
    asset_id, location_id, reported_by
  )
  values (
    v_os.condominio_id,
    'Não conformidade: ' || new.title,
    'Detectada na ordem de serviço #' || coalesce(v_os.number::text, '(sem número)') ||
      ', etapa "' || new.title || '". Resposta registrada: ' ||
      coalesce(new.value_number::text, new.value_text, new.value_boolean::text, '(sem valor)') ||
      '. ' || v_faixa || '.',
    v_os.category,
    'alta',
    'nova',
    v_os.asset_id,
    v_os.location_id,
    new.answered_by
  );

  return new;
end;
$$;

drop trigger if exists abrir_nao_conformidade on public.work_order_step_results;
create trigger abrir_nao_conformidade after insert or update on public.work_order_step_results
  for each row execute function public.abrir_nao_conformidade();

-- ------------------------------------------------------------
-- A geração de preventivas NÃO é agendada aqui de propósito.
--
-- Ligar um pg_cron nesta migration criaria trabalho novo aparecendo
-- sozinho em produção antes de existir tela para vê-lo. O agendamento
-- entra na Fase 2D, junto com a interface. Enquanto isso, dá para
-- disparar sob demanda:
--
--   select * from public.gerar_os_preventivas();        -- operação
--   select * from public.gerar_minhas_os_preventivas(); -- síndico
-- ------------------------------------------------------------
