import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, floatingShadow, fontFamily, fontSize, radius, spacing } from '../lib/theme';
import { useIsWideScreen } from '../lib/useIsWideScreen';

interface Props {
  label: string;
  onPress: () => void;
}

/** Botão de ação principal da tela (ex.: "Nova ordem de serviço"): pílula
 * flutuante no canto inferior no celular — padrão esperado de app nativo —
 * e botão fixo no topo da tela na versão web larga — padrão de toolbar de
 * web app, em vez da mesma pílula flutuante só que esticada. */
export function ScreenActionButton({ label, onPress }: Props) {
  const isWideScreen = useIsWideScreen();

  if (isWideScreen) {
    return (
      <View style={styles.topBar}>
        <Pressable style={styles.topButton} onPress={onPress}>
          <Ionicons name="add" size={16} color={colors.textOnPrimary} />
          <Text style={styles.topButtonText}>{label}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable style={styles.fab} onPress={onPress}>
      <Ionicons name="add" size={18} color={colors.textOnPrimary} />
      <Text style={styles.fabText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  topButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  topButtonText: { fontFamily: fontFamily.bold, color: colors.textOnPrimary, fontSize: fontSize.sm },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...floatingShadow,
  },
  fabText: { fontFamily: fontFamily.bold, color: colors.textOnPrimary, fontSize: fontSize.sm },
});
