-- ============================================================
-- Fase 2D (Domínio de Manutenção) — mecanismo de corte.
--
-- Até aqui, occurrences/maintenance_items/maintenance_records eram a
-- fonte da verdade e as tabelas novas um espelho, atualizado pelo
-- backfill da 2B. O corte inverte isso: a partir dele, quem manda é o
-- modelo novo.
--
-- E é aí que mora o perigo desta fase: com a inversão feita, uma
-- re-sincronização rodada por engano SOBRESCREVERIA o modelo novo com
-- dado legado velho — apagando trabalho real. Esta migration existe
-- para tornar isso impossível, antes de qualquer tela mudar.
-- ============================================================

-- Momento em que o condomínio deixou de ser espelhado. Nulo = ainda
-- espelhado (telas antigas mandam).
alter table public.condominios
  add column if not exists dominio_cortado_em timestamptz;

comment on column public.condominios.dominio_cortado_em is
  'Quando o condomínio passou a usar o domínio de manutenção novo como fonte da verdade. '
  'A partir daí o backfill da Fase 2B ignora este condomínio.';

-- ------------------------------------------------------------
-- A trava.
--
-- Fica onde o perigo está — na escrita — e não dentro do backfill: uma
-- guarda de dez linhas na porta vale mais que espalhar condições por
-- seis comandos de cópia, e continua valendo se alguém escrever um
-- backfill novo amanhã.
--
-- Retornar NULL num gatilho BEFORE descarta a linha silenciosamente,
-- que é exatamente o desejado: a cópia de um condomínio já cortado não
-- é erro, é caso previsto — só não deve acontecer.
-- ------------------------------------------------------------
create or replace function public.ignorar_espelho_apos_corte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sincronizando_legado() then
    return new;
  end if;

  if exists (
    select 1 from public.condominios c
    where c.id = new.condominio_id and c.dominio_cortado_em is not null
  ) then
    return null;
  end if;

  return new;
end;
$$;

-- O nome começa com "a_" para rodar antes dos demais gatilhos BEFORE
-- (o Postgres dispara em ordem alfabética): descartar a linha cedo evita
-- que carimbos e validações trabalhem à toa.
do $$
declare
  t text;
begin
  foreach t in array array['assets', 'maintenance_plans', 'incidents', 'work_orders']
  loop
    execute format('drop trigger if exists a_ignorar_espelho_apos_corte on public.%I', t);
    execute format(
      'create trigger a_ignorar_espelho_apos_corte before insert or update on public.%I '
      'for each row execute function public.ignorar_espelho_apos_corte()',
      t
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- O corte propriamente dito.
--
-- A ordem importa e é o coração desta função: re-sincroniza PRIMEIRO,
-- marca DEPOIS. Entre a última cópia e o corte não pode haver janela —
-- qualquer coisa registrada nas telas antigas nesse intervalo ficaria
-- para trás. Como as duas coisas acontecem na mesma transação, ou o
-- condomínio atravessa inteiro ou não atravessa.
-- ------------------------------------------------------------
create or replace function public.cortar_dominio_manutencao()
returns table (destino text, linhas bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_condominio uuid := public.current_condominio_id();
  v_ja timestamptz;
begin
  if v_condominio is null or not public.is_sindico() then
    raise exception 'Apenas o síndico de um condomínio pode fazer o corte.';
  end if;

  select dominio_cortado_em into v_ja from public.condominios where id = v_condominio;
  if v_ja is not null then
    raise exception 'Este condomínio já foi cortado em % — o corte não se repete.', v_ja;
  end if;

  -- Última cópia, ainda com o espelho valendo.
  return query select * from public.fase2_backfill(v_condominio);

  update public.condominios
     set dominio_cortado_em = now()
   where id = v_condominio;
end;
$$;

revoke execute on function public.cortar_dominio_manutencao() from public;
grant execute on function public.cortar_dominio_manutencao() to authenticated;

-- ------------------------------------------------------------
-- Desfazer o corte — operação, não aplicativo.
--
-- Sem grant para "authenticated", e por um motivo concreto: reativar o
-- espelho faz a próxima re-sincronização sobrescrever, com o conteúdo
-- das tabelas antigas, tudo o que tiver sido feito no modelo novo desde
-- o corte. É uma saída de emergência para quem sabe o que está fazendo,
-- não um botão de tela.
-- ------------------------------------------------------------
create or replace function public.reverter_corte_dominio(p_condominio_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.condominios set dominio_cortado_em = null where id = p_condominio_id;
$$;

revoke execute on function public.reverter_corte_dominio(uuid) from public;
