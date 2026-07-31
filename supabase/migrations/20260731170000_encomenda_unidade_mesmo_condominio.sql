-- ============================================================
-- CORREÇÃO — encomenda podia apontar para unidade de outro condomínio.
--
-- A policy de insert de `deliveries` conferia `received_by` e
-- `condominio_id`, mas nada amarrava `unit_id` ao mesmo condomínio. Um
-- síndico do condomínio B conseguia gravar uma encomenda no PRÓPRIO
-- condomínio referenciando uma unidade do condomínio A.
--
-- Ele não lê a unidade alheia (o RLS de `units` bloqueia o select), mas
-- referenciá-la já é acesso cruzado: além do vínculo inválido, o
-- sucesso ou a falha do insert revela se um id de unidade existe.
--
-- A correção é estrutural, não uma policy a mais: chave estrangeira
-- COMPOSTA por (unit_id, condominio_id). Assim a coerência é garantida
-- pelo próprio banco, para qualquer caminho de escrita — inclusive
-- service_role, migration e cron, que passam por cima do RLS.
-- ============================================================

-- Se já existir encomenda apontando para unidade de outro condomínio, a
-- chave abaixo não nasce — e o erro do Postgres não diz o que fazer.
-- Esta verificação para antes, dizendo exatamente quantas linhas estão
-- inconsistentes. Corrigir é decisão de quem opera: apagar um registro
-- de encomenda não é algo que uma migration deva fazer por conta.
do $$
declare
  v_invalidas integer;
begin
  select count(*) into v_invalidas
    from public.deliveries d
    join public.units u on u.id = d.unit_id
   where u.condominio_id is distinct from d.condominio_id;

  if v_invalidas > 0 then
    raise exception
      'Existem % encomenda(s) apontando para unidade de outro condomínio. '
      'Elas precisam ser corrigidas ou removidas antes desta migration. '
      'Para listá-las: select d.id, d.condominio_id, u.condominio_id as condominio_da_unidade '
      'from public.deliveries d join public.units u on u.id = d.unit_id '
      'where u.condominio_id is distinct from d.condominio_id;',
      v_invalidas;
  end if;
end $$;

-- Pré-requisito da chave composta: o par precisa ser único na origem.
-- Como `id` já é chave primária, isto não restringe nada de novo.
alter table public.units drop constraint if exists units_id_condominio_uk;
alter table public.units add constraint units_id_condominio_uk unique (id, condominio_id);

alter table public.deliveries drop constraint if exists deliveries_unit_id_fkey;
alter table public.deliveries drop constraint if exists deliveries_unit_condominio_fkey;
alter table public.deliveries add constraint deliveries_unit_condominio_fkey
  foreign key (unit_id, condominio_id)
  references public.units (id, condominio_id)
  on delete restrict;

-- A policy também passa a exigir a unidade visível ao chamador. É
-- redundante com a chave acima e assim deve ser: a mensagem de erro
-- fica compreensível ("nenhuma linha satisfaz a policy") em vez de
-- expor uma violação de integridade referencial, e a regra continua
-- valendo se a chave for mexida um dia.
drop policy if exists "deliveries_insert" on public.deliveries;
create policy "deliveries_insert" on public.deliveries
  for insert to authenticated
  with check (
    received_by = auth.uid()
    and condominio_id = public.current_condominio_id()
    and exists (
      select 1 from public.units u
      where u.id = unit_id and u.condominio_id = public.current_condominio_id()
    )
  );
