import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { DashboardSummary } from '../../components/DashboardSummary';
import { DateInput } from '../../components/DateInput';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { PhotoPicker } from '../../components/PhotoPicker';
import { RecordCard } from '../../components/RecordCard';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { AdminPanel } from './admin';
import { useAuth } from '../../lib/auth-context';
import { FREQUENCY_LABEL, getPeriodKey } from '../../lib/frequency';
import { uploadPhotos } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import type {
  ChecklistEntry,
  ChecklistTemplate,
  DocumentItem,
  MaintenanceRecord,
  Occurrence,
  Profile,
  Task,
} from '../../lib/types';

export default function HomeScreen() {
  const { profile, isPlatformAdmin } = useAuth();

  if (isPlatformAdmin) return <AdminPanel />;
  if (!profile) return null;

  return profile.role === 'sindico' ? <SindicoHome /> : <FuncionarioHome />;
}

// ============================================================
// Funcionário: dashboard do dia + rotina + tarefas
// ============================================================

function FuncionarioHome() {
  const { session, profile } = useAuth();
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [entries, setEntries] = useState<ChecklistEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openOccurrences, setOpenOccurrences] = useState(0);
  const [loading, setLoading] = useState(true);
  const [taskFormOpen, setTaskFormOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    const [templatesRes, tasksRes, occRes] = await Promise.all([
      supabase.from('checklist_templates').select('*').eq('active', true).order('title'),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('occurrences').select('id', { count: 'exact', head: true }).eq('status', 'aberta'),
    ]);

    const myTemplates = ((templatesRes.data as ChecklistTemplate[]) ?? []).filter(
      (t) => !t.assigned_to || t.assigned_to === session?.user.id
    );
    setTemplates(myTemplates);

    if (myTemplates.length > 0) {
      const { data: entriesData } = await supabase
        .from('checklist_entries')
        .select('*')
        .in(
          'template_id',
          myTemplates.map((t) => t.id)
        );
      setEntries((entriesData as ChecklistEntry[]) ?? []);
    } else {
      setEntries([]);
    }

    if (tasksRes.data) setTasks(tasksRes.data as Task[]);
    setOpenOccurrences(occRes.count ?? 0);
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  function entryFor(template: ChecklistTemplate) {
    const periodKey = getPeriodKey(template.frequency);
    return entries.find((e) => e.template_id === template.id && e.entry_date === periodKey);
  }

  async function toggleChecklist(template: ChecklistTemplate) {
    const periodKey = getPeriodKey(template.frequency);
    const current = entryFor(template);
    const nextDone = !current?.done;
    await supabase.from('checklist_entries').upsert(
      {
        template_id: template.id,
        entry_date: periodKey,
        done: nextDone,
        done_by: session?.user.id ?? null,
        done_at: nextDone ? new Date().toISOString() : null,
      },
      { onConflict: 'template_id,entry_date' }
    );
    load();
  }

  async function saveChecklistDetails(template: ChecklistTemplate, notes: string, newPhotoUris: string[]) {
    if (!session || !profile) return;
    const periodKey = getPeriodKey(template.frequency);
    const current = entryFor(template);
    const uploadedPaths = newPhotoUris.length
      ? await uploadPhotos(newPhotoUris, 'checklist', session.user.id, profile.condominio_id)
      : [];
    await supabase.from('checklist_entries').upsert(
      {
        template_id: template.id,
        entry_date: periodKey,
        notes: notes.trim() || null,
        photo_urls: [...(current?.photo_urls ?? []), ...uploadedPaths],
      },
      { onConflict: 'template_id,entry_date' }
    );
    load();
  }

  async function toggleTask(task: Task) {
    const done = task.status === 'concluida';
    await supabase
      .from('tasks')
      .update({
        status: done ? 'pendente' : 'concluida',
        completed_at: done ? null : new Date().toISOString(),
      })
      .eq('id', task.id);
    load();
  }

  const doneCount = templates.filter((t) => entryFor(t)?.done).length;
  const myTasks = tasks.filter(
    (t) => t.assigned_to === session?.user.id || t.created_by === session?.user.id
  );
  const pendingCount = myTasks.filter((t) => t.status === 'pendente').length;

  const sortedTasks = [...tasks].sort((a, b) => {
    const aPriority = a.assigned_to === session?.user.id && a.scheduled_for === today ? 0 : 1;
    const bPriority = b.assigned_to === session?.user.id && b.scheduled_for === today ? 0 : 1;
    return aPriority - bPriority;
  });

  return (
    <View style={styles.container}>
      <FlatList
        data={[]}
        renderItem={() => null}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <DashboardSummary
              stats={[
                { label: 'Rotina concluída', value: `${doneCount}/${templates.length}`, color: colors.primary },
                { label: 'Tarefas pendentes', value: String(pendingCount), color: colors.warning },
                { label: 'Ocorrências abertas', value: String(openOccurrences), color: colors.danger },
              ]}
            />

            <Text style={styles.sectionTitle}>Rotina de hoje</Text>
            {templates.length === 0 && !loading && (
              <Text style={styles.empty}>O síndico ainda não cadastrou itens de rotina.</Text>
            )}
            {templates.map((template) => (
              <ChecklistItemRow
                key={template.id}
                template={template}
                entry={entryFor(template)}
                onToggle={() => toggleChecklist(template)}
                onSaveDetails={(notes, photos) => saveChecklistDetails(template, notes, photos)}
              />
            ))}

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Tarefas</Text>
              <Pressable onPress={() => setTaskFormOpen(true)}>
                <Text style={styles.addLink}>+ Nova tarefa</Text>
              </Pressable>
            </View>
            {tasks.length === 0 && !loading && <Text style={styles.empty}>Nenhuma tarefa registrada.</Text>}
            {sortedTasks.map((task) => (
              <RecordCard
                key={task.id}
                recordType="task"
                recordId={task.id}
                title={task.title}
                subtitle={new Date(task.created_at).toLocaleString('pt-BR')}
                badge={{
                  label: task.status === 'concluida' ? 'Concluída' : 'Pendente',
                  color: task.status === 'concluida' ? colors.success : colors.warning,
                }}
                photoPaths={task.photo_urls}
              >
                {task.assigned_to === session?.user.id && task.scheduled_for === today && (
                  <Text style={styles.scheduledBadge}>📅 Agendada para hoje, pelo síndico</Text>
                )}
                {task.description ? <Text style={styles.description}>{task.description}</Text> : null}
                <Pressable style={styles.toggleTaskButton} onPress={() => toggleTask(task)}>
                  <Text style={styles.toggleTaskButtonText}>
                    {task.status === 'concluida' ? 'Reabrir' : 'Marcar como concluída'}
                  </Text>
                </Pressable>
              </RecordCard>
            ))}
          </>
        }
      />

      <NewTaskModal
        visible={taskFormOpen}
        onClose={() => setTaskFormOpen(false)}
        onCreated={() => {
          setTaskFormOpen(false);
          load();
        }}
      />
    </View>
  );
}

