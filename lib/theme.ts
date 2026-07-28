export const colors = {
  primary: '#6C5CE7',
  primaryDark: '#5849C4',
  primaryLight: '#F0EEFE',
  accent: '#FF9F43',
  accentLight: '#FFF3E4',

  textPrimary: '#1F2133',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textOnPrimary: '#FFFFFF',

  border: '#E7E5F0',
  surface: '#FFFFFF',
  surfaceAlt: '#F8F7FC',
  background: '#FBFAFE',

  success: '#22C55E',
  successLight: '#DCFCE7',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
};

export const fontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
};

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
  display: 34,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

/** Sombra suave e consistente para cards elevados (iOS + Android). */
export const cardShadow = {
  shadowColor: '#1F2133',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 2,
};

/** Sombra mais forte, para elementos flutuantes (FAB, botão de exportar). */
export const floatingShadow = {
  shadowColor: '#1F2133',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.18,
  shadowRadius: 16,
  elevation: 6,
};
