import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import type { DocumentItem, MaintenanceRecord, Occurrence, Task } from '../../lib/types';
import { FeedCard, type FeedItem } from './index';

const PERIODS = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
  { label: 'Tudo', days: null },
];

type TypeFilter = 'todos' | FeedItem['kind'];

const TYPE_LABELS: Record<TypeFilter, string> = {
  todos: 'Todos',
  occurrence: 'Ocorrências',
  task: 'Tarefas',
  maintenance: 'Manutenção',
  document: 'Documentos',
};

export default function HistoricoScreen() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodDays, setPeriodDays] = useState<number | null>(30);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('todos');

  const load = useCallback(async () => {
    setLoading(true);
    const [occRes, taskRes, maintRes, docRes] = await Promise.all([
      supabase.from('occurrences').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(200),
      supabase
        .from('maintenance_records')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(200),
    ]);

    const merged: FeedItem[] = [
      ...((occRes.data as Occurrence[]) ?? []).map((d) => ({
        kind: 'occurrence' as const,
        id: d.id,
        created_at: d.created_at,
        data: d,
      })),
      ...((taskRes.data as Task[]) ?? []).map((d) => ({
        kind: 'task' as const,
        id: d.id,
        created_at: d.created_at,
        data: d,
      })),
      ...((maintRes.data as MaintenanceRecord[]) ?? []).map((d) => ({
        kind: 'maintenance' as const,
        id: d.id,
        created_at: d.created_at,
        data: d,
      })),
      ...((docRes.data as DocumentItem[]) ?? []).map((d) => ({
        kind: 'document' as const,
        id: d.id,
        created_at: d.created_at,
        data: d,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setItems(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const cutoff = periodDays ? Date.now() - periodDays * 24 * 60 * 60 * 1000 : null;
    return items.filter((item) => {
      if (typeFilter !== 'todos' && item.kind !== typeFilter) return false;
      if (cutoff && new Date(item.created_at).getTime() < cutoff) return false;
      return true;
    });
  }, [items, periodDays, typeFilter]);

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          <>
            <Text style={styles.sectionTitle}>Histórico completo</Text>
            <View style={styles.filterRow}>
              {PERIODS.map((p) => (
                <Pressable
                  key={p.label}
                  style={[styles.filterChip, periodDays === p.days && styles.filterChipActive]}
                  onPress={() => setPeriodDays(p.days)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      periodDays === p.days && styles.filterChipTextActive,
                    ]}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.filterRow}>
              {(Object.keys(TYPE_LABELS) as TypeFilter[]).map((key) => (
                <Pressable
                  key={key}
                  style={[styles.filterChip, typeFilter === key && styles.filterChipActive]}
                  onPress={() => setTypeFilter(key)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      typeFilter === key && styles.filterChipTextActive,
                    ]}
                  >
                    {TYPE_LABELS[key]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        }
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>Nada encontrado para esse filtro.</Text> : null
        }
        renderItem={({ item }) => <FeedCard item={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  listContent: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterChip: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  filterChipActive: { backgroundColor: '#1F6FEB', borderColor: '#1F6FEB' },
  filterChipText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40 },
});
