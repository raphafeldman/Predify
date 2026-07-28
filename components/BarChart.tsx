import { StyleSheet, Text, View } from 'react-native';

export interface BarDatum {
  label: string;
  value: number;
  color: string;
}

export function BarChart({ data, height = 140 }: { data: BarDatum[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <View style={[styles.container, { height: height + 44 }]}>
      {data.map((d) => (
        <View key={d.label} style={styles.column}>
          <Text style={styles.value}>{d.value}</Text>
          <View
            style={[
              styles.bar,
              { height: Math.max(2, (d.value / max) * height), backgroundColor: d.color },
            ]}
          />
          <Text style={styles.label} numberOfLines={1}>
            {d.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around' },
  column: { alignItems: 'center', justifyContent: 'flex-end', flex: 1, maxWidth: 72 },
  value: { fontSize: 12, color: '#374151', fontWeight: '600', marginBottom: 4 },
  bar: { width: 28, borderRadius: 4 },
  label: { fontSize: 11, color: '#6B7280', marginTop: 6, textAlign: 'center' },
});
