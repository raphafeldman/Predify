import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../lib/auth-context';
import { FREQUENCY_LABEL } from '../../lib/frequency';
import { supabase } from '../../lib/supabase';
import { cardShadow, colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import type { ChecklistTemplate, MaintenanceFrequency, Profile } from '../../lib/types';

const isWeb = Platform.OS === 'web';

export default function RotinasScreen() {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [funcionarios, setFuncionarios] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ChecklistTemplate | null>(null);

  const load = useCallback(async () => {
    const [templatesRes, profilesRes] = await Promise.all([
      supabase.from('checklist_templates').select('*').order('title'),
      supabase.from('profiles').select('*').eq('role', 'funcionario').eq('active', true),
    ]);
    if (templatesRes.data) setTemplates(templatesRes.data as ChecklistTemplate[]);
    if (profilesRes.data) setFuncionarios(profilesRes.data as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function funcionarioName(id: string | null) {
    if (!id) return 'Qualquer um';
    return funcionarios.find((f) => f.id === id)?.full_name ?? '—';
  }

  if (profile?.role !== 'sindico') {
    return (
      <View style={styles.container}>
        <Text style={styles.restricted}>Acesso restrito ao síndico.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Rotinas</Text>
        <Pressable style={styles.newButton} onPress={() => setFormOpen(true)}>
          <Ionicons name="add" size={16} color={colors.textOnPrimary} />
          <Text style={styles.newButtonText}>Nova rotina</Text>
        </Pressable>
      </View>

      {isWeb && templates.length > 0 && (
        <View style={[styles.row, styles.tableHeader]}>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 2 }]}>Título</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Frequência</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Responsável</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Status</Text>
        </View>
      )}

      <FlatList
        data={templates}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          !loading ? <EmptyState icon="repeat-outline" title="Nenhuma rotina cadastrada ainda" /> : null
        }
        renderItem={({ item }) =>
          isWeb ? (
            <Pressable style={styles.row} onPress={() => setEditing(item)}>
              <Text style={[styles.tableCell, styles.tableCellStrong, { flex: 2 }]}>{item.title}</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>{FREQUENCY_LABEL[item.frequency]}</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>{funcionarioName(item.assigned_to)}</Text>
              <View style={{ flex: 1 }}>
                <Badge label={item.active ? 'Ativa' : 'Inativa'} color={item.active ? colors.success : colors.textMuted} />
              </View>
            </Pressable>
          ) : (
            <Pressable style={styles.card} onPress={() => setEditing(item)}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Badge label={item.active ? 'Ativa' : 'Inativa'} color={item.active ? colors.success : colors.textMuted} />
              </View>
              {item.description ? <Text style={styles.cardMeta}>{item.description}</Text> : null}
              <Text style={styles.cardMeta}>
                {FREQUENCY_LABEL[item.frequency]} • {funcionarioName(item.assigned_to)}
              </Text>
            </Pressable>
          )
        }
      />

      <RotinaFormModal
        visible={formOpen}
        funcionarios={funcionarios}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <RotinaFormModal
        visible={Boolean(editing)}
        item={editing ?? undefined}
        funcionarios={funcionarios}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </View>
  );
}

function RotinaFormModal({
  visible,
  item,
  funcionarios,
  onClose,
  onSaved,
}: {
  visible: boolean;
  item?: ChecklistTemplate;
  funcionarios: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { session } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<MaintenanceFrequency>('diaria');
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setTitle(item?.title ?? '');
      setDescription(item?.description ?? '');
      setFrequency(item?.frequency ?? 'diaria');
      setAssignedTo(item?.assigned_to ?? null);
      setActive(item?.active ?? true);
      setError(null);
    }
  }, [visible, item]);

  async function submit() {
    if (!session) return;
    if (!title.trim()) {
      setError('Dê um título para a rotina.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      frequency,
      assigned_to: assignedTo,
      active,
    };
    const { error: saveError } = item
      ? await supabase.from('checklist_templates').update(payload).eq('id', item.id)
      : await supabase.from('checklist_templates').insert({ ...payload, created_by: session.user.id });
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
        <Text style={styles.modalTitle}>{item ? 'Editar rotina' : 'Nova rotina'}</Text>

        <TextField label="Título" value={title} onChangeText={setTitle} placeholder="Ex: Verificar extintores" />
        <TextField
          label="Instruções (opcional)"
          value={description}
          onChangeText={setDescription}
          placeholder="O que exatamente o funcionário deve fazer"
          multiline
        />

        <Text style={styles.label}>Frequência</Text>
        <View style={styles.optionsRow}>
          {(Object.keys(FREQUENCY_LABEL) as MaintenanceFrequency[]).map((key) => (
            <Pressable
              key={key}
              style={[styles.option, frequency === key && styles.optionActive]}
              onPress={() => setFrequency(key)}
            >
              <Text style={[styles.optionText, frequency === key && styles.optionTextActive]}>
                {FREQUENCY_LABEL[key]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Responsável</Text>
        <View style={styles.optionsRow}>
          <Pressable
            style={[styles.option, assignedTo === null && styles.optionActive]}
            onPress={() => setAssignedTo(null)}
          >
            <Text style={[styles.optionText, assignedTo === null && styles.optionTextActive]}>Qualquer um</Text>
          </Pressable>
          {funcionarios.map((f) => (
            <Pressable
              key={f.id}
              style={[styles.option, assignedTo === f.id && styles.optionActive]}
              onPress={() => setAssignedTo(f.id)}
            >
              <Text style={[styles.optionText, assignedTo === f.id && styles.optionTextActive]}>
                {f.full_name}
              </Text>
            </Pressable>
          ))}
        </View>

        {item && (
          <>
            <Text style={styles.label}>Status</Text>
            <Pressable style={styles.option} onPress={() => setActive((v) => !v)}>
              <Text style={styles.optionText}>
                {active ? '✓ Ativa (toque para desativar)' : 'Inativa (toque para ativar)'}
              </Text>
            </Pressable>
          </>
        )}

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
  restricted: { textAlign: 'center', marginTop: 40, fontFamily: fontFamily.regular, color: colors.textMuted },
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
  modalContainer: { flexGrow: 1, padding: spacing.xl, paddingTop: 60, backgroundColor: colors.background },
  modalTitle: { fontFamily: fontFamily.extrabold, fontSize: fontSize.xl, marginBottom: spacing.lg, color: colors.textPrimary },
  label: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  optionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { fontFamily: fontFamily.semibold, color: colors.textSecondary, fontSize: fontSize.sm },
  optionTextActive: { color: colors.textOnPrimary },
  error: { fontFamily: fontFamily.medium, color: colors.danger, marginTop: spacing.md, fontSize: fontSize.sm },
  modalButtonsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  flex1: { flex: 1 },
});
