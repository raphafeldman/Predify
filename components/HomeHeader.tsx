import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, fontSize, radius, spacing } from '../lib/theme';
import { Logo } from './ui/Logo';

interface Props {
  name: string;
  condominioName?: string | null;
  hasAlerts?: boolean;
  onPressBell?: () => void;
}

// Cabeçalho navy do painel, no estilo do "app preview" do manual da marca.
// Usa o ícone sozinho (showWordmark={false}) porque a versão do logo com
// texto já vem colorida (navy+teal) — em cima de um fundo navy o texto
// sumiria; aqui o texto "Predify" é escrito à parte, em branco.
export function HomeHeader({ name, condominioName, hasAlerts, onPressBell }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.brandRow}>
          <Logo size="sm" showWordmark={false} />
          <Text style={styles.brandText}>Predify</Text>
        </View>
        <Pressable style={styles.bellWrap} onPress={onPressBell} hitSlop={8}>
          <Ionicons name="notifications-outline" size={22} color={colors.textOnPrimary} />
          {hasAlerts ? <View style={styles.bellDot} /> : null}
        </Pressable>
      </View>

      <Text style={styles.greeting}>Olá, {name} 👋</Text>
      {condominioName ? (
        <View style={styles.condoRow}>
          <Text style={styles.condoName}>{condominioName}</Text>
          <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.7)" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primary,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing['2xl'],
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandText: { fontFamily: fontFamily.extrabold, fontSize: fontSize.lg, color: colors.textOnPrimary },
  bellWrap: { padding: spacing.xs },
  bellDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  greeting: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.xl,
    color: colors.textOnPrimary,
    marginTop: spacing.lg,
  },
  condoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  condoName: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: 'rgba(255,255,255,0.85)' },
});
