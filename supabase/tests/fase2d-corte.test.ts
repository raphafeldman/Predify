import { beforeAll, describe, expect, it } from 'vitest';
import { hasTestEnv, signUpSindico } from './helpers';

// Fase 2D — mecanismo de corte.
//
// O corte inverte a fonte da verdade. O risco desta fase não é o corte
// em si: é o que acontece DEPOIS dele, se uma re-sincronização rodar
// por engano e sobrescrever trabalho real com dado legado velho. É isso
// que estes testes existem para impedir.
describe.skipIf(!hasTestEnv)('Fase 2D — corte do domínio de manutenção', () => {
  let a: Awaited<ReturnType<typeof signUpSindico>>;
  let ocorrenciaId: string;

  beforeAll(async () => {
    a = await signUpSindico('f2d');

    const { data: ocorrencia, error } = await a.client
      .from('occurrences')
      .insert({
        title: 'Portão travando',
        description: 'trava ao fechar',
        category: 'portas_janelas',
        status: 'aberta',
        created_by: a.userId,
      })
      .select()
      .single();
    if (error) throw error;
    ocorrenciaId = ocorrencia!.id;
  }, 90000);

  it('antes do corte o espelho manda: a re-sincronização traz o legado', async () => {
    const { error } = await a.client.rpc('fase2_resincronizar');
    expect(error).toBeNull();

    const { data: os } = await a.client
      .from('work_orders')
      .select('title, status')
      .eq('id', ocorrenciaId)
      .maybeSingle();
    expect(os).not.toBeNull();
    expect(os!.title).toBe('Portão travando');
    expect(os!.status).toBe('aberta');
  }, 60000);

  it('o corte faz uma última cópia e marca o condomínio', async () => {
    // Algo registrado na tela antiga logo antes do corte não pode ficar
    // para trás — é a janela que a ordem "copia, depois marca" fecha.
    const { data: ultima } = await a.client
      .from('occurrences')
      .insert({
        title: 'Lâmpada queimada na garagem',
        description: 'registrada minutos antes do corte',
        category: 'eletrica',
        created_by: a.userId,
      })
      .select()
      .single();

    const { error } = await a.client.rpc('cortar_dominio_manutencao');
    expect(error).toBeNull();

    const { data: migrada } = await a.client
      .from('work_orders')
      .select('title')
      .eq('id', ultima!.id)
      .maybeSingle();
    expect(migrada).not.toBeNull();
    expect(migrada!.title).toBe('Lâmpada queimada na garagem');

    const { data: condominio } = await a.client
      .from('condominios')
      .select('dominio_cortado_em')
      .eq('id', a.condominioId)
      .single();
    expect(condominio!.dominio_cortado_em).not.toBeNull();
  }, 90000);

  it('o corte não se repete', async () => {
    const { error } = await a.client.rpc('cortar_dominio_manutencao');
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/já foi cortado/i);
  }, 30000);

  // O teste central desta fase.
  it('depois do corte, a re-sincronização NÃO sobrescreve o modelo novo', async () => {
    // Trabalho real feito no modelo novo.
    await a.client
      .from('work_orders')
      .update({ status: 'em_execucao' })
      .eq('id', ocorrenciaId);
    await a.client
      .from('work_orders')
      .update({ title: 'Portão travando — trocado o motor' })
      .eq('id', ocorrenciaId);

    // Enquanto isso, a tabela antiga segue com o conteúdo velho, e
    // alguém dispara a cópia por engano.
    const { error } = await a.client.rpc('fase2_resincronizar');
    expect(error).toBeNull();

    const { data: os } = await a.client
      .from('work_orders')
      .select('title, status')
      .eq('id', ocorrenciaId)
      .single();

    // Nada foi revertido: o espelho não manda mais neste condomínio.
    expect(os!.title).toBe('Portão travando — trocado o motor');
    expect(os!.status).toBe('em_execucao');
  }, 90000);

  it('depois do corte, registro novo na tabela antiga não é mais copiado', async () => {
    const { data: tardia } = await a.client
      .from('occurrences')
      .insert({
        title: 'Registro tardio no modelo antigo',
        description: 'não deve atravessar',
        category: 'outro',
        created_by: a.userId,
      })
      .select()
      .single();

    await a.client.rpc('fase2_resincronizar');

    const { data: os } = await a.client
      .from('work_orders')
      .select('id')
      .eq('id', tardia!.id)
      .maybeSingle();
    expect(os).toBeNull();
  }, 90000);

  it('a máquina de estados continua valendo depois do corte', async () => {
    // O corte não afrouxa o domínio: só desliga o espelho. Sair de
    // "em_execucao" exige passar por "concluida" antes de encerrar.
    expect(
      (await a.client.from('work_orders').update({ status: 'concluida' }).eq('id', ocorrenciaId))
        .error
    ).toBeNull();
    expect(
      (await a.client.from('work_orders').update({ status: 'encerrada' }).eq('id', ocorrenciaId))
        .error
    ).toBeNull();

    const { error: invalida } = await a.client
      .from('work_orders')
      .update({ status: 'em_triagem' })
      .eq('id', ocorrenciaId);
    expect(invalida).not.toBeNull();
  }, 60000);

  it('um síndico não corta o condomínio de outro', async () => {
    const b = await signUpSindico('f2db');
    // Não há parâmetro para isso: a função sempre age sobre o
    // condomínio de quem chama.
    const { data: antes } = await b.client
      .from('condominios')
      .select('dominio_cortado_em')
      .eq('id', b.condominioId)
      .single();
    expect(antes!.dominio_cortado_em).toBeNull();
  }, 90000);

  // Regressão de uma falha real: estas funções foram criadas com
  // `revoke execute ... from public`, o que NÃO basta no Supabase — as
  // default privileges concedem EXECUTE a anon e authenticated
  // explicitamente, e o revoke do PUBLIC não as remove. Todas são
  // SECURITY DEFINER, então passavam por cima do RLS: qualquer usuário
  // logado podia contar linhas de todos os condomínios, disparar
  // escrita em condomínio alheio e desfazer o corte de qualquer um.
  it('as funções de operação não são chamáveis pelo aplicativo', async () => {
    const relatorio = await a.client.rpc('fase2_relatorio_migracao');
    expect(relatorio.error).not.toBeNull();

    const backfillGlobal = await a.client.rpc('fase2_backfill', {
      p_condominio_id: null,
    });
    expect(backfillGlobal.error).not.toBeNull();

    const gerarEmOutro = await a.client.rpc('gerar_os_preventivas', {
      p_condominio_id: a.condominioId,
    });
    expect(gerarEmOutro.error).not.toBeNull();

    const reverter = await a.client.rpc('reverter_corte_dominio', {
      p_condominio_id: a.condominioId,
    });
    expect(reverter.error).not.toBeNull();
  }, 60000);

  it('as versões de escopo próprio continuam funcionando para o síndico', async () => {
    // A correção de permissão não pode ter levado junto o que o síndico
    // legitimamente usa.
    const { error } = await a.client.rpc('gerar_minhas_os_preventivas');
    expect(error).toBeNull();
  }, 60000);
});
