import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '../../components/AppModal';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { PhotoPicker } from '../../components/PhotoPicker';
import { RecordCard } from '../../components/RecordCard';
import { ScreenActionButton } from '../../components/ScreenActionButton';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../lib/auth-context';
import { uploadPhotos } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import type { MaintenanceItem, MaintenanceRecord, MaintenanceRecordType } from '../../lib/types';

export default function ManutencaoScreen() {
  const router = useRouter();
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordFormOpen, setRecordFormOpen] = useState(false);

  const load = useCallback(async () => {
    const [itemsRes, recordsRes] = await Promise.all([
      supabase.from('maintenance_items').select('*').order('name'),
      supabase
        .from('maintenance_records')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    if (itemsRes.data) setItems(itemsRes.data as MaintenanceItem[]);
    if (recordsRes.data) setRecords(recordsRes.data as MaintenanceRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <ScreenActionButton label="Registrar manutenção" onPress={() => setRecordFormOpen(true)} />

      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Histórico de manutenções</Text>
            <Pressable onPress={() => router.push('/equipamentos')}>
              <Text style={styles.addLink}>Ver equipamentos →</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState icon="construct-outline" title="Nenhuma manutenção registrada ainda" />
          ) : null
        }
        renderItem={({ item }) => {
          const relatedItem = items.find((i) => i.id === item.maintenance_item_id);
          return (
            <RecordCard
              recordType="maintenance_record"
              recordId={item.id}
              title={relatedItem ? relatedItem.name : item.type === 'preventiva' ? 'Preventiva' : 'Corretiva'}
              subtitle={new Date(item.performed_at).toLocaleString('pt-BR')}
              badge={{
                label: `${item.type === 'preventiva' ? 'Preventiva' : 'Corretiva'} • ${item.status}`,
                color: item.type === 'preventiva' ? colors.primary : colors.warning,
              }}
              photoPaths={item.photo_urls}
            >
              <Text style={styles.description}>{item.description}</Text>
            </RecordCard>
          );
        }}
      />

      <NewRecordModal
        visible={recordFormOpen}
        items={items}
        onClose={() => setRecordFormOpen(false)}
        onCreated={() => {
          setRecordFormOpen(false);
          load();
        }}
      />
    </View>
  );
}

function NewRecordModal({
  visible,
  items,
  onClose,
  onCreated,
}: {
  visible: boolean;
  items: MaintenanceItem[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { session, profile } = useAuth();
  const [type, setType] = useState<MaintenanceRecordType>('corretiva');
  const [maintenanceItemId, setMaintenanceItemId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setType('corretiva');
    setMaintenanceItemId(null);
    setDescription('');
    setPhotos([]);
    setError(null);
  }

  async function submit() {
    if (!session || !profile) return;
    if (!description.trim()) {
      setError('Descreva o que foi feito.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const photoPaths = photos.length
        ? await uploadPhotos(photos, 'maintenance', session.user.id, profile.condominio_id)
        : [];
      const { error: insertError } = await supabase.from('maintenance_records').insert({
        type,
        maintenance_item_id: type === 'preventiva' ? maintenanceItemId : null,
        description: description.trim(),
        photo_urls: photoPaths,
        performed_by: session.user.id,
        status: 'concluida',
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
    <AppModal visible={visible} onClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Registrar manutenção</Text>

        <Text style={styles.label}>Tipo</Text>
        <View style={styles.severityRow}>
          {(['preventiva', 'corretiva'] as MaintenanceRecordType[]).map((key) => (
            <Pressable
              key={key}
              style={[styles.severityOption, type === key && styles.severityOptionActive]}
              onPress={() => setType(key)}
            >
              <Text style={[styles.severityOptionText, type === key && styles.severityOptionTextActive]}>
                {key === 'preventiva' ? 'Preventiva' : 'Corretiva'}
              </Text>
            </Pressable>
          ))}
        </View>

        {type === 'preventiva' && items.length > 0 && (
          <>
            <Text style={styles.label}>Equipamento</Text>
            <View style={styles.categoryRow}>
              {items.map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.categoryOption, maintenanceItemId === item.id && styles.categoryOptionActive]}
                  onPress={() => setMaintenanceItemId(item.id)}
                >
                  <Text
                    style={[
                      styles.categoryOptionText,
                      maintenanceItemId === item.id && styles.categoryOptionTextActive,
                    ]}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        {type === 'preventiva' && items.length === 0 && (
          <Text style={styles.hintSmall}>
            Nenhum equipamento cadastrado ainda — cadastre um em &quot;Equipamentos&quot; primeiro.
          </Text>
        )}

        <TextField
          label="O que foi feito"
          value={description}
          onChangeText={setDescription}
          placeholder="Descreva o serviço realizado"
          multiline
        />

        <Text style={styles.label}>Fotos (opcional)</Text>
        <PhotoPicker uris={photos} onChange={setPhotos} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Salvar" onPress={submit} loading={saving} style={styles.flex1} />
        </View>
      </ModalFormLayout>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, paddingBottom: 90 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.textPrimary },
  addLink: { fontFamily: fontFamily.semibold, color: colors.primary, fontSize: fontSize.sm },
  hintSmall: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  description: { fontFamily: fontFamily.regular, fontSize: fontSize.base, color: colors.textSecondary, marginTop: spacing.sm },
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
  severityOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  severityOptionText: { fontFamily: fontFamily.semibold, color: colors.textSecondary, fontSize: fontSize.sm },
  severityOptionTextActive: { color: colors.textOnPrimary },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryOption: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  categoryOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryOptionText: { fontFamily: fontFamily.semibold, color: colors.textSecondary, fontSize: fontSize.sm },
  categoryOptionTextActive: { color: colors.textOnPrimary },
  error: { fontFamily: fontFamily.medium, color: colors.danger, marginTop: spacing.md, fontSize: fontSize.sm },
  modalButtonsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  flex1: { flex: 1 },
});
