import { beforeAll, describe, expect, it } from 'vitest';
import { hasTestEnv, signUpSindico } from './helpers';

// Verificações de encerramento da Fase 1: soft delete preserva o dado,
// restauração funciona, e as duas ações geram evento de auditoria
// imutável. Rodam contra o projeto Supabase de homologação (.env.test);
// sem ele, são puladas automaticamente.
describe.skipIf(!hasTestEnv)('soft delete e auditoria', () => {
  let a: Awaited<ReturnType<typeof signUpSindico>>;

  beforeAll(async () => {
    a = await signUpSindico('sd');
  }, 30000);

  it(
    'soft delete preserva a linha e todos os campos originais',
    async () => {
      const { data: created, error: insertError } = await a.client
        .from('occurrences')
        .insert({
          title: 'Ordem que será excluída logicamente',
          description: 'conteúdo original que precisa sobreviver ao soft delete',
          category: 'eletrica',
          estimated_cost: 1234.56,
          created_by: a.userId,
        })
        .select()
        .single();
      expect(insertError).toBeNull();

      const { error: deleteError } = await a.client
        .from('occurrences')
        .update({ deleted_at: new Date().toISOString(), deleted_by: a.userId, deletion_reason: 'teste de auditoria' })
        .eq('id', created!.id);
      expect(deleteError).toBeNull();

      // A linha continua existindo, com o conteúdo intacto — soft delete
      // não é DELETE. O síndico enxerga registros excluídos (é quem pode
      // restaurar); a policy só esconde de quem não é síndico.
      const { data: afterDelete } = await a.client
        .from('occurrences')
        .select('*')
        .eq('id', created!.id)
        .maybeSingle();

      expect(afterDelete).not.toBeNull();
      expect(afterDelete!.title).toBe('Ordem que será excluída logicamente');
      expect(afterDelete!.description).toBe('conteúdo original que precisa sobreviver ao soft delete');
      expect(Number(afterDelete!.estimated_cost)).toBe(1234.56);
      expect(afterDelete!.deleted_at).not.toBeNull();
      expect(afterDelete!.deletion_reason).toBe('teste de auditoria');
    },
    30000
  );

  it(
    'restauração devolve o registro ao estado normal',
    async () => {
      const { data: created } = await a.client
        .from('occurrences')
        .insert({
          title: 'Ordem para restaurar',
          description: 'será excluída e depois restaurada',
          category: 'outro',
          created_by: a.userId,
        })
        .select()
        .single();

      await a.client
        .from('occurrences')
        .update({ deleted_at: new Date().toISOString(), deleted_by: a.userId })
        .eq('id', created!.id);

      const { error: restoreError } = await a.client
        .from('occurrences')
        .update({ deleted_at: null, deleted_by: null, deletion_reason: null })
        .eq('id', created!.id);
      expect(restoreError).toBeNull();

      const { data: restored } = await a.client
        .from('occurrences')
        .select('*')
        .eq('id', created!.id)
        .single();
      expect(restored!.deleted_at).toBeNull();
      expect(restored!.title).toBe('Ordem para restaurar');

      // E volta a aparecer numa listagem que filtra só os não-excluídos
      // (o mesmo filtro que a UI usará).
      const { data: activeList } = await a.client
        .from('occurrences')
        .select('id')
        .is('deleted_at', null)
        .eq('id', created!.id);
      expect(activeList ?? []).toHaveLength(1);
    },
    30000
  );

  it(
    'exclusão e restauração geram eventos de auditoria',
    async () => {
      const { data: created } = await a.client
        .from('occurrences')
        .insert({
          title: 'Ordem auditada',
          description: 'ciclo completo criar -> excluir -> restaurar',
          category: 'outro',
          created_by: a.userId,
        })
        .select()
        .single();

      await a.client
        .from('occurrences')
        .update({ deleted_at: new Date().toISOString(), deleted_by: a.userId })
        .eq('id', created!.id);
      await a.client.from('occurrences').update({ deleted_at: null, deleted_by: null }).eq('id', created!.id);

      const { data: events } = await a.client
        .from('audit_events')
        .select('action, record_type, actor_id')
        .eq('record_id', created!.id)
        .order('created_at');

      const actions = (events ?? []).map((e) => e.action);
      expect(actions).toContain('created');
      expect(actions).toContain('deleted');
      expect(actions).toContain('restored');

      // O evento registra QUEM fez a ação e sobre qual tipo de registro.
      expect((events ?? [])[0].record_type).toBe('occurrence');
      expect((events ?? [])[0].actor_id).toBe(a.userId);
    },
    30000
  );

  it(
    'mudança de status gera evento de auditoria com valor antigo e novo',
    async () => {
      const { data: created } = await a.client
        .from('occurrences')
        .insert({
          title: 'Ordem com mudança de status',
          description: 'aberta -> em_andamento',
          category: 'outro',
          created_by: a.userId,
        })
        .select()
        .single();

      await a.client.from('occurrences').update({ status: 'em_andamento' }).eq('id', created!.id);

      const { data: events } = await a.client
        .from('audit_events')
        .select('action, field_name, old_value, new_value')
        .eq('record_id', created!.id)
        .eq('action', 'status_changed');

      expect((events ?? []).length).toBeGreaterThan(0);
      expect(events![0].field_name).toBe('status');
      expect(events![0].old_value).toBe('aberta');
      expect(events![0].new_value).toBe('em_andamento');
    },
    30000
  );

  it(
    'usuário comum não altera, não apaga e não insere eventos de auditoria',
    async () => {
      const { data: created } = await a.client
        .from('occurrences')
        .insert({
          title: 'Ordem para testar imutabilidade da auditoria',
          description: 'teste',
          category: 'outro',
          created_by: a.userId,
        })
        .select()
        .single();

      const { data: events } = await a.client
        .from('audit_events')
        .select('id')
        .eq('record_id', created!.id)
        .limit(1);
      expect((events ?? []).length).toBeGreaterThan(0);
      const eventId = events![0].id;

      // UPDATE: sem policy de update, nenhuma linha é afetada.
      const { data: updated } = await a.client
        .from('audit_events')
        .update({ action: 'status_changed' })
        .eq('id', eventId)
        .select();
      expect(updated ?? []).toHaveLength(0);

      // DELETE: sem policy de delete, nenhuma linha é afetada.
      const { data: deleted } = await a.client
        .from('audit_events')
        .delete()
        .eq('id', eventId)
        .select();
      expect(deleted ?? []).toHaveLength(0);

      // INSERT: sem policy de insert, o Postgres recusa explicitamente.
      const { error: insertError } = await a.client.from('audit_events').insert({
        condominio_id: a.condominioId,
        record_type: 'occurrence',
        record_id: created!.id,
        action: 'deleted',
      });
      expect(insertError).not.toBeNull();

      // O evento original continua intacto.
      const { data: stillThere } = await a.client
        .from('audit_events')
        .select('action')
        .eq('id', eventId)
        .single();
      expect(stillThere!.action).toBe('created');
    },
    30000
  );
});
