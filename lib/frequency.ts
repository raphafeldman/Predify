import type { MaintenanceFrequency } from './types';

export const FREQUENCY_LABEL: Record<MaintenanceFrequency, string> = {
  diaria: 'Diária',
  semanal: 'Semanal',
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

function toDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Retorna a "chave do período" (uma data) para uma frequência, usada como
 * entry_date de checklist_entries — diária = hoje, semanal = segunda-feira
 * desta semana, mensal = dia 1 deste mês, anual = 1º de janeiro deste ano.
 * trimestral/semestral usam o mesmo princípio a partir do mês.
 */
export function getPeriodKey(frequency: MaintenanceFrequency, reference = new Date()): string {
  const date = new Date(reference);

  switch (frequency) {
    case 'diaria':
      return toDateOnly(date);
    case 'semanal': {
      const day = date.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      date.setDate(date.getDate() + diffToMonday);
      return toDateOnly(date);
    }
    case 'mensal':
      date.setDate(1);
      return toDateOnly(date);
    case 'trimestral': {
      const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
      date.setMonth(quarterStartMonth, 1);
      return toDateOnly(date);
    }
    case 'semestral': {
      const semesterStartMonth = date.getMonth() < 6 ? 0 : 6;
      date.setMonth(semesterStartMonth, 1);
      return toDateOnly(date);
    }
    case 'anual':
      date.setMonth(0, 1);
      return toDateOnly(date);
    default:
      return toDateOnly(date);
  }
}

export type MaintenanceUrgency = 'em_dia' | 'vence_em_breve' | 'vencido';

export function getMaintenanceUrgency(nextDueDate: string): MaintenanceUrgency {
  const today = toDateOnly(new Date());
  const diffDays = Math.floor(
    (new Date(nextDueDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) /
      (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) return 'vencido';
  if (diffDays <= 7) return 'vence_em_breve';
  return 'em_dia';
}

export const URGENCY_LABEL: Record<MaintenanceUrgency, string> = {
  em_dia: 'Em dia',
  vence_em_breve: 'Vence em breve',
  vencido: 'Vencido',
};

export const URGENCY_COLOR: Record<MaintenanceUrgency, string> = {
  em_dia: '#10B981',
  vence_em_breve: '#F59E0B',
  vencido: '#DC2626',
};
