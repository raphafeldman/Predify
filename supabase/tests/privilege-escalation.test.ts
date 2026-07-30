import { beforeAll, describe, expect, it } from 'vitest';
import { hasTestEnv, signUpUser } from './helpers';

// Verificações de encerramento da Fase 1: um usuário comum não consegue
// escalar o próprio privilégio pelo cliente. As regras vivem no trigger
// protect_profile_privileged_fields (security definer), não na UI —
// então o teste bate direto na API, ignorando qualquer proteção de tela.
//
// Uma conta recém-criada pelo signup self-service nasce com
// role='funcionario' e condominio_id=null (só vira síndico depois de
// chamar create_own_condominio), que é exatamente o estado que
// interessa testar aqui.
describe.skipIf(!hasTestEnv)('escalonamento de privilégio', () => {
  let user: Awaited<ReturnType<typeof signUpUser>>;

  beforeAll(async () => {
    user = await signUpUser('esc');
  }, 30000);

  it('a conta nasce como funcionário sem condomínio', async () => {
    const { data: profile } = await user.client
      .from('profiles')
      .select('role, condominio_id')
      .eq('id', user.userId)
      .single();

    expect(profile!.role).toBe('funcionario');
    expect(profile!.condominio_id).toBeNull();
  }, 30000);

  it('funcionário não consegue promover o próprio papel para síndico', async () => {
    const { error } = await user.client
      .from('profiles')
      .update({ role: 'sindico' })
      .eq('id', user.userId);

    expect(error).not.toBeNull();
    expect(error!.message).toContain('Apenas o síndico pode alterar papel');

    const { data: profile } = await user.client
      .from('profiles')
      .select('role')
      .eq('id', user.userId)
      .single();
    expect(profile!.role).toBe('funcionario');
  }, 30000);

  it('funcionário não consegue se associar a um condomínio por update direto', async () => {
    const alvo = '00000000-0000-4000-8000-000000000001';
    const { error } = await user.client
      .from('profiles')
      .update({ condominio_id: alvo })
      .eq('id', user.userId);

    // O trigger (BEFORE UPDATE) dispara antes da checagem de chave
    // estrangeira, então a mensagem prova que foi a regra de negócio que
    // barrou — não um acidente de FK inválida.
    expect(error).not.toBeNull();
    expect(error!.message).toContain('Use a função de criar condomínio');

    const { data: profile } = await user.client
      .from('profiles')
      .select('condominio_id')
      .eq('id', user.userId)
      .single();
    expect(profile!.condominio_id).toBeNull();
  }, 30000);

  it('funcionário não consegue reativar/desativar a própria conta', async () => {
    const { error } = await user.client
      .from('profiles')
      .update({ active: false })
      .eq('id', user.userId);

    expect(error).not.toBeNull();
    expect(error!.message).toContain('Apenas o síndico pode alterar papel ou status');
  }, 30000);

  it('usuário sem condomínio não enxerga dados de condomínio nenhum', async () => {
    const [{ data: ocorrencias }, { data: documentos }, { data: eventos }] = await Promise.all([
      user.client.from('occurrences').select('id'),
      user.client.from('documents').select('id'),
      user.client.from('audit_events').select('id'),
    ]);

    expect(ocorrencias ?? []).toHaveLength(0);
    expect(documentos ?? []).toHaveLength(0);
    expect(eventos ?? []).toHaveLength(0);
  }, 30000);
});
