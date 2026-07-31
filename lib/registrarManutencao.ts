import { supabase } from './supabase';

export interface AnexoOM {
  path: string;
  name: string | null;
  mimeType: string | null;
}

export interface RegistroDeManutencao {
  assetId: string | null;
  /** Quando informado, a ordem nasce preventiva e ligada ao plano. */
  planId: string | null;
  title: string;
  description: string;
  category: string;
  userId: string;
  fornecedorId?: string | null;
  photoPaths?: string[];
  om?: AnexoOM | null;
}

/**
 * Registra uma manutenção já executada como ordem de serviço concluída.
 *
 * A sequência importa e é o motivo de esta função existir em vez de o
 * código estar solto em cada tela:
 *
 * 1. A ordem entra como `em_execucao`, não já concluída. A máquina de
 *    estados e o avanço do vencimento do plano vivem em gatilhos
 *    AFTER UPDATE — uma ordem que nascesse concluída passaria por fora
 *    dos dois em silêncio, e o plano nunca andaria.
 * 2. As evidências entram antes da conclusão, para que o registro esteja
 *    completo no instante em que o plano avança.
 * 3. Só então a ordem é concluída, disparando o avanço.
 *
 * Duas telas registram manutenção (Equipamentos e Manutenção). Com a
 * lógica aqui, elas não têm como divergir nessa ordem.
 */
export async function registrarManutencao(dados: RegistroDeManutencao): Promise<string> {
  const { data: os, error: insertError } = await supabase
    .from('work_orders')
    .insert({
      origin_type: dados.planId ? 'preventiva' : 'solicitacao_direta',
      maintenance_plan_id: dados.planId,
      asset_id: dados.assetId,
      title: dados.title,
      description: dados.description,
      category: dados.category,
      status: 'em_execucao',
      started_at: new Date().toISOString(),
      requested_by: dados.userId,
      assigned_user_id: dados.userId,
      supplier_id: dados.fornecedorId ?? null,
    })
    .select('id')
    .single();
  if (insertError) throw insertError;

  const evidencias = [
    ...(dados.photoPaths ?? []).map((url) => ({
      work_order_id: os!.id,
      kind: 'foto_depois',
      file_url: url,
      uploaded_by: dados.userId,
    })),
    ...(dados.om
      ? [
          {
            work_order_id: os!.id,
            kind: 'om_fornecedor',
            file_url: dados.om.path,
            file_name: dados.om.name,
            mime_type: dados.om.mimeType,
            uploaded_by: dados.userId,
          },
        ]
      : []),
  ];

  if (evidencias.length) {
    const { error: evError } = await supabase.from('work_order_evidence').insert(evidencias);
    if (evError) throw evError;
  }

  const { error: concluirError } = await supabase
    .from('work_orders')
    .update({ status: 'concluida' })
    .eq('id', os!.id);
  if (concluirError) throw concluirError;

  return os!.id;
}
