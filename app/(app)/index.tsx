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
  ChecklistEntry,
  ChecklistTemplate,
  DocumentPhoto,
  MaintenanceRecord,
  Occurrence,
  Task,
} from '../../lib/types';

export default function HomeScreen() {
  const { profile } = useAuth();

  if (!profile) return null;

  return profile.role === 'sindico' ? <SindicoHome /> : <FuncionarioHome />;
}

// ============================================================
// Funcionário: rotina do dia + tarefas avulsas
// ============================================================

function FuncionarioHome() {
  const { session } = useAuth();
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [entries, setEntries] = useState<ChecklistEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskFormOpen, setTaskFormOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    const [templatesRes, entriesRes, tasksRes] = await Promise.all([
      supabase.from('checklist_templates').select('*').eq('active', true).order('title'),
      supabase.from('checklist_entries').select('*').eq('entry_date', today),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    if (templatesRes.data) setTemplates(templatesRes.data as ChecklistTemplate[]);
    if (entriesRes.data) setEntries(entriesRes.data as ChecklistEntry[]);
    if (tasksRes.data) setTasks(tasksRes.data as Task[]);
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
            <Text style={styles.sectionTitle}>Rotina de hoje</Text>
            {templates.length === 0 && !loading && (
              <Text style={styles.empty}>
                O síndico ainda não cadastrou itens de rotina.
              </Text>
            )}
            {templates.map((template) => {
              const entry = entries.find((e) => e.template_id === template.id);
              return (
                <Pressable
                  key={template.id}
                  style={styles.checklistRow}
                  onPress={() => toggleChecklist(template.id)}
                >
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
              );
            })}

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Tarefas</Text>
              <Pressable onPress={() => setTaskFormOpen(true)}>
                <Text style={styles.addLink}>+ Nova tarefa</Text>
              </Pressable>
            </View>
            {tasks.length === 0 && !loading && (
              <Text style={styles.empty}>Nenhuma tarefa registrada.</Text>
            )}
            {tasks.map((task) => (
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

function NewTaskModal({
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
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle('');
    setDescription('');
    setPhotos([]);
    setError(null);
  }

  async function submit() {
    if (!session) return;
    if (!title.trim()) {
      setError('Dê um título para a tarefa.');
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
        <Text style={styles.modalTitle}>Nova tarefa</Text>

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

type FeedItem =
  | { kind: 'occurrence'; id: string; created_at: string; data: Occurrence }
  | { kind: 'task'; id: string; created_at: string; data: Task }
  | { kind: 'maintenance'; id: string; created_at: string; data: MaintenanceRecord }
  | { kind: 'document'; id: string; created_at: string; data: DocumentPhoto };

function SindicoHome() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [occRes, taskRes, maintRes, docRes] = await Promise.all([
      supabase.from('occurrences').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(20),
      supabase
        .from('maintenance_records')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(10),
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
      ...((docRes.data as DocumentPhoto[]) ?? []).map((d) => ({
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
        ListHeaderComponent={<Text style={styles.sectionTitle}>Painel do condomínio</Text>}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>Nenhuma atividade registrada ainda.</Text> : null
        }
        renderItem={({ item }) => <FeedCard item={item} />}
      />
    </View>
  );
}

function FeedCard({ item }: { item: FeedItem }) {
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
      photoPaths={[d.photo_url]}
    />
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
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
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
  description: { fontSize: 14, color: '#374151', marginTop: 8 },
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
