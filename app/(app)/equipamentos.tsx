import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { DateInput } from '../../components/DateInput';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { PhotoPicker } from '../../components/PhotoPicker';
import { RecordCard } from '../../components/RecordCard';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../lib/auth-context';
import { FREQUENCY_LABEL, getMaintenanceUrgency, URGENCY_COLOR, URGENCY_LABEL } from '../../lib/frequency';
import { uploadPhotos } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { cardShadow, colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import type { MaintenanceFrequency, MaintenanceItem, MaintenanceRecord, Profile } from '../../lib/types';

const isWeb = Platform.OS === 'web';

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
}

export default function EquipamentosScreen() {
  const { profile } = useAuth();
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [funcionarios, setFuncionarios] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<MaintenanceItem | null>(null);

  const load = useCallback(async () => {
    const [itemsRes, profilesRes] = await Promise.all([
      supabase.from('maintenance_items').select('*').order('next_due_date'),
      supabase.from('profiles').select('*').eq('role', 'funcionario').eq('active', true),
    ]);
    if (itemsRes.data) setItems(itemsRes.data as MaintenanceItem[]);
    if (profilesRes.data) setFuncionarios(profilesRes.data as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function funcionarioName(id: string | null) {
    if (!id) return '—';
    return funcionarios.find((f) => f.id === id)?.full_name ?? '—';
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Equipamentos</Text>
        {profile?.role === 'sindico' && (
          <Pressable style={styles.newButton} onPress={() => setFormOpen(true)}>
            <Ionicons name="add" size={16} color={colors.textOnPrimary} />
            <Text style={styles.newButtonText}>Novo equipamento</Text>
          </Pressable>
        )}
      </View>

      {isWeb && items.length > 0 && (
        <View style={[styles.row, styles.tableHeader]}>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 2 }]}>Nome</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Local</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Frequência</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Próxima data</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Responsável</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Status</Text>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          !loading ? (
            <EmptyState icon="hardware-chip-outline" title="Nenhum equipamento cadastrado ainda" />
          ) : null
        }
        renderItem={({ item }) => {
          const urgency = getMaintenanceUrgency(item.next_due_date);
          if (isWeb) {
            return (
              <Pressable style={styles.row} onPress={() => setSelected(item)}>
                <Text style={[styles.tableCell, styles.tableCellStrong, { flex: 2 }]}>{item.name}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{item.location ?? '—'}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{FREQUENCY_LABEL[item.frequency]}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{formatDate(item.next_due_date)}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{funcionarioName(item.assigned_to)}</Text>
                <View style={{ flex: 1 }}>
                  <Badge label={URGENCY_LABEL[urgency]} color={URGENCY_COLOR[urgency]} />
                </View>
              </Pressable>
            );
          }
          return (
            <Pressable style={styles.card} onPress={() => setSelected(item)}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Badge label={URGENCY_LABEL[urgency]} color={URGENCY_COLOR[urgency]} />
              </View>
              <Text style={styles.cardMeta}>
                {item.category} • {FREQUENCY_LABEL[item.frequency]}
                {item.location ? ` • ${item.location}` : ''}
              </Text>
              <Text style={styles.cardMeta}>Próxima data: {formatDate(item.next_due_date)}</Text>
            </Pressable>
          );
        }}
      />

      <EquipmentFormModal
        visible={formOpen}
        funcionarios={funcionarios}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <EquipmentDetailModal
        item={selected}
        funcionarios={funcionarios}
        canEdit={profile?.role === 'sindico'}
        onClose={() => setSelected(null)}
        onSaved={() => {
          setSelected(null);
          load();
        }}
      />
    </View>
  );
}

function FrequencyPicker({
  value,
  onChange,
}: {
  value: MaintenanceFrequency;
  onChange: (f: MaintenanceFrequency) => void;
}) {
  return (
    <View style={styles.optionsRow}>
      {(Object.keys(FREQUENCY_LABEL) as MaintenanceFrequency[]).map((key) => (
        <Pressable
          key={key}
          style={[styles.option, value === key && styles.optionActive]}
          onPress={() => onChange(key)}
        >
          <Text style={[styles.optionText, value === key && styles.optionTextActive]}>
            {FREQUENCY_LABEL[key]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function AssigneePicker({
  value,
  funcionarios,
  onChange,
}: {
  value: string | null;
  funcionarios: Profile[];
  onChange: (id: string | null) => void;
}) {
  return (
    <View style={styles.optionsRow}>
      <Pressable style={[styles.option, value === null && styles.optionActive]} onPress={() => onChange(null)}>
        <Text style={[styles.optionText, value === null && styles.optionTextActive]}>Qualquer um</Text>
      </Pressable>
      {funcionarios.map((f) => (
        <Pressable
          key={f.id}
          style={[styles.option, value === f.id && styles.optionActive]}
          onPress={() => onChange(f.id)}
        >
          <Text style={[styles.optionText, value === f.id && styles.optionTextActive]}>{f.full_name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function EquipmentFormModal({
  visible,
  funcionarios,
  onClose,
  onSaved,
  item,
}: {
  visible: boolean;
  funcionarios: Profile[];
  onClose: () => void;
  onSaved: () => void;
  item?: MaintenanceItem | null;
}) {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [frequency, setFrequency] = useState<MaintenanceFrequency>('mensal');
  const [nextDueDate, setNextDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(item?.name ?? '');
      setCategory(item?.category ?? '');
      setLocation(item?.location ?? '');
      setBrand(item?.brand ?? '');
      setModel(item?.model ?? '');
      setSerialNumber(item?.serial_number ?? '');
      setFrequency(item?.frequency ?? 'mensal');
      setNextDueDate(item?.next_due_date ?? '');
      setAssignedTo(item?.assigned_to ?? null);
      setNotes(item?.notes ?? '');
      setError(null);
    }
  }, [visible, item]);

  async function submit() {
    if (!session) return;
    if (!name.trim() || !category.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) {
      setError('Preencha nome, categoria e a próxima data.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: name.trim(),
      category: category.trim(),
      location: location.trim() || null,
      brand: brand.trim() || null,
      model: model.trim() || null,
      serial_number: serialNumber.trim() || null,
      frequency,
      next_due_date: nextDueDate,
      assigned_to: assignedTo,
      notes: notes.trim() || null,
    };
    const { error: saveError } = item
      ? await supabase.from('maintenance_items').update(payload).eq('id', item.id)
      : await supabase.from('maintenance_items').insert({ ...payload, created_by: session.user.id });
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    onSaved();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>{item ? 'Editar equipamento' : 'Novo equipamento'}</Text>

        <TextField label="Nome" value={name} onChangeText={setName} placeholder="Ex: Elevador social" />
        <TextField
          label="Categoria"
          value={category}
          onChangeText={setCategory}
          placeholder="Ex: Elevador, Bomba, Gerador..."
        />
        <TextField
          label="Localização (opcional)"
          value={location}
          onChangeText={setLocation}
          placeholder="Ex: Casa de máquinas"
        />
        <TextField label="Marca (opcional)" value={brand} onChangeText={setBrand} />
        <TextField label="Modelo (opcional)" value={model} onChangeText={setModel} />
        <TextField
          label="Número de série / patrimônio (opcional)"
          value={serialNumber}
          onChangeText={setSerialNumber}
        />

        <Text style={styles.label}>Frequência</Text>
        <FrequencyPicker value={frequency} onChange={setFrequency} />

        <Text style={styles.label}>Próxima data</Text>
        <DateInput value={nextDueDate} onChangeISO={setNextDueDate} />

        <Text style={styles.label}>Responsável</Text>
        <AssigneePicker value={assignedTo} funcionarios={funcionarios} onChange={setAssignedTo} />

        <TextField label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Salvar" onPress={submit} loading={saving} style={styles.flex1} />
        </View>
      </ModalFormLayout>
    </Modal>
  );
}

function EquipmentDetailModal({
  item,
  funcionarios,
  canEdit,
  onClose,
  onSaved,
}: {
  item: MaintenanceItem | null;
  funcionarios: Profile[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [editing, setEditing] = useState(false);
  const [logFormOpen, setLogFormOpen] = useState(false);

  const loadRecords = useCallback(async () => {
    if (!item) return;
    const { data } = await supabase
      .from('maintenance_records')
      .select('*')
      .eq('maintenance_item_id', item.id)
      .order('performed_at', { ascending: false });
    if (data) setRecords(data as MaintenanceRecord[]);
  }, [item]);

  useEffect(() => {
    setEditing(false);
    setLogFormOpen(false);
    loadRecords();
  }, [item, loadRecords]);

  if (!item) return null;

  if (editing) {
    return (
      <EquipmentFormModal
        visible
        item={item}
        funcionarios={funcionarios}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onSaved();
        }}
      />
    );
  }

  const urgency = getMaintenanceUrgency(item.next_due_date);

  return (
    <Modal visible={Boolean(item)} animationType="slide" onRequestClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <View style={styles.detailHeaderRow}>
          <Text style={styles.modalTitle}>{item.name}</Text>
          <Badge label={URGENCY_LABEL[urgency]} color={URGENCY_COLOR[urgency]} />
        </View>

        <Text style={styles.detailLine}>
          {item.category} • {FREQUENCY_LABEL[item.frequency]}
        </Text>
        {item.location ? <Text style={styles.detailLine}>📍 {item.location}</Text> : null}
        {item.brand || item.model ? (
          <Text style={styles.detailLine}>{[item.brand, item.model].filter(Boolean).join(' ')}</Text>
        ) : null}
        {item.serial_number ? (
          <Text style={styles.detailLine}>Nº série/patrimônio: {item.serial_number}</Text>
        ) : null}
        <Text style={styles.detailLine}>Próxima manutenção: {formatDate(item.next_due_date)}</Text>
        {item.notes ? <Text style={styles.detailLine}>{item.notes}</Text> : null}

        <View style={styles.modalButtonsRow}>
          {canEdit && (
            <Button title="Editar" variant="secondary" onPress={() => setEditing(true)} style={styles.flex1} />
          )}
          <Button title="Registrar manutenção" onPress={() => setLogFormOpen(true)} style={styles.flex1} />
        </View>

        <Text style={[styles.label, { marginTop: spacing.xl }]}>Histórico</Text>
        {records.length === 0 && <Text style={styles.empty}>Nenhuma manutenção registrada ainda.</Text>}
        {records.map((record) => (
          <RecordCard
            key={record.id}
            recordType="maintenance_record"
            recordId={record.id}
            title={record.type === 'preventiva' ? 'Preventiva' : 'Corretiva'}
            subtitle={new Date(record.performed_at).toLocaleString('pt-BR')}
            badge={{ label: record.status, color: colors.primary }}
            photoPaths={record.photo_urls}
          >
            <Text style={styles.detailLine}>{record.description}</Text>
          </RecordCard>
        ))}

        <Button title="Fechar" variant="secondary" onPress={onClose} style={{ marginTop: spacing.md }} />
      </ModalFormLayout>

      <LogMaintenanceModal
        visible={logFormOpen}
        item={item}
        onClose={() => setLogFormOpen(false)}
        onSaved={() => {
          setLogFormOpen(false);
          loadRecords();
          onSaved();
        }}
      />
    </Modal>
  );
}

function LogMaintenanceModal({
  visible,
  item,
  onClose,
  onSaved,
}: {
  visible: boolean;
  item: MaintenanceItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { session, profile } = useAuth();
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDescription('');
      setPhotos([]);
      setError(null);
    }
  }, [visible]);

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
        maintenance_item_id: item.id,
        type: 'preventiva',
        description: description.trim(),
        photo_urls: photoPaths,
        performed_by: session.user.id,
        status: 'concluida',
      });
      if (insertError) throw insertError;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Registrar manutenção — {item.name}</Text>

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

        <Text style={styles.hint}>
          A próxima data de vencimento deste equipamento é recalculada automaticamente a partir de hoje, de acordo
          com a frequência dele.
        </Text>
      </ModalFormLayout>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.textPrimary },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  newButtonText: { fontFamily: fontFamily.bold, color: colors.textOnPrimary, fontSize: fontSize.sm },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  empty: { textAlign: 'center', fontFamily: fontFamily.regular, color: colors.textMuted, marginTop: spacing.xl },
  tableHeader: { borderBottomWidth: 2, borderBottomColor: colors.border, paddingVertical: spacing.sm },
  tableHeaderText: { fontFamily: fontFamily.bold, color: colors.textSecondary, fontSize: fontSize.xs, textTransform: 'uppercase' },
  tableCell: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  tableCellStrong: { fontFamily: fontFamily.semibold, color: colors.textPrimary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...cardShadow,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontFamily: fontFamily.semibold, fontSize: fontSize.md, color: colors.textPrimary, flex: 1, marginRight: spacing.sm },
  cardMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  detailHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  detailLine: { fontFamily: fontFamily.regular, fontSize: fontSize.base, color: colors.textSecondary, marginTop: spacing.xs },
  modalContainer: { flexGrow: 1, padding: spacing.xl, paddingTop: 60, backgroundColor: colors.background },
  modalTitle: { fontFamily: fontFamily.extrabold, fontSize: fontSize.xl, color: colors.textPrimary },
  label: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  optionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { fontFamily: fontFamily.semibold, color: colors.textSecondary, fontSize: fontSize.sm },
  optionTextActive: { color: colors.textOnPrimary },
  error: { fontFamily: fontFamily.medium, color: colors.danger, marginTop: spacing.md, fontSize: fontSize.sm },
  hint: { marginTop: spacing.lg, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  modalButtonsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  flex1: { flex: 1 },
});
