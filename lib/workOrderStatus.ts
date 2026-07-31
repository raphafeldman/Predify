import { colors } from './theme';
import type { IncidentStatus, WorkOrderPriority, WorkOrderStatus } from './types';

// O banco aceita 16 estados de ordem e 9 de ocorrência (a especificação
// inteira). A interface expõe menos: dezesseis estados numa tela de
// celular tornam o app inutilizável para quem está em campo. Os demais
// continuam disponíveis no banco e ganham tela quando fizerem falta —
// por isso os rótulos abaixo cobrem TODOS os valores, mesmo os que
// nenhum botão produz hoje: se um chegar por outro caminho, a tela
// mostra um nome legível em vez do valor cru.

export const WO_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  rascunho: 'Rascunho',
  aberta: 'Aberta',
  em_triagem: 'Em triagem',
  aguardando_aprovacao: 'Aguardando aprovação',
  aguardando_orcamento: 'Aguardando orçamento',
  aprovada: 'Aprovada',
  programada: 'Programada',
  em_execucao: 'Em execução',
  pausada: 'Pausada',
  aguardando_material: 'Aguardando material',
  aguardando_fornecedor: 'Aguardando fornecedor',
  concluida: 'Concluída',
  aguardando_validacao: 'Aguardando validação',
  encerrada: 'Encerrada',
  cancelada: 'Cancelada',
  reaberta: 'Reaberta',
};

export const WO_STATUS_COLOR: Record<WorkOrderStatus, string> = {
  rascunho: colors.textMuted,
  aberta: colors.warning,
  em_triagem: colors.warning,
  aguardando_aprovacao: colors.warning,
  aguardando_orcamento: colors.warning,
  aprovada: colors.primary,
  programada: colors.primary,
  em_execucao: colors.primary,
  pausada: colors.textMuted,
  aguardando_material: colors.textMuted,
  aguardando_fornecedor: colors.textMuted,
  concluida: colors.success,
  aguardando_validacao: colors.success,
  encerrada: colors.success,
  cancelada: colors.textMuted,
  reaberta: colors.warning,
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  nova: 'Nova',
  em_triagem: 'Em triagem',
  aguardando_info: 'Aguardando informação',
  encaminhada: 'Encaminhada',
  resolvida_sem_os: 'Resolvida sem OS',
  convertida_em_os: 'Virou ordem de serviço',
  encerrada: 'Encerrada',
  cancelada: 'Cancelada',
  reaberta: 'Reaberta',
};

export const INCIDENT_STATUS_COLOR: Record<IncidentStatus, string> = {
  nova: colors.warning,
  em_triagem: colors.warning,
  aguardando_info: colors.warning,
  encaminhada: colors.primary,
  resolvida_sem_os: colors.success,
  convertida_em_os: colors.primary,
  encerrada: colors.success,
  cancelada: colors.textMuted,
  reaberta: colors.warning,
};

export const PRIORITY_LABEL: Record<WorkOrderPriority, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
};

export const PRIORITY_COLOR: Record<WorkOrderPriority, string> = {
  baixa: colors.success,
  media: colors.warning,
  alta: colors.danger,
  urgente: colors.danger,
};

// Espelha public.transicoes_work_order() no banco. O banco é quem manda
// — esta cópia existe só para não oferecer ao usuário um botão que vai
// ser recusado. Se as duas divergirem, quem perde é o botão, não o dado.
const TRANSICOES: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  rascunho: ['aberta', 'cancelada'],
  aberta: ['em_triagem', 'aguardando_aprovacao', 'aguardando_orcamento', 'aprovada', 'programada', 'em_execucao', 'cancelada'],
  em_triagem: ['aberta', 'aguardando_aprovacao', 'aguardando_orcamento', 'aprovada', 'programada', 'cancelada'],
  aguardando_aprovacao: ['em_triagem', 'aguardando_orcamento', 'aprovada', 'cancelada'],
  aguardando_orcamento: ['em_triagem', 'aguardando_aprovacao', 'aprovada', 'cancelada'],
  aprovada: ['programada', 'em_execucao', 'cancelada'],
  programada: ['em_execucao', 'pausada', 'cancelada'],
  em_execucao: ['pausada', 'aguardando_material', 'aguardando_fornecedor', 'concluida', 'cancelada'],
  pausada: ['em_execucao', 'cancelada'],
  aguardando_material: ['em_execucao', 'cancelada'],
  aguardando_fornecedor: ['em_execucao', 'cancelada'],
  concluida: ['aguardando_validacao', 'encerrada', 'reaberta'],
  aguardando_validacao: ['encerrada', 'reaberta'],
  encerrada: ['reaberta'],
  cancelada: ['reaberta'],
  reaberta: ['aberta', 'programada', 'em_execucao', 'cancelada'],
};

export function podeIrPara(de: WorkOrderStatus, para: WorkOrderStatus): boolean {
  return (TRANSICOES[de] ?? []).includes(para);
}
