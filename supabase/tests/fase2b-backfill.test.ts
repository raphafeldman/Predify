import { beforeAll, describe, expect, it } from 'vitest';
import { hasTestEnv, signUpSindico, signUpUser } from './helpers';

// Fase 2B — migração dos dados existentes para o domínio novo.
//
// Diferente da 2A (que testou estrutura com tabelas vazias), aqui o
// alvo é a CÓPIA: nada pode se perder, nada pode vazar entre
// condomínios, o número da OS tem de sobreviver, e reexecutar não pode
// duplicar. Os dados legados são criados pelo fluxo real do app, e o
// backfill é disparado por `fase2_resincronizar()` — o mesmo caminho
// que a Fase 2D vai usar no corte de cada tela.
describe.skipIf(!hasTestEnv)('Fase 2B — backfill do domínio de manutenção', () => {
  let a: Awaited<ReturnType<typeof signUpSindico>>;
  let b: Awaited<ReturnType<typeof signUpSindico>>;
  let semCondominio: Awaited<ReturnType<typeof signUpUser>>;

  // Ids dos registros legados do condomínio A.
  let itemId: string;
  let osNumber: number;
  let ocorrenciaId: string;
  let registroId: string;
  let fornecedorId: string;

  const fotoOcorrencia = 'legado/ocorrencia/foto-1.jpg';
  const fotoManutencao = 'legado/manutencao/foto-1.jpg';
  const omUrl = 'legado/manutencao/om-4321.pdf';

  beforeAll(async () => {
    a = await signUpSindico('b2a');
    b = await signUpSindico('b2b');
    semCondominio = await signUpUser('b2sem');

    const { data: fornecedor, error: fErr } = await a.client
      .from('fornecedores')
      .insert({
        name: 'Geradores Silva',
        service_type: 'Manutenção de gerador',
        created_by: a.userId,
      })
      .select()
      .single();
    if (fErr) throw fErr;
    fornecedorId = fornecedor!.id;

    const { data: item, error: iErr } = await a.client
      .from('maintenance_items')
      .insert({
        name: 'Gerador principal',
        category: 'gerador',
        frequency: 'mensal',
        next_due_date: '2026-09-15',
        location: 'Casa de máquinas',
        brand: 'Stemac',
        model: 'GTX-40',
        serial_number: 'SN-99887',
        notes: 'Trocar filtro junto',
        created_by: a.userId,
      })
      .select()
      .single();
    if (iErr) throw iErr;
    itemId = item!.id;

    const { data: ocorrencia, error: oErr } = await a.client
      .from('occurrences')
      .insert({
        title: 'Infiltração na garagem',
        description: 'Mancha no teto perto da vaga 12',
        severity: 'alta',
        status: 'em_andamento',
        category: 'infiltracao',
        estimated_cost: 1250.5,
        photo_urls: [fotoOcorrencia],
        created_by: a.userId,
      })
      .select()
      .single();
    if (oErr) throw oErr;
    ocorrenciaId = ocorrencia!.id;
    osNumber = ocorrencia!.os_number;

    const { data: registro, error: rErr } = await a.client
      .from('maintenance_records')
      .insert({
        maintenance_item_id: itemId,
        type: 'preventiva',
        status: 'concluida',
        description: 'Troca de filtro e teste de carga',
        photo_urls: [fotoManutencao],
        fornecedor_id: fornecedorId,
        om_file_url: omUrl,
        om_file_name: 'OM-4321.pdf',
        om_mime_type: 'application/pdf',
        performed_by: a.userId,
      })
      .select()
      .single();
    if (rErr) throw rErr;
    registroId = registro!.id;

    // O condomínio B também tem dados legados — e não pode ser tocado
    // pela re-sincronização de A.
    await b.client.from('maintenance_items').insert({
      name: 'Portão do B',
      category: 'portao',
      frequency: 'semestral',
      next_due_date: '2026-12-01',
      created_by: b.userId,
    });
    await b.client.from('occurrences').insert({
      title: 'Ocorrência do B',
      description: 'só do B',
      category: 'outro',
      created_by: b.userId,
    });

    const { error: syncErr } = await a.client.rpc('fase2_resincronizar');
    if (syncErr) throw syncErr;
  }, 120000);

  it('o equipamento vira ativo mantendo o mesmo id e o local em texto livre', async () => {
    const { data: asset, error } = await a.client
      .from('assets')
      .select('*')
      .eq('id', itemId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(asset).not.toBeNull();
    expect(asset!.name).toBe('Gerador principal');
    // O texto livre é preservado literalmente; a hierarquia fica vazia
    // de propósito, para o síndico organizar depois.
    expect(asset!.location_text).toBe('Casa de máquinas');
    expect(asset!.location_id).toBeNull();
    expect(asset!.manufacturer).toBe('Stemac');
    expect(asset!.serial_number).toBe('SN-99887');
    expect(asset!.condominio_id).toBe(a.condominioId);
  }, 30000);

  it('a regra de recorrência sai do equipamento e vira plano próprio', async () => {
    const { data: planos, error } = await a.client
      .from('maintenance_plans')
      .select('*')
      .eq('legacy_maintenance_item_id', itemId);
    expect(error).toBeNull();
    expect(planos ?? []).toHaveLength(1);

    const plano = planos![0];
    expect(plano.asset_id).toBe(itemId);
    expect(plano.frequency_type).toBe('mensal');
    expect(plano.frequency_interval).toBe(1);
    expect(plano.active).toBe(true);

    // O vencimento comparado é o VIGENTE no registro antigo, não o que
    // foi semeado: o trigger de auto-avanço já existente empurra
    // next_due_date quando uma manutenção é registrada. Comparar com o
    // valor semeado testaria a semente; comparar com o vigente testa a
    // cópia — e de quebra confirma que a tabela antiga segue viva e
    // mandando, que é a premissa da fase.
    const { data: item } = await a.client
      .from('maintenance_items')
      .select('next_due_date')
      .eq('id', itemId)
      .single();
    expect(plano.next_due_at).toBe(item!.next_due_date);
    // O plano é entidade nova: id próprio, não o do equipamento.
    expect(plano.id).not.toBe(itemId);
  }, 30000);

  it('a ocorrência vira fato (incident) e trabalho (work_order) separados', async () => {
    const { data: incident } = await a.client
      .from('incidents')
      .select('*')
      .eq('id', ocorrenciaId)
      .maybeSingle();
    expect(incident).not.toBeNull();
    expect(incident!.title).toBe('Infiltração na garagem');
    expect(incident!.severity).toBe('alta');
    // 'em_andamento' no modelo antigo significa que já virou trabalho.
    expect(incident!.status).toBe('convertida_em_os');

    const { data: os } = await a.client
      .from('work_orders')
      .select('*')
      .eq('id', ocorrenciaId)
      .maybeSingle();
    expect(os).not.toBeNull();
    expect(os!.origin_type).toBe('incidente');
    expect(os!.incident_id).toBe(ocorrenciaId);
    expect(os!.status).toBe('em_execucao');
    expect(Number(os!.estimated_cost)).toBe(1250.5);
    expect(os!.legacy_table).toBe('occurrences');
  }, 30000);

  it('o número da OS sobrevive à migração — é como a equipe se refere a ela', async () => {
    const { data: os } = await a.client
      .from('work_orders')
      .select('number')
      .eq('id', ocorrenciaId)
      .maybeSingle();
    expect(os!.number).toBe(osNumber);

    const { data: incident } = await a.client
      .from('incidents')
      .select('number')
      .eq('id', ocorrenciaId)
      .maybeSingle();
    expect(incident!.number).toBe(osNumber);
  }, 30000);

  it('o registro de manutenção vira OS preventiva ligada ao plano e ao fornecedor', async () => {
    const { data: os } = await a.client
      .from('work_orders')
      .select('*')
      .eq('id', registroId)
      .maybeSingle();
    expect(os).not.toBeNull();
    expect(os!.origin_type).toBe('preventiva');
    expect(os!.asset_id).toBe(itemId);
    expect(os!.supplier_id).toBe(fornecedorId);
    expect(os!.status).toBe('encerrada');
    expect(os!.completed_at).not.toBeNull();
    expect(os!.legacy_table).toBe('maintenance_records');

    // Recebe número próprio do contador do condomínio, sem colidir com
    // o número que veio da ocorrência.
    expect(os!.number).toBeGreaterThan(osNumber);

    const { data: plano } = await a.client
      .from('maintenance_plans')
      .select('id')
      .eq('legacy_maintenance_item_id', itemId)
      .single();
    expect(os!.maintenance_plan_id).toBe(plano!.id);
  }, 30000);

  it('fotos e a OM do fornecedor viram evidências tipadas', async () => {
    const { data: daOcorrencia } = await a.client
      .from('work_order_evidence')
      .select('kind, file_url')
      .eq('work_order_id', ocorrenciaId);
    expect(daOcorrencia ?? []).toHaveLength(1);
    expect(daOcorrencia![0].file_url).toBe(fotoOcorrencia);
    expect(daOcorrencia![0].kind).toBe('foto_depois');

    const { data: daManutencao } = await a.client
      .from('work_order_evidence')
      .select('kind, file_url, file_name, mime_type')
      .eq('work_order_id', registroId);
    expect(daManutencao ?? []).toHaveLength(2);

    const om = (daManutencao ?? []).find((e) => e.kind === 'om_fornecedor');
    expect(om).toBeDefined();
    expect(om!.file_url).toBe(omUrl);
    expect(om!.file_name).toBe('OM-4321.pdf');
    expect(om!.mime_type).toBe('application/pdf');

    const foto = (daManutencao ?? []).find((e) => e.kind === 'foto_depois');
    expect(foto!.file_url).toBe(fotoManutencao);
  }, 30000);

  it('a re-sincronização de um condomínio não copia dados de outro', async () => {
    // A rodou o backfill; B ainda não. Nada de B pode ter aparecido.
    const { data: assetsDeB } = await b.client.from('assets').select('id');
    expect(assetsDeB ?? []).toHaveLength(0);

    const { data: incidentsDeB } = await b.client.from('incidents').select('id');
    expect(incidentsDeB ?? []).toHaveLength(0);

    // E A continua sem enxergar nada de B, como sempre.
    const { data: assetsVistosPorA } = await a.client
      .from('assets')
      .select('condominio_id');
    expect((assetsVistosPorA ?? []).every((x) => x.condominio_id === a.condominioId)).toBe(true);
  }, 30000);

  it('reexecutar o backfill não duplica nada', async () => {
    const contar = async () => {
      const [assets, planos, incidents, ordens] = await Promise.all([
        a.client.from('assets').select('id'),
        a.client.from('maintenance_plans').select('id'),
        a.client.from('incidents').select('id'),
        a.client.from('work_orders').select('id'),
      ]);
      const { data: evidencias } = await a.client
        .from('work_order_evidence')
        .select('id')
        .in('work_order_id', [ocorrenciaId, registroId]);
      return {
        assets: (assets.data ?? []).length,
        planos: (planos.data ?? []).length,
        incidents: (incidents.data ?? []).length,
        ordens: (ordens.data ?? []).length,
        evidencias: (evidencias ?? []).length,
      };
    };

    const antes = await contar();
    const { error } = await a.client.rpc('fase2_resincronizar');
    expect(error).toBeNull();
    const depois = await contar();

    expect(depois).toEqual(antes);
  }, 60000);

  it('as tabelas antigas continuam intactas — elas ainda são a fonte da verdade', async () => {
    const { data: item } = await a.client
      .from('maintenance_items')
      .select('*')
      .eq('id', itemId)
      .maybeSingle();
    expect(item).not.toBeNull();
    expect(item!.frequency).toBe('mensal');
    expect(item!.location).toBe('Casa de máquinas');

    const { data: ocorrencia } = await a.client
      .from('occurrences')
      .select('os_number, status, photo_urls')
      .eq('id', ocorrenciaId)
      .maybeSingle();
    expect(ocorrencia!.os_number).toBe(osNumber);
    expect(ocorrencia!.status).toBe('em_andamento');
    expect(ocorrencia!.photo_urls).toEqual([fotoOcorrencia]);

    const { data: registro } = await a.client
      .from('maintenance_records')
      .select('om_file_url')
      .eq('id', registroId)
      .maybeSingle();
    expect(registro!.om_file_url).toBe(omUrl);
  }, 30000);

  it('quem não é síndico de um condomínio não consegue disparar o backfill', async () => {
    const { error } = await semCondominio.client.rpc('fase2_resincronizar');
    expect(error).not.toBeNull();
  }, 30000);
});
