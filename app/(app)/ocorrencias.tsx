import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { PhotoPicker } from '../../components/PhotoPicker';
import { RecordCard } from '../../components/RecordCard';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TextField } from '../../components/ui/TextField';
import { NewServiceRequestModal } from './prestadores';
import { useAuth } from '../../lib/auth-context';
import { uploadPhotos } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { colors, floatingShadow, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import type { Occurrence, OccurrenceSeverity } from '../../lib/types';

const SEVERITY_LABEL: Record<OccurrenceSeverity, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

const SEVERITY_COLOR: Record<OccurrenceSeverity, string> = {
  baixa: colors.success,
  media: colors.warning,
  alta: colors.danger,
};

export default function OcorrenciasScreen() {
  const { session, profile } = useAuth();
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [quoteRequestFor, setQuoteRequestFor] = useState<Occurrence | null>(null);

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
          !loading ? (
            <EmptyState
              icon="checkmark-circle-outline"
              title="Nenhuma ocorrência registrada"
              subtitle="Tudo tranquilo por aqui."
            />
          ) : null
        }
        renderItem={({ item }) => (
          <RecordCard
            recordType="occurrence"
            recordId={item.id}
            title={item.title}
            subtitle={new Date(item.created_at).toLocaleString('pt-BR')}
            badge={{
              label: `${SEVERITY_LABEL[item.severity]} • ${item.status === 'aberta' ? 'Aberta' : 'Resolvida'}`,
              color: item.status === 'resolvida' ? colors.textMuted : SEVERITY_COLOR[item.severity],
            }}
            photoPaths={item.photo_urls}
          >
            <Text style={styles.description}>{item.description}</Text>
            <View style={styles.actionsRow}>
              {item.status === 'aberta' &&
                (profile?.role === 'sindico' || item.created_by === session?.user.id) && (
                  <Pressable style={styles.resolveButton} onPress={() => markResolved(item.id)}>
                    <Text style={styles.resolveButtonText}>Marcar como resolvida</Text>
                  </Pressable>
                )}
              <Pressable style={styles.quoteButton} onPress={() => setQuoteRequestFor(item)}>
                <Ionicons name="briefcase-outline" size={13} color={colors.primary} />
                <Text style={styles.quoteButtonText}>Solicitar orçamento</Text>
              </Pressable>
            </View>
          </RecordCard>
        )}
      />

      <Pressable style={styles.fab} onPress={() => setFormOpen(true)}>
        <Ionicons name="add" size={18} color={colors.textOnPrimary} />
        <Text style={styles.fabText}>Nova ocorrência</Text>
      </Pressable>

      <NewOccurrenceModal
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={() => {
          setFormOpen(false);
          load();
        }}
      />

      <NewServiceRequestModal
        visible={Boolean(quoteRequestFor)}
        occurrenceId={quoteRequestFor?.id}
        initialTitle={quoteRequestFor?.title}
        initialNotes={quoteRequestFor?.description}
        onClose={() => setQuoteRequestFor(null)}
        onCreated={() => setQuoteRequestFor(null)}
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
  const { session, profile } = useAuth();
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
    if (!session || !profile) return;
    if (!title.trim() || !description.trim()) {
      setError('Preencha título e descrição.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const photoPaths = photos.length
        ? await uploadPhotos(photos, 'occurrences', session.user.id, profile.condominio_id)
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
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Nova ocorrência</Text>

        <TextField label="Título" value={title} onChangeText={setTitle} placeholder="Ex: Vazamento na garagem" />
        <TextField
          label="Descrição"
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
              style={[styles.severityOption, severity === key && { backgroundColor: SEVERITY_COLOR[key], borderColor: SEVERITY_COLOR[key] }]}
              onPress={() => setSeverity(key)}
            >
              <Text style={[styles.severityOptionText, severity === key && styles.severityOptionTextActive]}>
                {SEVERITY_LABEL[key]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Fotos</Text>
        <PhotoPicker uris={photos} onChange={setPhotos} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Salvar" onPress={submit} loading={saving} style={styles.flex1} />
        </View>
      </ModalFormLayout>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, paddingBottom: 90 },
  description: { fontFamily: fontFamily.regular, fontSize: fontSize.base, color: colors.textSecondary, marginTop: spacing.sm },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  resolveButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.successLight,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  resolveButtonText: { fontFamily: fontFamily.semibold, color: '#15803D', fontSize: fontSize.xs },
  quoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  quoteButtonText: { fontFamily: fontFamily.semibold, color: colors.primary, fontSize: fontSize.xs },
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
  modalContainer: { flexGrow: 1, padding: spacing.xl, paddingTop: 60, backgroundColor: colors.background },
  modalTitle: { fontFamily: fontFamily.extrabold, fontSize: fontSize.xl, marginBottom: spacing.lg, color: colors.textPrimary },
  label: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  severityRow: { flexDirection: 'row', gap: spacing.sm },
  severityOption: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  severityOptionText: { fontFamily: fontFamily.semibold, color: colors.textSecondary, fontSize: fontSize.sm },
  severityOptionTextActive: { color: colors.textOnPrimary },
  error: { fontFamily: fontFamily.medium, color: colors.danger, marginTop: spacing.md, fontSize: fontSize.sm },
  modalButtonsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  flex1: { flex: 1 },
});
