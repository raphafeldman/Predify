import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '../../components/AppModal';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { PhotoPicker } from '../../components/PhotoPicker';
import { RecordCard } from '../../components/RecordCard';
import { ScreenActionButton } from '../../components/ScreenActionButton';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TextField } from '../../components/ui/TextField';
import { NewServiceRequestModal } from './prestadores';
import { useAuth } from '../../lib/auth-context';
import { CATEGORY_LABEL } from '../../lib/categories';
import { uploadPhotos } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { supabaseErrorMessage } from '../../lib/supabaseError';
import { colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import type { Occurrence, OccurrenceSeverity, OccurrenceStatus, Profile } from '../../lib/types';

function AssigneePicker({
  value,
  funcionarios,
  onChange,
  disabled,
}: {
  value: string | null;
  funcionarios: Profile[];
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.categoryRow}>
      <Pressable
        disabled={disabled}
        style={[styles.categoryOption, value === null && styles.categoryOptionActive, disabled && styles.optionDisabled]}
        onPress={() => onChange(null)}
      >
        <Text style={[styles.categoryOptionText, value === null && styles.categoryOptionTextActive]}>
          Ninguém
        </Text>
      </Pressable>
      {funcionarios.map((f) => (
        <Pressable
          key={f.id}
          disabled={disabled}
          style={[styles.categoryOption, value === f.id && styles.categoryOptionActive, disabled && styles.optionDisabled]}
          onPress={() => onChange(f.id)}
        >
          <Text style={[styles.categoryOptionText, value === f.id && styles.categoryOptionTextActive]}>
            {f.full_name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

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

export const STATUS_LABEL: Record<OccurrenceStatus, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const STATUS_COLOR: Record<OccurrenceStatus, string> = {
  aberta: colors.warning,
  em_andamento: colors.primary,
  concluida: colors.success,
  cancelada: colors.textMuted,
};

export default function OrdensScreen() {
  const { session, profile } = useAuth();
  const [ordens, setOrdens] = useState<Occurrence[]>([]);
  const [funcionarios, setFuncionarios] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [quoteRequestFor, setQuoteRequestFor] = useState<Occurrence | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const isSindico = profile?.role === 'sindico';

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('occurrences')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setOrdens(data as Occurrence[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isSindico) return;
    supabase
      .from('profiles')
      .select('*')
      .eq('role', 'funcionario')
      .eq('active', true)
      .then(({ data }) => {
        if (data) setFuncionarios(data as Profile[]);
      });
  }, [isSindico]);

  async function assignTo(id: string, assignedTo: string | null) {
    setBusyId(id);
    const { error } = await supabase.from('occurrences').update({ assigned_to: assignedTo }).eq('id', id);
    setBusyId(null);
    if (error) {
      Alert.alert('Não foi possível atribuir', supabaseErrorMessage(error, 'Tente novamente em instantes.') ?? undefined);
      return;
    }
    load();
  }

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

  async function updateStatus(id: string, status: OccurrenceStatus) {
    setBusyId(id);
    const { error } = await supabase
      .from('occurrences')
      .update({ status, resolved_at: status === 'concluida' ? new Date().toISOString() : null })
      .eq('id', id);
    setBusyId(null);
    if (error) {
      Alert.alert('Não foi possível atualizar', supabaseErrorMessage(error, 'Tente novamente em instantes.') ?? undefined);
      return;
    }
    load();
  }

  return (
    <View style={styles.container}>
      <ScreenActionButton label="Nova ordem de serviço" onPress={() => setFormOpen(true)} />

      <FlatList
        data={ordens}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="checkmark-circle-outline"
              title="Nenhuma ordem de serviço registrada"
              subtitle="Tudo tranquilo por aqui."
            />
          ) : null
        }
        renderItem={({ item }) => {
          const canManage =
            profile?.role === 'sindico' ||
            item.created_by === session?.user.id ||
            item.assigned_to === session?.user.id;
          const assignee = funcionarios.find((f) => f.id === item.assigned_to);
          return (
            <RecordCard
              recordType="occurrence"
              recordId={item.id}
              title={item.title}
              subtitle={new Date(item.created_at).toLocaleString('pt-BR')}
              badge={{
                label: `OS #${item.os_number} • ${STATUS_LABEL[item.status]}`,
                color: STATUS_COLOR[item.status],
              }}
              photoPaths={item.photo_urls}
            >
              <Text style={styles.description}>{item.description}</Text>
              <Text style={styles.meta}>
                {CATEGORY_LABEL[item.category] ?? item.category} • Gravidade {SEVERITY_LABEL[item.severity]}
                {item.estimated_cost != null ? ` • R$ ${item.estimated_cost.toFixed(2)}` : ''}
              </Text>
              {isSindico ? (
                <>
                  <Text style={styles.label}>Atribuir a</Text>
                  <AssigneePicker
                    value={item.assigned_to}
                    funcionarios={funcionarios}
                    onChange={(id) => assignTo(item.id, id)}
                    disabled={busyId === item.id}
                  />
                </>
              ) : item.assigned_to ? (
                <Text style={styles.meta}>
                  Responsável: {item.assigned_to === session?.user.id ? 'você' : assignee?.full_name ?? '—'}
                </Text>
              ) : null}
              <View style={styles.actionsRow}>
                {canManage && item.status === 'aberta' && (
                  <Pressable
                    disabled={busyId === item.id}
                    style={[styles.startButton, busyId === item.id && styles.optionDisabled]}
                    onPress={() => updateStatus(item.id, 'em_andamento')}
                  >
                    <Text style={styles.startButtonText}>Iniciar</Text>
                  </Pressable>
                )}
                {canManage && (item.status === 'aberta' || item.status === 'em_andamento') && (
                  <Pressable
                    disabled={busyId === item.id}
                    style={[styles.resolveButton, busyId === item.id && styles.optionDisabled]}
                    onPress={() => updateStatus(item.id, 'concluida')}
                  >
                    <Text style={styles.resolveButtonText}>Concluir</Text>
                  </Pressable>
                )}
                {canManage && item.status === 'concluida' && (
                  <Pressable
                    disabled={busyId === item.id}
                    style={[styles.reopenButton, busyId === item.id && styles.optionDisabled]}
                    onPress={() => updateStatus(item.id, 'aberta')}
                  >
                    <Text style={styles.reopenButtonText}>Reabrir</Text>
                  </Pressable>
                )}
                <Pressable style={styles.quoteButton} onPress={() => setQuoteRequestFor(item)}>
                  <Ionicons name="briefcase-outline" size={13} color={colors.primary} />
                  <Text style={styles.quoteButtonText}>Solicitar orçamento</Text>
                </Pressable>
              </View>
            </RecordCard>
          );
        }}
      />

      <NewOrdemModal
        visible={formOpen}
        funcionarios={funcionarios}
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

function NewOrdemModal({
  visible,
  funcionarios,
  onClose,
  onCreated,
}: {
  visible: boolean;
  funcionarios: Profile[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { session, profile } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<OccurrenceSeverity>('media');
  const [category, setCategory] = useState('outro');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle('');
    setDescription('');
    setSeverity('media');
    setCategory('outro');
    setEstimatedCost('');
    setAssignedTo(null);
    setPhotos([]);
    setError(null);
  }

  async function submit() {
    if (!session || !profile) return;
    if (!title.trim() || !description.trim()) {
      setError('Preencha título e descrição.');
      return;
    }
    let cost: number | null = null;
    if (estimatedCost.trim()) {
      cost = Number(estimatedCost.replace(',', '.'));
      if (Number.isNaN(cost)) {
        setError('Custo estimado inválido.');
        return;
      }
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
        category,
        estimated_cost: cost,
        assigned_to: profile.role === 'sindico' ? assignedTo : null,
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
    <AppModal visible={visible} onClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Nova ordem de serviço</Text>

        <TextField label="Título" value={title} onChangeText={setTitle} placeholder="Ex: Vazamento na garagem" />
        <TextField
          label="Descrição"
          value={description}
          onChangeText={setDescription}
          placeholder="Descreva o que aconteceu"
          multiline
        />

        <Text style={styles.label}>Categoria</Text>
        <View style={styles.categoryRow}>
          {Object.keys(CATEGORY_LABEL).map((key) => (
            <Pressable
              key={key}
              style={[styles.categoryOption, category === key && styles.categoryOptionActive]}
              onPress={() => setCategory(key)}
            >
              <Text style={[styles.categoryOptionText, category === key && styles.categoryOptionTextActive]}>
                {CATEGORY_LABEL[key]}
              </Text>
            </Pressable>
          ))}
        </View>

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

        <TextField
          label="Custo estimado em R$ (opcional)"
          value={estimatedCost}
          onChangeText={setEstimatedCost}
          placeholder="Ex: 850.00"
          keyboardType="numeric"
        />

        {profile?.role === 'sindico' && (
          <>
            <Text style={styles.label}>Atribuir a (opcional)</Text>
            <AssigneePicker value={assignedTo} funcionarios={funcionarios} onChange={setAssignedTo} />
          </>
        )}

        <Text style={styles.label}>Fotos</Text>
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
  description: { fontFamily: fontFamily.regular, fontSize: fontSize.base, color: colors.textSecondary, marginTop: spacing.sm },
  meta: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  startButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  startButtonText: { fontFamily: fontFamily.semibold, color: colors.primary, fontSize: fontSize.xs },
  resolveButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.successLight,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  resolveButtonText: { fontFamily: fontFamily.semibold, color: '#0A8A64', fontSize: fontSize.xs },
  reopenButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  reopenButtonText: { fontFamily: fontFamily.semibold, color: colors.textSecondary, fontSize: fontSize.xs },
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
  modalContainer: { flexGrow: 1, padding: spacing.xl, paddingTop: 60, backgroundColor: colors.background },
  modalTitle: { fontFamily: fontFamily.extrabold, fontSize: fontSize.xl, marginBottom: spacing.lg, color: colors.textPrimary },
  label: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
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
  optionDisabled: { opacity: 0.5 },
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