function ChecklistItemRow({
  template,
  entry,
  onToggle,
  onSaveDetails,
}: {
  template: ChecklistTemplate;
  entry: ChecklistEntry | undefined;
  onToggle: () => void;
  onSaveDetails: (notes: string, newPhotoUris: string[]) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNotes(entry?.notes ?? '');
  }, [entry?.notes]);

  async function save() {
    setSaving(true);
    await onSaveDetails(notes, newPhotos);
    setNewPhotos([]);
    setSaving(false);
    setExpanded(false);
  }

  const hasDetails = Boolean(entry?.notes) || (entry?.photo_urls?.length ?? 0) > 0;

  return (
    <View style={styles.checklistItem}>
      <View style={styles.checklistRow}>
        <Pressable onPress={onToggle} style={styles.checklistTouchArea}>
          <View style={[styles.checkbox, entry?.done && styles.checkboxChecked]}>
            {entry?.done ? <Ionicons name="checkmark" size={15} color={colors.textOnPrimary} /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.checklistTitleRow}>
              <Text style={styles.checklistTitle}>{template.title}</Text>
              <Text style={styles.checklistFrequencyBadge}>{FREQUENCY_LABEL[template.frequency]}</Text>
            </View>
            {template.description ? (
              <Text style={styles.checklistDescription}>{template.description}</Text>
            ) : null}
          </View>
        </Pressable>
        <Pressable onPress={() => setExpanded((v) => !v)} style={styles.detailsToggle}>
          <Text style={styles.detailsToggleText}>
            {hasDetails ? '📝' : expanded ? 'fechar' : 'detalhes'}
          </Text>
        </Pressable>
      </View>

      {expanded && (
        <View style={styles.checklistDetails}>
          {entry?.photo_urls && entry.photo_urls.length > 0 && (
            <View style={styles.existingPhotosRow}>
              {entry.photo_urls.map((path) => (
                <AttachmentPreview key={path} path={path} mimeType="image/jpeg" style={styles.existingPhoto} />
              ))}
            </View>
          )}
          <TextField placeholder="Observação (opcional)" value={notes} onChangeText={setNotes} multiline />
          <PhotoPicker uris={newPhotos} onChange={setNewPhotos} />
          <Button
            title="Salvar observação"
            onPress={save}
            loading={saving}
            style={styles.saveDetailsButton}
          />
        </View>
      )}
    </View>
  );
}

