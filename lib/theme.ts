// Paleta oficial da marca Predify (manual da marca): navy, teal/emerald,
// cinza claro e branco. As demais variações (dark/light de cada uma,
// cinzas de texto) são derivadas dessas quatro pra manter consistência.
export const colors = {
  primary: '#0A1A3A',
  primaryDark: '#071226',
  primaryLight: '#E4E8F0',
  accent: '#00B388',
  accentLight: '#E0F6EF',

  textPrimary: '#0A1A3A',
  textSecondary: '#5B6472',
  textMuted: '#9AA3AF',
  textOnPrimary: '#FFFFFF',

  border: '#E6E8EC',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F6F9',
  background: '#F8F9FB',

  success: '#00B388',
  successLight: '#E0F6EF',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
};

export const fontFamily = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  extrabold: 'Poppins_800ExtraBold',
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

/** Larguras máximas de conteúdo na versão web — sem isso, tudo estica até
 * a borda da janela em monitores largos (bom no celular, ruim no desktop). */
export const layout = {
  maxContentWidth: 1100,
  maxFormWidth: 440,
};

/** Sombra suave e consistente para cards elevados (iOS + Android). */
export const cardShadow = {
  shadowColor: '#0A1A3A',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 2,
};

/** Sombra mais forte, para elementos flutuantes (FAB, botão de exportar). */
export const floatingShadow = {
  shadowColor: '#0A1A3A',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.18,
  shadowRadius: 16,
  elevation: 6,
};
