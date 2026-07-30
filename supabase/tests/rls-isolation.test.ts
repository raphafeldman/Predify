import { beforeAll, describe, expect, it } from 'vitest';
import { hasTestEnv, signUpSindico } from './helpers';

// Testes de isolamento entre condomínios (RLS) — rodam contra um projeto
// Supabase de TESTE separado (nunca produção), com o provider de e-mail
// habilitado e "Confirm email" DESLIGADO (senão o signup tenta enviar
// e-mail e falha). Sem .env.test configurado, este arquivo inteiro é
// pulado — não falha o `npm test` em máquinas sem o projeto de teste.
//
// Cria só DUAS contas (uma por condomínio) uma vez, em beforeAll, e
// reaproveita nos três testes. Dados de teste se acumulam no projeto —
// é descartável por natureza, sem limpeza automática aqui.

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