function NewTaskModal({
  visible,
  onClose,
  onCreated,
  funcionarios,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  funcionarios?: Profile[];
}) {
  const { session, profile } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle('');
    setDescription('');
    setPhotos([]);
    setAssignedTo(null);
    setScheduledFor('');
    setError(null);
  }

  async function submit() {
    if (!session || !profile) return;
    if (!title.trim()) {
      setError('Dê um título para a tarefa.');
      return;
    }
    if (scheduledFor && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
      setError('Data inválida.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const photoPaths = photos.length
        ? await uploadPhotos(photos, 'tasks', session.user.id, profile.condominio_id)
        : [];
      const { error: insertError } = await supabase.from('tasks').insert({
        title: title.trim(),
        description: description.trim() || null,
        photo_urls: photoPaths,
        created_by: session.user.id,
        assigned_to: assignedTo,
        scheduled_for: scheduledFor || null,
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
        <Text style={styles.modalTitle}>{funcionarios ? 'Agendar tarefa' : 'Nova tarefa'}</Text>

        <TextField label="Título" value={title} onChangeText={setTitle} placeholder="Ex: Limpeza do salão de festas" />
        <TextField
          label="Descrição (opcional)"
          value={description}
          onChangeText={setDescription}
          placeholder="Detalhes da tarefa"
          multiline
        />

        {funcionarios && (
          <>
            <Text style={styles.label}>Atribuir a (opcional)</Text>
            <View style={styles.categoryRow}>
              {funcionarios.map((f) => (
                <Pressable
                  key={f.id}
                  style={[styles.categoryOption, assignedTo === f.id && styles.categoryOptionActive]}
                  onPress={() => setAssignedTo(assignedTo === f.id ? null : f.id)}
                >
                  <Text style={[styles.categoryOptionText, assignedTo === f.id && styles.categoryOptionTextActive]}>
                    {f.full_name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Data agendada (opcional)</Text>
            <DateInput value={scheduledFor} onChangeISO={setScheduledFor} />
          </>
        )}

        <Text style={styles.label}>Fotos (opcional)</Text>
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

// ============================================================
// Síndico: painel com feed de tudo que acontece no condomínio
// ============================================================

export type FeedItem =
  | { kind: 'occurrence'; id: string; created_at: string; data: Occurrence }
  | { kind: 'task'; id: string; created_at: string; data: Task }
  | { kind: 'maintenance'; id: string; created_at: string; data: MaintenanceRecord }
  | { kind: 'document'; id: string; created_at: string; data: DocumentItem };

function SindicoHome() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [funcionarios, setFuncionarios] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskFormOpen, setTaskFormOpen] = useState(false);

  const load = useCallback(async () => {
    const [occRes, taskRes, maintRes, docRes, profilesRes] = await Promise.all([
      supabase.from('occurrences').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(20),
      supabase
        .from('maintenance_records')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('profiles').select('*').eq('role', 'funcionario').eq('active', true),
    ]);

    if (profilesRes.data) setFuncionarios(profilesRes.data as Profile[]);

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

    setItems(merged.slice(0, 40));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('sindico-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Painel do condomínio</Text>
            <Pressable onPress={() => setTaskFormOpen(true)}>
              <Text style={styles.addLink}>+ Agendar tarefa</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>Nenhuma atividade registrada ainda.</Text> : null
        }
        renderItem={({ item }) => <FeedCard item={item} />}
      />

      <NewTaskModal
        visible={taskFormOpen}
        onClose={() => setTaskFormOpen(false)}
        onCreated={() => {
          setTaskFormOpen(false);
          load();
        }}
        funcionarios={funcionarios}
      />
    </View>
  );
}

export function FeedCard({ item }: { item: FeedItem }) {
  if (item.kind === 'occurrence') {
    const o = item.data;
    return (
      <RecordCard
        recordType="occurrence"
        recordId={o.id}
        title={`⚠️ ${o.title}`}
        subtitle={new Date(o.created_at).toLocaleString('pt-BR')}
        badge={{
          label: o.status === 'aberta' ? 'Ocorrência aberta' : 'Ocorrência resolvida',
          color: o.status === 'aberta' ? colors.danger : colors.textMuted,
        }}
        photoPaths={o.photo_urls}
      >
        <Text style={styles.description}>{o.description}</Text>
      </RecordCard>
    );
  }

  if (item.kind === 'task') {
    const t = item.data;
    return (
      <RecordCard
        recordType="task"
        recordId={t.id}
        title={`📋 ${t.title}`}
        subtitle={new Date(t.created_at).toLocaleString('pt-BR')}
        badge={{
          label: t.status === 'concluida' ? 'Tarefa concluída' : 'Tarefa pendente',
          color: t.status === 'concluida' ? colors.success : colors.warning,
        }}
        photoPaths={t.photo_urls}
      >
        {t.scheduled_for ? (
          <Text style={styles.scheduledBadge}>
            📅 Agendada para {new Date(t.scheduled_for + 'T00:00:00').toLocaleDateString('pt-BR')}
          </Text>
        ) : null}
        {t.description ? <Text style={styles.description}>{t.description}</Text> : null}
      </RecordCard>
    );
  }

  if (item.kind === 'maintenance') {
    const m = item.data;
    return (
      <RecordCard
        recordType="maintenance_record"
        recordId={m.id}
        title={`🔧 Manutenção ${m.type === 'preventiva' ? 'preventiva' : 'corretiva'}`}
        subtitle={new Date(m.created_at).toLocaleString('pt-BR')}
        badge={{ label: m.status, color: colors.primary }}
        photoPaths={m.photo_urls}
      >
        <Text style={styles.description}>{m.description}</Text>
      </RecordCard>
    );
  }

  const d = item.data;
  return (
    <RecordCard
      recordType="document"
      recordId={d.id}
      title={`📄 ${d.title}`}
      subtitle={`${d.category} • ${new Date(d.created_at).toLocaleString('pt-BR')}`}
    >
      <View style={{ marginTop: spacing.sm }}>
        <AttachmentPreview
          path={d.file_url}
          mimeType={d.mime_type}
          fileName={d.file_name}
          style={styles.feedAttachment}
        />
      </View>
    </RecordCard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, paddingBottom: spacing['3xl'] },
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  addLink: { fontFamily: fontFamily.semibold, color: colors.primary, fontSize: fontSize.sm },
  empty: { fontFamily: fontFamily.regular, color: colors.textMuted, marginBottom: spacing.sm },
  checklistItem: { borderBottomWidth: 1, borderBottomColor: colors.border },
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  checklistTouchArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.success, borderColor: colors.success },
  checklistTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checklistTitle: { fontFamily: fontFamily.semibold, fontSize: fontSize.base, color: colors.textPrimary },
  checklistFrequencyBadge: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    textTransform: 'uppercase',
  },
  checklistDescription: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  detailsToggle: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  detailsToggleText: { fontFamily: fontFamily.semibold, fontSize: fontSize.xs, color: colors.primary },
  checklistDetails: { paddingBottom: spacing.lg, gap: spacing.sm },
  existingPhotosRow: { flexDirection: 'row', gap: spacing.sm },
  existingPhoto: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  saveDetailsButton: { alignSelf: 'flex-start', paddingHorizontal: spacing.lg },
  description: { fontFamily: fontFamily.regular, fontSize: fontSize.base, color: colors.textSecondary, marginTop: spacing.sm },
  scheduledBadge: { fontFamily: fontFamily.semibold, fontSize: fontSize.xs, color: colors.primary, marginTop: spacing.sm },
  feedAttachment: { width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  toggleTaskButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  toggleTaskButtonText: { fontFamily: fontFamily.semibold, color: colors.primary, fontSize: fontSize.xs },
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
  error: { fontFamily: fontFamily.medium, color: colors.danger, marginTop: spacing.md, fontSize: fontSize.sm },
  modalButtonsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  flex1: { flex: 1 },
});
