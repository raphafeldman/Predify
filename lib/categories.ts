import type { Ionicons } from '@expo/vector-icons';
import { colors } from './theme';

// Categorias usadas tanto em Ordens de Serviço (occurrences) quanto em
// Prestadores (service_requests) — um lugar só pra não duplicar o
// dicionário de rótulos/ícones/cores nas duas telas.
export const CATEGORY_LABEL: Record<string, string> = {
  infiltracao: 'Infiltração',
  eletrica: 'Elétrica',
  hidraulica: 'Hidráulica',
  estrutural: 'Estrutural',
  pintura: 'Pintura',
  portas_janelas: 'Portas e janelas',
  elevador: 'Elevador',
  outro: 'Outro',
};

export const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  infiltracao: 'water-outline',
  eletrica: 'flash-outline',
  hidraulica: 'water-outline',
  estrutural: 'construct-outline',
  pintura: 'color-palette-outline',
  portas_janelas: 'log-out-outline',
  elevador: 'swap-vertical-outline',
  outro: 'ellipsis-horizontal-circle-outline',
};

export const CATEGORY_COLOR: Record<string, string> = {
  infiltracao: colors.primary,
  eletrica: colors.warning,
  hidraulica: colors.primary,
  estrutural: colors.danger,
  pintura: colors.accent,
  portas_janelas: colors.textSecondary,
  elevador: colors.textSecondary,
  outro: colors.textMuted,
};
