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
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { DashboardSummary } from '../../components/DashboardSummary';
import { PhotoPicker } from '../../components/PhotoPicker';
import { RecordCard } from '../../components/RecordCard';
import { useAuth } from '../../lib/auth-context';
import { uploadPhotos } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
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
  const { profile } = useAuth();

  if (!profile) return null;

  return profile.role === 'sindico' ? <SindicoHome /> : <FuncionarioHome />;
}

// ============================================================
// Funcionário: dashboard do dia + rotina + tarefas
// ============================================================

function FuncionarioHome() {
  const { session } = useAuth();
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [entries, setEntries] = useState<ChecklistEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openOccurrences, setOpenOccurrences] = useState(0);
  const [loading, setLoading] = useState(true);
  const [taskFormOpen, setTaskFormOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    const [templatesRes, entriesRes, tasksRes, occRes] = await Promise.all([
      supabase.from('checklist_templates').select('*').eq('active', true).order('title'),
      supabase.from('checklist_entries').select('*').eq('entry_date', today),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('occurrences').select('id', { count: 'exact', head: true }).eq('status', 'aberta'),
    ]);
    if (templatesRes.data) setTemplates(templatesRes.data as ChecklistTemplate[]);
    if (entriesRes.data) setEntries(entriesRes.data as ChecklistEntry[]);
    if (tasksRes.data) setTasks(tasksRes.data as Task[]);
    setOpenOccurrences(occRes.count ?? 0);
    setLoading(false);
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleChecklist(templateId: string) {
    const current = entries.find((e) => e.template_id === templateId);
    const nextDone = !current?.done;
    await supabase.from('checklist_entries').upsert(
      {
        template_id: templateId,
        entry_date: today,
        done: nextDone,
        done_by: session?.user.id ?? null,
        done_at: nextDone ? new Date().toISOString() : null,
      },
      { onConflict: 'template_id,entry_date' }
    );
    load();
  }

  async function saveChecklistDetails(templateId: string, notes: string, newPhotoUris: string[]) {
    if (!session) return;
    const current = entries.find((e) => e.template_id === templateId);
    const uploadedPaths = newPhotoUris.length
      ? await uploadPhotos(newPhotoUris, 'checklist', session.user.id)
      : [];
    await supabase.from('checklist_entries').upsert(
      {
        template_id: templateId,
        entry_date: today,
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

  const doneCount = entries.filter((e) => e.done).length;
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
                { label: 'Rotina concluída', value: `${doneCount}/${templates.length}`, color: '#1F6FEB' },
                { label: 'Tarefas pendentes', value: String(pendingCount), color: '#F59E0B' },
                { label: 'Ocorrências abertas', value: String(openOccurrences), color: '#DC2626' },
              ]}
            />

            <Text style={styles.sectionTitle}>Rotina de hoje</Text>
            {templates.length === 0 && !loading && (
              <Text style={styles.empty}>
                O síndico ainda não cadastrou itens de rotina.
              </Text>
            )}
            {templates.map((template) => (
              <ChecklistItemRow
                key={template.id}
                template={template}
                entry={entries.find((e) => e.template_id === template.id)}
                onToggle={() => toggleChecklist(template.id)}
                onSaveDetails={(notes, photos) =>
                  saveChecklistDetails(template.id, notes, photos)
                }
              />
            ))}

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Tarefas</Text>
              <Pressable onPress={() => setTaskFormOpen(true)}>
                <Text style={styles.addLink}>+ Nova tarefa</Text>
              </Pressable>
            </View>
            {tasks.length === 0 && !loading && (
              <Text style={styles.empty}>Nenhuma tarefa registrada.</Text>
            )}
            {sortedTasks.map((task) => (
              <RecordCard
                key={task.id}
                recordType="task"
                recordId={task.id}
                title={task.title}
                subtitle={new Date(task.created_at).toLocaleString('pt-BR')}
                badge={{
                  label: task.status === 'concluida' ? 'Concluída' : 'Pendente',
                  color: task.status === 'concluida' ? '#10B981' : '#F59E0B',
                }}
                photoPaths={task.photo_urls}
              >
                {task.assigned_to === session?.user.id && task.scheduled_for === today && (
                  <Text style={styles.scheduledBadge}>📅 Agendada para hoje, pelo síndico</Text>
                )}
                {task.description ? (
                  <Text style={styles.description}>{task.description}</Text>
                ) : null}
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
            {entry?.done ? <Text style={styles.checkboxMark}>✓</Text> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.checklistTitle}>{template.title}</Text>
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
                <AttachmentPreview
                  key={path}
                  path={path}
                  mimeType="image/jpeg"
                  style={styles.existingPhoto}
                />
              ))}
            </View>
          )}
          <TextInput
            style={styles.detailsInput}
            placeholder="Observação (opcional)"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          <PhotoPicker uris={newPhotos} onChange={setNewPhotos} />
          <Pressable style={styles.saveDetailsButton} onPress={save} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveDetailsButtonText}>Salvar observação</Text>
            )}
          </Pressable>
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
  const { session } = useAuth();
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
    if (!session) return;
    if (!title.trim()) {
      setError('Dê um título para a tarefa.');
      return;
    }
    if (scheduledFor && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
      setError('Data deve estar no formato AAAA-MM-DD.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const photoPaths = photos.length ? await uploadPhotos(photos, 'tasks', session.user.id) : [];
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
      <View style={styles.modalContainer}>
        <Text style={styles.modalTitle}>
          {funcionarios ? 'Agendar tarefa' : 'Nova tarefa'}
        </Text>

        <Text style={styles.label}>Título</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Ex: Limpeza do salão de festas"
        />

        <Text style={styles.label}>Descrição (opcional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
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
                  style={[
                    styles.categoryOption,
                    assignedTo === f.id && styles.categoryOptionActive,
                  ]}
                  onPress={() => setAssignedTo(assignedTo === f.id ? null : f.id)}
                >
                  <Text
                    style={[
                      styles.categoryOptionText,
                      assignedTo === f.id && styles.categoryOptionTextActive,
                    ]}
                  >
                    {f.full_name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Data agendada (opcional, AAAA-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={scheduledFor}
              onChangeText={setScheduledFor}
              placeholder="2026-08-01"
            />
          </>
        )}

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
          color: o.status === 'aberta' ? '#DC2626' : '#6B7280',
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
          color: t.status === 'concluida' ? '#10B981' : '#F59E0B',
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
        badge={{ label: m.status, color: '#1F6FEB' }}
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
      <View style={{ marginTop: 8 }}>
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
  container: { flex: 1, backgroundColor: '#fff' },
  listContent: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 10 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 10,
  },
  addLink: { color: '#1F6FEB', fontWeight: '600', fontSize: 13 },
  empty: { color: '#9CA3AF', marginBottom: 8 },
  checklistItem: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  checklistTouchArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#10B981', borderColor: '#10B981' },
  checkboxMark: { color: '#fff', fontWeight: '700', fontSize: 14 },
  checklistTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  checklistDescription: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  detailsToggle: { paddingHorizontal: 8, paddingVertical: 4 },
  detailsToggleText: { fontSize: 12, color: '#1F6FEB', fontWeight: '600' },
  checklistDetails: { paddingBottom: 14, gap: 10 },
  existingPhotosRow: { flexDirection: 'row', gap: 6 },
  existingPhoto: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#F3F4F6' },
  detailsInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  saveDetailsButton: {
    backgroundColor: '#1F6FEB',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
  },
  saveDetailsButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  description: { fontSize: 14, color: '#374151', marginTop: 8 },
  scheduledBadge: { fontSize: 12, color: '#1F6FEB', fontWeight: '600', marginTop: 8 },
  feedAttachment: { width: 80, height: 80, borderRadius: 8, backgroundColor: '#F3F4F6' },
  toggleTaskButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  toggleTaskButtonText: { color: '#1F6FEB', fontWeight: '600', fontSize: 12 },
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
