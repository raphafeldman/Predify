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
import type {
  MaintenanceFrequency,
  MaintenanceItem,
  MaintenanceRecord,
  MaintenanceRecordType,
} from '../../lib/types';

const FREQUENCY_LABEL: Record<MaintenanceFrequency, string> = {
  diaria: 'Diária',
  semanal: 'Semanal',
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

export default function ManutencaoScreen() {
  const { profile } = useAuth();
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordFormOpen, setRecordFormOpen] = useState(false);
  const [itemFormOpen, setItemFormOpen] = useState(false);

  const load = useCallback(async () => {
    const [itemsRes, recordsRes] = await Promise.all([
      supabase.from('maintenance_items').select('*').order('next_due_date'),
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

  const today = new Date().toISOString().slice(0, 10);

  return (
    <View style={styles.container}>
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Manutenção preventiva</Text>
              {profile?.role === 'sindico' && (
                <Pressable onPress={() => setItemFormOpen(true)}>
                  <Text style={styles.addLink}>+ Novo item</Text>
                </Pressable>
              )}
            </View>
            {items.length === 0 && !loading && (
              <Text style={styles.empty}>Nenhum item preventivo cadastrado.</Text>
            )}
            {items.map((item) => {
              const overdue = item.next_due_date < today;
              return (
                <View key={item.id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>
                      {item.category} • {FREQUENCY_LABEL[item.frequency]}
                    </Text>
                  </View>
                  <Text style={[styles.itemDueDate, overdue && styles.itemDueDateOverdue]}>
                    {new Date(item.next_due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </Text>
                </View>
              );
            })}

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Histórico</Text>
            {records.length === 0 && !loading && (
              <Text style={styles.empty}>Nenhuma manutenção registrada ainda.</Text>
            )}
          </>
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
                color: item.type === 'preventiva' ? '#1F6FEB' : '#F59E0B',
              }}
              photoPaths={item.photo_urls}
            >
              <Text style={styles.description}>{item.description}</Text>
            </RecordCard>
          );
        }}
      />

      <Pressable style={styles.fab} onPress={() => setRecordFormOpen(true)}>
        <Text style={styles.fabText}>+ Registrar manutenção</Text>
      </Pressable>

      <NewRecordModal
        visible={recordFormOpen}
        items={items}
        onClose={() => setRecordFormOpen(false)}
        onCreated={() => {
          setRecordFormOpen(false);
          load();
        }}
      />

      <NewItemModal
        visible={itemFormOpen}
        onClose={() => setItemFormOpen(false)}
        onCreated={() => {
          setItemFormOpen(false);
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
  const { session } = useAuth();
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
    if (!session) return;
    if (!description.trim()) {
      setError('Descreva o que foi feito.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const photoPaths = photos.length
        ? await uploadPhotos(photos, 'maintenance', session.user.id)
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
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Registrar manutenção</Text>

        <Text style={styles.label}>Tipo</Text>
        <View style={styles.severityRow}>
          {(['preventiva', 'corretiva'] as MaintenanceRecordType[]).map((key) => (
            <Pressable
              key={key}
              style={[styles.severityOption, type === key && styles.severityOptionActive]}
              onPress={() => setType(key)}
            >
              <Text
                style={[styles.severityOptionText, type === key && styles.severityOptionTextActive]}
              >
                {key === 'preventiva' ? 'Preventiva' : 'Corretiva'}
              </Text>
            </Pressable>
          ))}
        </View>

        {type === 'preventiva' && items.length > 0 && (
          <>
            <Text style={styles.label}>Item preventivo</Text>
            <View style={styles.categoryRow}>
              {items.map((item) => (
                <Pressable
                  key={item.id}
                  style={[
                    styles.categoryOption,
                    maintenanceItemId === item.id && styles.categoryOptionActive,
                  ]}
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

        <Text style={styles.label}>O que foi feito</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Descreva o serviço realizado"
          multiline
        />

        <Text style={styles.label}>Fotos (opcional)</Text>
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

function NewItemModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [frequency, setFrequency] = useState<MaintenanceFrequency>('mensal');
  const [nextDueDate, setNextDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setCategory('');
    setFrequency('mensal');
    setNextDueDate('');
    setNotes('');
    setError(null);
  }

  async function submit() {
    if (!session) return;
    if (!name.trim() || !category.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) {
      setError('Preencha nome, categoria e a próxima data no formato AAAA-MM-DD.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from('maintenance_items').insert({
        name: name.trim(),
        category: category.trim(),
        frequency,
        next_due_date: nextDueDate,
        notes: notes.trim() || null,
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
        <Text style={styles.modalTitle}>Novo item preventivo</Text>

        <Text style={styles.label}>Nome</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Ex: Manutenção do elevador"
        />

        <Text style={styles.label}>Categoria</Text>
        <TextInput
          style={styles.input}
          value={category}
          onChangeText={setCategory}
          placeholder="Ex: Elevador, Bomba, Gerador..."
        />

        <Text style={styles.label}>Frequência</Text>
        <View style={styles.categoryRow}>
          {(Object.keys(FREQUENCY_LABEL) as MaintenanceFrequency[]).map((key) => (
            <Pressable
              key={key}
              style={[styles.categoryOption, frequency === key && styles.categoryOptionActive]}
              onPress={() => setFrequency(key)}
            >
              <Text
                style={[
                  styles.categoryOptionText,
                  frequency === key && styles.categoryOptionTextActive,
                ]}
              >
                {FREQUENCY_LABEL[key]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Próxima data (AAAA-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={nextDueDate}
          onChangeText={setNextDueDate}
          placeholder="2026-08-15"
        />

        <Text style={styles.label}>Observações (opcional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          multiline
        />

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
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  addLink: { color: '#1F6FEB', fontWeight: '600', fontSize: 13 },
  empty: { color: '#9CA3AF', marginBottom: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  itemName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  itemMeta: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  itemDueDate: { fontSize: 13, color: '#374151', fontWeight: '600' },
  itemDueDateOverdue: { color: '#DC2626' },
  description: { fontSize: 14, color: '#374151', marginTop: 8 },
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
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  severityRow: { flexDirection: 'row', gap: 8 },
  severityOption: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  severityOptionActive: { backgroundColor: '#1F6FEB', borderColor: '#1F6FEB' },
  severityOptionText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  severityOptionTextActive: { color: '#fff' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryOption: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  categoryOptionActive: { backgroundColor: '#1F6FEB', borderColor: '#1F6FEB' },
  categoryOptionText: { color: '#374151', fontSize: 13, fontWeight: '600' },
  categoryOptionTextActive: { color: '#fff' },
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
