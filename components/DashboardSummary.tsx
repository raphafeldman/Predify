import { StyleSheet, Text, View } from 'react-native';
import { cardShadow, colors, fontFamily, fontSize, radius, spacing } from '../lib/theme';

interface Stat {
  label: string;
  value: string;
  color: string;
}

export function DashboardSummary({ stats }: { stats: Stat[] }) {
  return (
    <View style={styles.row}>
      {stats.map((stat) => (
        <View key={stat.label} style={styles.card}>
          <View style={[styles.dot, { backgroundColor: stat.color }]} />
          <Text style={[styles.value, { color: stat.color }]}>{stat.value}</Text>
          <Text style={styles.label}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  card: {
    flexGrow: 1,
    minWidth: 104,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    ...cardShadow,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginBottom: spacing.sm },
  value: { fontFamily: fontFamily.extrabold, fontSize: fontSize['2xl'] },
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
});
