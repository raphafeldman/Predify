import { readFileSync } from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

// Carrega .env.test manualmente (sem depender de pacote novo nem de uma
// versão específica do Node) — só preenche variáveis que ainda não
// existem no processo, pra não pisar em algo já exportado no shell.
function loadDotEnvTest() {
  let content: string;
  try {
    content = readFileSync('.env.test', 'utf8');
  } catch {
    return;
  }
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].trim();
    }
  }
}
loadDotEnvTest();

const TEST_URL = process.env.TEST_SUPABASE_URL;
const TEST_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY;
const hasTestEnv = Boolean(TEST_URL && TEST_ANON_KEY);

// Testes de isolamento entre condomínios (RLS) — rodam contra um projeto
// Supabase de TESTE separado (nunca produção), com "Confirm email" e
// "Enable email provider"/"Allow new users to sign up" ligados do jeito
// certo (signup permitido, sem exigir clique em link de confirmação).
// Sem .env.test configurado, este arquivo inteiro é pulado — não falha o
// `npm test` em máquinas sem o projeto de teste.
//
// Cria só DUAS contas (uma por condomínio) uma vez, em beforeAll, e
// reaproveita nos três testes — o rate limit de e-mail do plano
// gratuito do Supabase é baixo, então minimizar o número de signups
// evita estourar o limite numa mesma rodada. auth.signUp rejeita
// endereços @example.com/@example.org/@example.net (domínios
// reservados pelo RFC 2606) como inválidos, por isso o domínio de
// teste abaixo é outro. Dados de teste se acumulam no projeto — é
// descartável por natureza, sem limpeza automática aqui.
function freshClient(): SupabaseClient {
  return createClient(TEST_URL as string, TEST_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function signUpSindico(label: string) {
  const client = freshClient();
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // mailinator.com é um serviço real de caixa de entrada descartável (tem
  // registro MX de verdade) — Supabase rejeita domínios sem MX como
  // "inválido", mesmo com "Confirm email" desativado (já testamos
  // example.com e um domínio inexistente, os dois foram recusados).
  const email = `rls-test-${label}-${unique}@mailinator.com`;
  const password = 'SenhaTeste123!';

  const { data: signUpData, error: signUpError } = await client.auth.signUp({ email, password });
  if (signUpError) throw signUpError;
  if (!signUpData.session) {
    throw new Error(
      'signUp não retornou sessão — confirme "Confirm email" desativado e "Enable email ' +
        'provider"/"Allow new users to sign up" ativado em Authentication > Providers > Email ' +
        'no projeto de teste.'
    );
  }

  const { data: condominioId, error: rpcError } = await client.rpc('create_own_condominio', {
    p_name: `Condomínio Teste ${label} ${unique}`,
  });
  if (rpcError) throw rpcError;

  return { client, userId: signUpData.session.user.id, condominioId: condominioId as string };
}

describe.skipIf(!hasTestEnv)('isolamento entre condomínios (RLS)', () => {
  let a: Awaited<ReturnType<typeof signUpSindico>>;
  let b: Awaited<ReturnType<typeof signUpSindico>>;

  beforeAll(async () => {
    a = await signUpSindico('a');
    b = await signUpSindico('b');
  }, 30000);

  it(
    'um síndico não lê, não atualiza e não apaga ocorrências de outro condomínio',
    async () => {
      const { data: created, error: insertError } = await a.client
        .from('occurrences')
        .insert({
          title: 'Vazamento — visível só pro condomínio A',
          description: 'registro de teste de isolamento',
          category: 'hidraulica',
          created_by: a.userId,
        })
        .select()
        .single();
      expect(insertError).toBeNull();
      expect(created?.condominio_id).toBe(a.condominioId);

      const { data: seenByB } = await b.client.from('occurrences').select('*').eq('id', created!.id);
      expect(seenByB ?? []).toHaveLength(0);

      const { data: updatedByB } = await b.client
        .from('occurrences')
        .update({ title: 'Sequestrado pelo condomínio B' })
        .eq('id', created!.id)
        .select();
      expect(updatedByB ?? []).toHaveLength(0);

      const { data: stillA } = await a.client
        .from('occurrences')
        .select('title')
        .eq('id', created!.id)
        .single();
      expect(stillA?.title).toBe('Vazamento — visível só pro condomínio A');

      const { data: softDeletedByB } = await b.client
        .from('occurrences')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', created!.id)
        .select();
      expect(softDeletedByB ?? []).toHaveLength(0);
    },
    30000
  );

  it(
    'um síndico não lê documentos, tarefas nem fornecedores de outro condomínio',
    async () => {
      const { data: doc, error: docError } = await a.client
        .from('documents')
        .insert({
          title: 'Contrato do condomínio A',
          category: 'contrato',
          file_url: `${a.condominioId}/documents/${a.userId}/teste.pdf`,
          mime_type: 'application/pdf',
          created_by: a.userId,
        })
        .select()
        .single();
      expect(docError).toBeNull();

      const { data: task, error: taskError } = await a.client
        .from('tasks')
        .insert({ title: 'Tarefa do condomínio A', created_by: a.userId })
        .select()
        .single();
      expect(taskError).toBeNull();

      const { data: fornecedor, error: fornecedorError } = await a.client
        .from('fornecedores')
        .insert({ name: 'Fornecedor do condomínio A', service_type: 'Jardinagem', created_by: a.userId })
        .select()
        .single();
      expect(fornecedorError).toBeNull();

      const [{ data: docsSeenByB }, { data: tasksSeenByB }, { data: fornecedoresSeenByB }] = await Promise.all([
        b.client.from('documents').select('*').eq('id', doc!.id),
        b.client.from('tasks').select('*').eq('id', task!.id),
        b.client.from('fornecedores').select('*').eq('id', fornecedor!.id),
      ]);

      expect(docsSeenByB ?? []).toHaveLength(0);
      expect(tasksSeenByB ?? []).toHaveLength(0);
      expect(fornecedoresSeenByB ?? []).toHaveLength(0);
    },
    30000
  );

  it(
    'um síndico não lê audit_events de outro condomínio',
    async () => {
      const { error: insertError } = await a.client.from('occurrences').insert({
        title: 'Gera evento de auditoria',
        description: 'criação deve disparar o trigger log_audit_event',
        category: 'outro',
        created_by: a.userId,
      });
      expect(insertError).toBeNull();

      const { data: eventsSeenByB } = await b.client
        .from('audit_events')
        .select('*')
        .eq('condominio_id', a.condominioId);
      expect(eventsSeenByB ?? []).toHaveLength(0);

      // O próprio síndico A precisa continuar vendo o evento gerado —
      // confirma que a policy não é restritiva demais a ponto de esconder
      // o evento de quem tem o direito de vê-lo.
      const { data: eventsSeenByA } = await a.client
        .from('audit_events')
        .select('*')
        .eq('condominio_id', a.condominioId)
        .eq('action', 'created');
      expect((eventsSeenByA ?? []).length).toBeGreaterThan(0);
    },
    30000
  );
});
