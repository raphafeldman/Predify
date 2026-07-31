import { beforeAll, describe, expect, it } from 'vitest';
import { hasTestEnv, signUpSindico, signUpUser } from './helpers';

// Unidades e encomendas.
//
// O que se testa aqui é o que o banco garante sozinho: identificação da
// unidade, isolamento entre condomínios e — o ponto central — o carimbo
// da baixa. Data e autor da entrega são o que dá valor de comprovação
// ao registro, então não podem depender de a tela lembrar de preenchê-los.
describe.skipIf(!hasTestEnv)('Unidades e encomendas', () => {
  let a: Awaited<ReturnType<typeof signUpSindico>>;
  let b: Awaited<ReturnType<typeof signUpSindico>>;
  let semCondominio: Awaited<ReturnType<typeof signUpUser>>;
  let unidadeId: string;

  beforeAll(async () => {
    a = await signUpSindico('enc-a');
    b = await signUpSindico('enc-b');
    semCondominio = await signUpUser('enc-sem');

    const { data, error } = await a.client
      .from('units')
      .insert({ block: 'A', number: '302', floor: '3', created_by: a.userId })
      .select()
      .single();
    if (error) throw error;
    unidadeId = data!.id;
  }, 120000);

  it('a unidade recebe o condomínio do servidor e monta o rótulo sozinha', async () => {
    const { data } = await a.client.from('units').select('*').eq('id', unidadeId).single();
    expect(data!.condominio_id).toBe(a.condominioId);
    expect(data!.label).toBe('A-302');
    expect(data!.active).toBe(true);
  }, 30000);

  it('prédio sem blocos usa só o número como rótulo', async () => {
    const { data, error } = await a.client
      .from('units')
      .insert({ number: '11', created_by: a.userId })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data!.label).toBe('11');
  }, 30000);

  it('a mesma unidade não pode ser cadastrada duas vezes', async () => {
    const { error } = await a.client
      .from('units')
      .insert({ block: 'A', number: '302', created_by: a.userId });
    expect(error).not.toBeNull();
  }, 30000);

  it('funcionário sem condomínio não cadastra unidade nem enxerga as existentes', async () => {
    const { error } = await semCondominio.client
      .from('units')
      .insert({ number: '999', created_by: semCondominio.userId });
    expect(error).not.toBeNull();

    const { data } = await semCondominio.client.from('units').select('id');
    expect(data ?? []).toHaveLength(0);
  }, 30000);

  it('registra a encomenda como recebida, sem baixa', async () => {
    const { data, error } = await a.client
      .from('deliveries')
      .insert({
        unit_id: unidadeId,
        store: 'Amazon',
        recipient_name: 'Marina',
        tracking_code: 'BR123456789',
        photo_urls: ['portaria/etiqueta.jpg'],
        received_by: a.userId,
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data!.status).toBe('recebida');
    expect(data!.condominio_id).toBe(a.condominioId);
    expect(data!.delivered_at).toBeNull();
    expect(data!.delivered_by).toBeNull();
  }, 30000);

  // O teste central.
  it('dar baixa carimba data e autor da entrega automaticamente', async () => {
    const { data: enc } = await a.client
      .from('deliveries')
      .insert({ unit_id: unidadeId, store: 'Mercado Livre', received_by: a.userId })
      .select()
      .single();

    const { error } = await a.client
      .from('deliveries')
      .update({ status: 'entregue' })
      .eq('id', enc!.id);
    expect(error).toBeNull();

    const { data: depois } = await a.client
      .from('deliveries')
      .select('status, delivered_at, delivered_by')
      .eq('id', enc!.id)
      .single();

    // A tela não enviou nem a data nem o autor — o banco preencheu.
    expect(depois!.status).toBe('entregue');
    expect(depois!.delivered_at).not.toBeNull();
    expect(depois!.delivered_by).toBe(a.userId);
  }, 60000);

  it('desfazer a entrega limpa a baixa, para não guardar comprovação falsa', async () => {
    const { data: enc } = await a.client
      .from('deliveries')
      .insert({ unit_id: unidadeId, store: 'Magalu', received_by: a.userId })
      .select()
      .single();

    await a.client.from('deliveries').update({ status: 'entregue' }).eq('id', enc!.id);
    await a.client.from('deliveries').update({ status: 'recebida' }).eq('id', enc!.id);

    const { data: depois } = await a.client
      .from('deliveries')
      .select('status, delivered_at, delivered_by, delivery_photo_urls')
      .eq('id', enc!.id)
      .single();
    expect(depois!.status).toBe('recebida');
    expect(depois!.delivered_at).toBeNull();
    expect(depois!.delivered_by).toBeNull();
    expect(depois!.delivery_photo_urls).toEqual([]);
  }, 60000);

  it('não se grava "entregue" sem quando e por quem', async () => {
    // A restrição vale mesmo na inserção direta, onde o gatilho de baixa
    // (que é BEFORE UPDATE) não entra em ação.
    const { error } = await a.client.from('deliveries').insert({
      unit_id: unidadeId,
      status: 'entregue',
      received_by: a.userId,
    });
    expect(error).not.toBeNull();
  }, 30000);

  it('devolvida é um desfecho próprio, distinto de entregue', async () => {
    const { data: enc } = await a.client
      .from('deliveries')
      .insert({ unit_id: unidadeId, store: 'Shopee', received_by: a.userId })
      .select()
      .single();

    const { error } = await a.client
      .from('deliveries')
      .update({ status: 'devolvida', returned_reason: 'Morador recusou' })
      .eq('id', enc!.id);
    expect(error).toBeNull();

    const { data: depois } = await a.client
      .from('deliveries')
      .select('status, delivered_at, returned_reason')
      .eq('id', enc!.id)
      .single();
    expect(depois!.status).toBe('devolvida');
    expect(depois!.delivered_at).toBeNull();
    expect(depois!.returned_reason).toBe('Morador recusou');
  }, 60000);

  it('um condomínio não enxerga unidades nem encomendas do outro', async () => {
    const { data: unidadesDeB } = await b.client.from('units').select('id');
    expect(unidadesDeB ?? []).toHaveLength(0);

    const { data: encomendasDeB } = await b.client.from('deliveries').select('id');
    expect(encomendasDeB ?? []).toHaveLength(0);

    // E não consegue registrar encomenda numa unidade alheia.
    const { error } = await b.client
      .from('deliveries')
      .insert({ unit_id: unidadeId, received_by: b.userId });
    expect(error).not.toBeNull();
  }, 60000);

  it('a baixa fica na trilha de auditoria', async () => {
    const { data: enc } = await a.client
      .from('deliveries')
      .insert({ unit_id: unidadeId, store: 'Correios', received_by: a.userId })
      .select()
      .single();
    await a.client.from('deliveries').update({ status: 'entregue' }).eq('id', enc!.id);

    const { data: eventos } = await a.client
      .from('audit_events')
      .select('action, record_type')
      .eq('record_id', enc!.id);

    const acoes = (eventos ?? []).map((e) => e.action);
    expect(acoes).toContain('created');
    expect(acoes).toContain('status_changed');
    expect(eventos![0].record_type).toBe('delivery');
  }, 60000);

  it('a busca responde por apartamento, por loja e por período', async () => {
    const { data: porUnidade } = await a.client
      .from('deliveries')
      .select('id, store')
      .eq('unit_id', unidadeId);
    expect((porUnidade ?? []).length).toBeGreaterThan(1);

    const { data: porLoja } = await a.client
      .from('deliveries')
      .select('id')
      .eq('unit_id', unidadeId)
      .eq('store', 'Amazon');
    expect((porLoja ?? []).length).toBe(1);

    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: porPeriodo } = await a.client
      .from('deliveries')
      .select('id')
      .gte('received_at', ontem);
    expect((porPeriodo ?? []).length).toBeGreaterThan(0);
  }, 60000);
});
