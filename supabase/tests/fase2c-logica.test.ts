import { beforeAll, describe, expect, it } from 'vitest';
import { hasTestEnv, signUpSindico } from './helpers';

// Fase 2C — lógica de domínio.
//
// A 2A deu estrutura e a 2B deu dados; aqui o modelo ganha
// comportamento. O que se testa é o que o banco passa a garantir
// sozinho, independentemente de qual tela chame: plano vira ordem,
// status obedece a uma máquina de estados, concluir preventiva empurra
// o vencimento, e leitura fora da faixa vira não conformidade.
describe.skipIf(!hasTestEnv)('Fase 2C — lógica do domínio de manutenção', () => {
  let a: Awaited<ReturnType<typeof signUpSindico>>;
  let assetId: string;

  beforeAll(async () => {
    a = await signUpSindico('f2c');
    const { data: asset, error } = await a.client
      .from('assets')
      .insert({
        name: 'Bomba de recalque',
        category: 'bomba',
        criticality: 'critica',
        created_by: a.userId,
      })
      .select()
      .single();
    if (error) throw error;
    assetId = asset!.id;
  }, 90000);

  // Cria um plano vencendo hoje, pronto para virar ordem.
  async function criarPlano(overrides: Record<string, unknown> = {}) {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await a.client
      .from('maintenance_plans')
      .insert({
        asset_id: assetId,
        name: 'Inspeção da bomba',
        frequency_type: 'mensal',
        next_due_at: hoje,
        created_by: a.userId,
        ...overrides,
      })
      .select()
      .single();
    if (error) throw error;
    return data!;
  }

  it('calcula o próximo vencimento por frequência, e recusa gatilho não temporal', async () => {
    const { data, error } = await a.client.rpc('proximo_vencimento', {
      p_frequencia: 'mensal',
      p_intervalo: 1,
      p_base: '2026-01-31',
    });
    expect(error).toBeNull();
    // Postgres resolve 31/jan + 1 mês para o último dia de fevereiro.
    expect(data).toBe('2026-02-28');

    const { data: trimestral } = await a.client.rpc('proximo_vencimento', {
      p_frequencia: 'trimestral',
      p_intervalo: 1,
      p_base: '2026-01-15',
    });
    expect(trimestral).toBe('2026-04-15');

    const { data: quinzenal } = await a.client.rpc('proximo_vencimento', {
      p_frequencia: 'quinzenal',
      p_intervalo: 1,
      p_base: '2026-01-01',
    });
    expect(quinzenal).toBe('2026-01-15');

    // Medidor e horas de funcionamento não se calculam por calendário.
    const { data: medidor } = await a.client.rpc('proximo_vencimento', {
      p_frequencia: 'medidor',
      p_intervalo: 1,
      p_base: '2026-01-01',
    });
    expect(medidor).toBeNull();
  }, 30000);

  it('o plano vencido vira ordem de serviço sozinho, uma única vez', async () => {
    const plano = await criarPlano();

    const { data: geradas, error } = await a.client.rpc('gerar_minhas_os_preventivas');
    expect(error).toBeNull();
    const daMinha = (geradas ?? []).filter((g: { plano_id: string }) => g.plano_id === plano.id);
    expect(daMinha).toHaveLength(1);

    const { data: os } = await a.client
      .from('work_orders')
      .select('*')
      .eq('maintenance_plan_id', plano.id);
    expect(os ?? []).toHaveLength(1);
    expect(os![0].origin_type).toBe('preventiva');
    expect(os![0].asset_id).toBe(assetId);
    expect(os![0].status).toBe('aberta');
    // Ativo crítico eleva a prioridade da ordem.
    expect(os![0].priority).toBe('urgente');
    expect(os![0].plan_cycle_date).toBe(plano.next_due_at);

    // Rodar de novo no mesmo ciclo não pode duplicar.
    await a.client.rpc('gerar_minhas_os_preventivas');
    const { data: depois } = await a.client
      .from('work_orders')
      .select('id')
      .eq('maintenance_plan_id', plano.id);
    expect(depois ?? []).toHaveLength(1);
  }, 60000);

  it('plano inativo ou com vencimento distante não gera ordem', async () => {
    const inativo = await criarPlano({ name: 'Plano desligado', active: false });
    const distante = await criarPlano({ name: 'Plano futuro', next_due_at: '2027-12-31' });

    await a.client.rpc('gerar_minhas_os_preventivas');

    const { data: os } = await a.client
      .from('work_orders')
      .select('id')
      .in('maintenance_plan_id', [inativo.id, distante.id]);
    expect(os ?? []).toHaveLength(0);
  }, 60000);

  it('a máquina de estados recusa retrocesso e aceita o fluxo normal', async () => {
    const { data: os } = await a.client
      .from('work_orders')
      .insert({ title: 'OS de fluxo', requested_by: a.userId })
      .select()
      .single();

    const mover = (status: string) =>
      a.client.from('work_orders').update({ status }).eq('id', os!.id);

    expect((await mover('em_execucao')).error).toBeNull();
    expect((await mover('pausada')).error).toBeNull();
    expect((await mover('em_execucao')).error).toBeNull();
    expect((await mover('concluida')).error).toBeNull();
    expect((await mover('encerrada')).error).toBeNull();

    // De encerrada só se sai reabrindo.
    expect((await mover('em_triagem')).error).not.toBeNull();
    expect((await mover('aberta')).error).not.toBeNull();
    expect((await mover('reaberta')).error).toBeNull();
  }, 60000);

  it('o domínio carimba início, conclusão e limpa a conclusão ao reabrir', async () => {
    const { data: os } = await a.client
      .from('work_orders')
      .insert({ title: 'OS de carimbos', requested_by: a.userId })
      .select()
      .single();

    await a.client.from('work_orders').update({ status: 'em_execucao' }).eq('id', os!.id);
    const { data: emExecucao } = await a.client
      .from('work_orders')
      .select('started_at, completed_at')
      .eq('id', os!.id)
      .single();
    expect(emExecucao!.started_at).not.toBeNull();
    expect(emExecucao!.completed_at).toBeNull();

    await a.client.from('work_orders').update({ status: 'concluida' }).eq('id', os!.id);
    const { data: concluida } = await a.client
      .from('work_orders')
      .select('completed_at')
      .eq('id', os!.id)
      .single();
    expect(concluida!.completed_at).not.toBeNull();

    await a.client.from('work_orders').update({ status: 'reaberta' }).eq('id', os!.id);
    const { data: reaberta } = await a.client
      .from('work_orders')
      .select('completed_at, validated_at')
      .eq('id', os!.id)
      .single();
    expect(reaberta!.completed_at).toBeNull();
    expect(reaberta!.validated_at).toBeNull();
  }, 60000);

  it('concluir a preventiva empurra o vencimento do plano um ciclo à frente', async () => {
    const plano = await criarPlano({ name: 'Ciclo mensal' });
    await a.client.rpc('gerar_minhas_os_preventivas');

    const { data: os } = await a.client
      .from('work_orders')
      .select('id')
      .eq('maintenance_plan_id', plano.id)
      .single();

    await a.client.from('work_orders').update({ status: 'em_execucao' }).eq('id', os!.id);
    await a.client.from('work_orders').update({ status: 'concluida' }).eq('id', os!.id);

    const { data: depois } = await a.client
      .from('maintenance_plans')
      .select('next_due_at')
      .eq('id', plano.id)
      .single();

    // A cadência é ancorada no vencimento programado, não na data em que
    // se concluiu — e o próximo tem de estar no futuro.
    const { data: esperado } = await a.client.rpc('proximo_vencimento', {
      p_frequencia: 'mensal',
      p_intervalo: 1,
      p_base: plano.next_due_at,
    });
    expect(depois!.next_due_at).toBe(esperado);
    expect(new Date(depois!.next_due_at) > new Date()).toBe(true);
  }, 90000);

  it('resposta fora da faixa reprova a etapa e abre uma não conformidade', async () => {
    const plano = await criarPlano({ name: 'Plano com checklist' });
    const { data: etapa, error: etapaErr } = await a.client
      .from('maintenance_plan_steps')
      .insert({
        plan_id: plano.id,
        order_index: 1,
        title: 'Pressão de saída',
        response_type: 'numero',
        min_value: 2,
        max_value: 6,
        creates_nonconformity: true,
      })
      .select()
      .single();
    expect(etapaErr).toBeNull();

    await a.client.rpc('gerar_minhas_os_preventivas');
    const { data: os } = await a.client
      .from('work_orders')
      .select('id, number')
      .eq('maintenance_plan_id', plano.id)
      .single();

    const { data: resultado, error } = await a.client
      .from('work_order_step_results')
      .insert({
        work_order_id: os!.id,
        plan_step_id: etapa!.id,
        order_index: 1,
        title: 'Pressão de saída',
        response_type: 'numero',
        value_number: 1.2,
        answered_by: a.userId,
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(resultado!.conforme).toBe(false);

    const { data: naoConformidades } = await a.client
      .from('incidents')
      .select('title, severity, asset_id, description')
      .eq('asset_id', assetId)
      .like('title', 'Não conformidade:%');
    expect((naoConformidades ?? []).length).toBeGreaterThan(0);

    const nc = naoConformidades![0];
    expect(nc.severity).toBe('alta');
    expect(nc.description).toContain('1.2');
    expect(nc.description).toContain('2 a 6');
  }, 90000);

  it('resposta dentro da faixa é conforme e não abre ocorrência', async () => {
    const plano = await criarPlano({ name: 'Plano conforme' });
    const { data: etapa } = await a.client
      .from('maintenance_plan_steps')
      .insert({
        plan_id: plano.id,
        order_index: 1,
        title: 'Temperatura do mancal',
        response_type: 'numero',
        min_value: 10,
        max_value: 80,
        creates_nonconformity: true,
      })
      .select()
      .single();

    await a.client.rpc('gerar_minhas_os_preventivas');
    const { data: os } = await a.client
      .from('work_orders')
      .select('id')
      .eq('maintenance_plan_id', plano.id)
      .single();

    const antes = await a.client
      .from('incidents')
      .select('id')
      .like('title', 'Não conformidade:%');

    const { data: resultado } = await a.client
      .from('work_order_step_results')
      .insert({
        work_order_id: os!.id,
        plan_step_id: etapa!.id,
        order_index: 1,
        title: 'Temperatura do mancal',
        response_type: 'numero',
        value_number: 45,
        answered_by: a.userId,
      })
      .select()
      .single();
    expect(resultado!.conforme).toBe(true);

    const depois = await a.client
      .from('incidents')
      .select('id')
      .like('title', 'Não conformidade:%');
    expect((depois.data ?? []).length).toBe((antes.data ?? []).length);
  }, 90000);

  it('a re-sincronização do legado não é barrada pela máquina de estados', async () => {
    // Uma ordem migrada que precise voltar de "encerrada" porque o
    // registro antigo foi reaberto: o backfill espelha, não transiciona.
    const { data: ocorrencia } = await a.client
      .from('occurrences')
      .insert({
        title: 'Ocorrência que será reaberta',
        description: 'ciclo de vida no modelo antigo',
        category: 'outro',
        status: 'concluida',
        created_by: a.userId,
      })
      .select()
      .single();

    await a.client.rpc('fase2_resincronizar');
    const { data: migrada } = await a.client
      .from('work_orders')
      .select('status')
      .eq('id', ocorrencia!.id)
      .single();
    expect(migrada!.status).toBe('encerrada');

    // Reabre no modelo antigo e re-sincroniza: não pode explodir.
    await a.client
      .from('occurrences')
      .update({ status: 'em_andamento' })
      .eq('id', ocorrencia!.id);

    const { error } = await a.client.rpc('fase2_resincronizar');
    expect(error).toBeNull();

    const { data: depois } = await a.client
      .from('work_orders')
      .select('status')
      .eq('id', ocorrencia!.id)
      .single();
    expect(depois!.status).toBe('em_execucao');
  }, 90000);

  it('funcionário de outro condomínio não enxerga resultados de etapa', async () => {
    const b = await signUpSindico('f2cb');
    const { data: vistos } = await b.client.from('work_order_step_results').select('id');
    expect(vistos ?? []).toHaveLength(0);

    const { data: planosVistos } = await b.client.from('maintenance_plans').select('id');
    expect(planosVistos ?? []).toHaveLength(0);
  }, 90000);
});
