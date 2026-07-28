import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, fontSize, radius } from '../../lib/theme';

interface Props {
  size?: 'sm' | 'lg';
  showWordmark?: boolean;
}

export function Logo({ size = 'sm', showWordmark = true }: Props) {
  const markSize = size === 'lg' ? 64 : 34;
  const iconSize = size === 'lg' ? 32 : 18;

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.mark,
          { width: markSize, height: markSize, borderRadius: markSize / 2 },
        ]}
      >
        <Ionicons name="shield-checkmark" size={iconSize} color={colors.textOnPrimary} />
      </View>
      {showWordmark && (
        <Text style={[styles.wordmark, size === 'lg' && styles.wordmarkLg]}>Zelo</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  wordmark: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.xl,
    color: colors.textPrimary,
  },
  wordmarkLg: {
    fontSize: fontSize['2xl'],
  },
});
