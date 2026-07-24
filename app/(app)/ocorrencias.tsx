import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PhotoPicker } from '../../components/PhotoPicker';
import { RecordCard } from '../../components/RecordCard';
import { useAuth } from '../../lib/auth-context';
import { uploadPhotos } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import type { Occurrence, OccurrenceSeverity } from '../../lib/types';

const SEVERITY_LABEL: Record<OccurrenceSeverity, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

const SEVERITY_COLOR: Record<OccurrenceSeverity, string> = {
  baixa: '#10B981',
  media: '#F59E0B',
  alta: '#DC2626',
};

export default function OcorrenciasScreen() {
  const { session, profile } = useAuth();
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('occurrences')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setOccurrences(data as Occurrence[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('occurrences-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function markResolved(id: string) {
    await supabase
      .from('occurrences')
      .update({ status: 'resolvida', resolved_at: new Date().toISOString() })
      .eq('id', id);
    load();
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={occurrences}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>Nenhuma ocorrência registrada.</Text> : null
        }
        renderItem={({ item }) => (
          <RecordCard
            recordType="occurrence"
            recordId={item.id}
            title={item.title}
            subtitle={new Date(item.created_at).toLocaleString('pt-BR')}
            badge={{
              label: `${SEVERITY_LABEL[item.severity]} • ${
                item.status === 'aberta' ? 'Aberta' : 'Resolvida'
              }`,
              color: item.status === 'resolvida' ? '#6B7280' : SEVERITY_COLOR[item.severity],
            }}
            photoPaths={item.photo_urls}
          >
            <Text style={styles.description}>{item.description}</Text>
            {item.status === 'aberta' &&
              (profile?.role === 'sindico' || item.created_by === session?.user.id) && (
                <Pressable style={styles.resolveButton} onPress={() => markResolved(item.id)}>
                  <Text style={styles.resolveButtonText}>Marcar como resolvida</Text>
                </Pressable>
              )}
          </RecordCard>
        )}
      />

      <Pressable style={styles.fab} onPress={() => setFormOpen(true)}>
        <Text style={styles.fabText}>+ Nova ocorrência</Text>
      </Pressable>

      <NewOccurrenceModal
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={() => {
          setFormOpen(false);
          load();
        }}
      />
    </View>
  );
}

function NewOccurrenceModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { session } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<OccurrenceSeverity>('media');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle('');
    setDescription('');
    setSeverity('media');
    setPhotos([]);
    setError(null);
  }

  async function submit() {
    if (!session) return;
    if (!title.trim() || !description.trim()) {
      setError('Preencha título e descrição.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const photoPaths = photos.length
        ? await uploadPhotos(photos, 'occurrences', session.user.id)
        : [];
      const { error: insertError } = await supabase.from('occurrences').insert({
        title: title.trim(),
        description: description.trim(),
        severity,
        photo_urls: photoPaths,
        created_by: session.user.id,
      });
      if (insertError) throw insertError;
      reset();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Nova ocorrência</Text>

        <Text style={styles.label}>Título</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Ex: Vazamento na garagem"
        />

        <Text style={styles.label}>Descrição</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Descreva o que aconteceu"
          multiline
        />

        <Text style={styles.label}>Gravidade</Text>
        <View style={styles.severityRow}>
          {(Object.keys(SEVERITY_LABEL) as OccurrenceSeverity[]).map((key) => (
            <Pressable
              key={key}
              style={[
                styles.severityOption,
                severity === key && { backgroundColor: SEVERITY_COLOR[key] },
              ]}
              onPress={() => setSeverity(key)}
            >
              <Text style={[styles.severityOptionText, severity === key && { color: '#fff' }]}>
                {SEVERITY_LABEL[key]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Fotos</Text>
        <PhotoPicker uris={photos} onChange={setPhotos} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </Pressable>
          <Pressable style={styles.saveButton} onPress={submit} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Salvar</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  listContent: { padding: 16, paddingBottom: 90 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40 },
  description: { fontSize: 14, color: '#374151', marginTop: 8 },
  resolveButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  resolveButtonText: { color: '#059669', fontWeight: '600', fontSize: 12 },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#1F6FEB',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 18,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  fabText: { color: '#fff', fontWeight: '700' },
  modalContainer: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#fff' },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16, color: '#111827' },
  label: { fontSize: 13, color: '#374151', marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  severityRow: { flexDirection: 'row', gap: 8 },
  severityOption: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  severityOptionText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  error: { color: '#DC2626', marginTop: 12, fontSize: 13 },
  modalButtonsRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelButtonText: { color: '#374151', fontWeight: '600' },
  saveButton: {
    flex: 1,
    backgroundColor: '#1F6FEB',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontWeight: '700' },
});
