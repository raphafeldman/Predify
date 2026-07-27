import { StyleSheet, Text, View } from 'react-native';

interface Stat {
  label: string;
  value: string;
  color: string;
}

export function DashboardSummary({ stats }: { stats: Stat[] }) {
  return (
    <View style={styles.row}>
      {stats.map((stat) => (
        <View key={stat.label} style={[styles.card, { borderColor: stat.color }]}>
          <Text style={[styles.value, { color: stat.color }]}>{stat.value}</Text>
          <Text style={styles.label}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  card: {
    flexGrow: 1,
    minWidth: 100,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  value: { fontSize: 22, fontWeight: '700' },
  label: { fontSize: 12, color: '#6B7280', marginTop: 2 },
});
