import { beforeAll, describe, expect, it } from 'vitest';
import { hasTestEnv, signUpSindico, signUpUser } from './helpers';

// Fase 2A — validação das tabelas novas do domínio de manutenção.
// Nesta fase as tabelas nascem vazias: o que se testa aqui é a
// ESTRUTURA (isolamento entre condomínios, permissão por papel,
// auditoria e soft delete), não migração de dados — essa é a 2B.
describe.skipIf(!hasTestEnv)('Fase 2A — estrutura do domínio de manutenção', () => {
  let a: Awaited<ReturnType<typeof signUpSindico>>;
  let b: Awaited<ReturnType<typeof signUpSindico>>;
  let func: Awaited<ReturnType<typeof signUpUser>>;

  beforeAll(async () => {
    a = await signUpSindico('f2a');
    b = await signUpSindico('f2b');
    func = await signUpUser('f2f');
  }, 60000);

  it('síndico cria localização e ativo, com o condomínio carimbado pelo servidor', async () => {
    const { data: loc, error: locErr } = await a.client
      .from('locations')
      .insert({ name: 'Bloco A', kind: 'bloco', created_by: a.userId })
      .select()
      .single();
    expect(locErr).toBeNull();
    // O cliente não enviou condominio_id — o trigger derivou de auth.uid().
    expect(loc!.condominio_id).toBe(a.condominioId);

    const { data: asset, error: assetErr } = await a.client
      .from('assets')
      .insert({
        name: 'Gerador principal',
        category: 'gerador',
        location_id: loc!.id,
        location_text: 'Casa de máquinas',
        criticality: 'critica',
        created_by: a.userId,
      })
      .select()
      .single();
    expect(assetErr).toBeNull();
    expect(asset!.condominio_id).toBe(a.condominioId);
    expect(asset!.operational_status).toBe('operando');
  }, 30000);

  it('um ativo aceita vários planos de manutenção — o que hoje é impossível', async () => {
    const { data: asset } = await a.client
      .from('assets')
      .insert({ name: 'Elevador social', category: 'elevador', created_by: a.userId })
      .select()
      .single();

    const { data: mensal, error: e1 } = await a.client
      .from('maintenance_plans')
      .insert({
        asset_id: asset!.id,
        name: 'Troca de filtro',
        frequency_type: 'mensal',
        next_due_at: '2026-09-01',
        created_by: a.userId,
      })
      .select()
      .single();
    expect(e1).toBeNull();

    const { data: anual, error: e2 } = await a.client
      .from('maintenance_plans')
      .insert({
        asset_id: asset!.id,
        name: 'Revisão geral',
        frequency_type: 'anual',
        next_due_at: '2027-01-01',
        created_by: a.userId,
      })
      .select()
      .single();
    expect(e2).toBeNull();

    const { data: planos } = await a.client
      .from('maintenance_plans')
      .select('id')
      .eq('asset_id', asset!.id);
    expect((planos ?? []).length).toBe(2);
    expect(mensal!.id).not.toBe(anual!.id);
  }, 30000);

  it('plano exige ativo ou localização — não aceita ficar solto', async () => {
    const { error } = await a.client
      .from('maintenance_plans')
      .insert({ name: 'Plano órfão', frequency_type: 'mensal', created_by: a.userId });
    expect(error).not.toBeNull();
  }, 30000);

  it('etapas do plano respeitam ordem única e faixa mín/máx coerente', async () => {
    const { data: asset } = await a.client
      .from('assets')
      .insert({ name: 'Bomba de recalque', category: 'bomba', created_by: a.userId })
      .select()
      .single();
    const { data: plano } = await a.client
      .from('maintenance_plans')
      .insert({ asset_id: asset!.id, name: 'Inspeção', frequency_type: 'semanal', created_by: a.userId })
      .select()
      .single();

    const { error: okErr } = await a.client.from('maintenance_plan_steps').insert({
      plan_id: plano!.id,
      order_index: 1,
      title: 'Medir pressão',
      response_type: 'numero',
      min_value: 2,
      max_value: 6,
      creates_nonconformity: true,
    });
    expect(okErr).toBeNull();

    // Mesma ordem no mesmo plano deve ser recusada.
    const { error: dupErr } = await a.client.from('maintenance_plan_steps').insert({
      plan_id: plano!.id,
      order_index: 1,
      title: 'Duplicada',
    });
    expect(dupErr).not.toBeNull();

    // Faixa invertida deve ser recusada.
    const { error: faixaErr } = await a.client.from('maintenance_plan_steps').insert({
      plan_id: plano!.id,
      order_index: 2,
      title: 'Faixa inválida',
      response_type: 'numero',
      min_value: 10,
      max_value: 1,
    });
    expect(faixaErr).not.toBeNull();
  }, 30000);

  it('ocorrência e ordem de serviço recebem numeração sequencial por condomínio', async () => {
    const { data: inc, error: incErr } = await a.client
      .from('incidents')
      .insert({
        title: 'Infiltração na garagem',
        description: 'mancha no teto perto da vaga 12',
        category: 'infiltracao',
        reported_by: a.userId,
      })
      .select()
      .single();
    expect(incErr).toBeNull();
    expect(inc!.number).toBeGreaterThan(0);
    expect(inc!.status).toBe('nova');

    // Uma ocorrência pode gerar mais de uma OS — o ponto central da fase.
    const { data: os1, error: os1Err } = await a.client
      .from('work_orders')
      .insert({
        origin_type: 'incidente',
        incident_id: inc!.id,
        title: 'Impermeabilizar laje',
        requested_by: a.userId,
      })
      .select()
      .single();
    expect(os1Err).toBeNull();
    expect(os1!.number).toBeGreaterThan(0);

    const { data: os2 } = await a.client
      .from('work_orders')
      .insert({
        origin_type: 'incidente',
        incident_id: inc!.id,
        title: 'Repintar teto',
        requested_by: a.userId,
      })
      .select()
      .single();

    expect(os2!.number).toBe(os1!.number + 1);

    const { data: ordens } = await a.client
      .from('work_orders')
      .select('id')
      .eq('incident_id', inc!.id);
    expect((ordens ?? []).length).toBe(2);
  }, 30000);

  it('evidência fica visível só através da OS a que pertence', async () => {
    const { data: os } = await a.client
      .from('work_orders')
      .insert({ title: 'OS com evidência', requested_by: a.userId })
      .select()
      .single();

    const { error: evErr } = await a.client.from('work_order_evidence').insert({
      work_order_id: os!.id,
      kind: 'foto_antes',
      file_url: `${a.condominioId}/work_orders/${a.userId}/antes.jpg`,
      uploaded_by: a.userId,
    });
    expect(evErr).toBeNull();

    const { data: vistasPorB } = await b.client
      .from('work_order_evidence')
      .select('id')
      .eq('work_order_id', os!.id);
    expect(vistasPorB ?? []).toHaveLength(0);
  }, 30000);

  it('condomínio A não enxerga nada do condomínio B nas tabelas novas', async () => {
    const { data: locB } = await b.client
      .from('locations')
      .insert({ name: 'Torre B', kind: 'bloco', created_by: b.userId })
      .select()
      .single();
    const { data: assetB } = await b.client
      .from('assets')
      .insert({ name: 'Portão B', category: 'portao', created_by: b.userId })
      .select()
      .single();
    const { data: incB } = await b.client
      .from('incidents')
      .insert({ title: 'Ocorrência B', description: 'só do B', reported_by: b.userId })
      .select()
      .single();
    const { data: osB } = await b.client
      .from('work_orders')
      .insert({ title: 'OS do B', requested_by: b.userId })
      .select()
      .single();

    const [locs, assets, incs, oss] = await Promise.all([
      a.client.from('locations').select('id').eq('id', locB!.id),
      a.client.from('assets').select('id').eq('id', assetB!.id),
      a.client.from('incidents').select('id').eq('id', incB!.id),
      a.client.from('work_orders').select('id').eq('id', osB!.id),
    ]);

    expect(locs.data ?? []).toHaveLength(0);
    expect(assets.data ?? []).toHaveLength(0);
    expect(incs.data ?? []).toHaveLength(0);
    expect(oss.data ?? []).toHaveLength(0);
  }, 30000);

  it('funcionário sem condomínio não lê nem escreve nas tabelas novas', async () => {
    const [locs, assets, plans, oss] = await Promise.all([
      func.client.from('locations').select('id'),
      func.client.from('assets').select('id'),
      func.client.from('maintenance_plans').select('id'),
      func.client.from('work_orders').select('id'),
    ]);
    expect(locs.data ?? []).toHaveLength(0);
    expect(assets.data ?? []).toHaveLength(0);
    expect(plans.data ?? []).toHaveLength(0);
    expect(oss.data ?? []).toHaveLength(0);

    // Cadastro de ativo é exclusivo do síndico.
    const { error } = await func.client
      .from('assets')
      .insert({ name: 'Ativo intruso', created_by: func.userId });
    expect(error).not.toBeNull();
  }, 30000);

  it('as tabelas novas geram evento de auditoria e aceitam soft delete', async () => {
    const { data: asset } = await a.client
      .from('assets')
      .insert({ name: 'Ativo auditado', category: 'outro', created_by: a.userId })
      .select()
      .single();

    const { data: criacao } = await a.client
      .from('audit_events')
      .select('action, record_type')
      .eq('record_id', asset!.id);
    expect((criacao ?? []).length).toBeGreaterThan(0);
    expect(criacao![0].record_type).toBe('asset');

    await a.client
      .from('assets')
      .update({ deleted_at: new Date().toISOString(), deleted_by: a.userId })
      .eq('id', asset!.id);

    // Síndico continua enxergando o excluído (é quem pode restaurar).
    const { data: aindaVisivel } = await a.client
      .from('assets')
      .select('name, deleted_at')
      .eq('id', asset!.id)
      .maybeSingle();
    expect(aindaVisivel).not.toBeNull();
    expect(aindaVisivel!.name).toBe('Ativo auditado');

    const { data: eventos } = await a.client
      .from('audit_events')
      .select('action')
      .eq('record_id', asset!.id);
    expect((eventos ?? []).map((e) => e.action)).toContain('deleted');
  }, 30000);
});
