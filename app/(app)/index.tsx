import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '../../components/AppModal';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { DateInput } from '../../components/DateInput';
import { HomeHeader } from '../../components/HomeHeader';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { PhotoPicker } from '../../components/PhotoPicker';
import { RecordCard } from '../../components/RecordCard';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { PERIOD_LABEL, VisaoGeralCard, type VisaoGeralPeriod, type VisaoGeralStat } from '../../components/VisaoGeralCard';
import { AdminPanel } from './admin';
import { STATUS_COLOR, STATUS_LABEL } from './ordens';
import { useAuth } from '../../lib/auth-context';
import { CATEGORY_COLOR, CATEGORY_ICON } from '../../lib/categories';
import { FREQUENCY_LABEL } from '../../lib/frequency';
import { uploadPhotos } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { supabaseErrorMessage } from '../../lib/supabaseError';
import { colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import { useRotinaChecklist } from '../../lib/useRotinaChecklist';
import type {
  ChecklistEntry,
  ChecklistTemplate,
  DocumentItem,
  MaintenanceRecord,
  Occurrence,
  Profile,
  Task,
} from '../../lib/types';

function firstName(fullName?: string | null) {
  if (!fullName) return '';
  return fullName.trim().split(' ')[0];
}

function formatRelativeDateTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return `Hoje ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Ontem ${time}`;
  return date.toLocaleDateString('pt-BR');
}

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Início do período selecionado no card "Visão geral" — semana começa na
// segunda-feira (convenção BR).
function periodStartIso(period: VisaoGeralPeriod) {
  const now = new Date();
  if (period === 'hoje') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (period === 'semana') {
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday).toISOString();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export default function HomeScreen() {
  const { profile, isPlatformAdmin } = useAuth();

  if (isPlatformAdmin) return <AdminPanel />;
  if (!profile) return null;

  return profile.role === 'sindico' ? <SindicoHome /> : <FuncionarioHome />;
}

function OrdemActivityRow({ ordem }: { ordem: Occurrence }) {
  const router = useRouter();
  const icon = CATEGORY_ICON[ordem.category] ?? CATEGORY_ICON.outro;
  const iconColor = CATEGORY_COLOR[ordem.category] ?? CATEGORY_COLOR.outro;
  return (
    <Pressable style={styles.activityRow} onPress={() => router.push('/ordens')}>
      <View style={[styles.activityIconWrap, { backgroundColor: `${iconColor}1A` }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.activityTitle} numberOfLines={1}>
          {ordem.title}
        </Text>
        <Text style={styles.activityMeta}>
          OS #{ordem.os_number} · <Text style={{ color: STATUS_COLOR[ordem.status] }}>{STATUS_LABEL[ordem.status]}</Text>
        </Text>
      </View>
      <Text style={styles.activityDate}>{formatRelativeDateTime(ordem.created_at)}</Text>
    </Pressable>
  );
}

// ============================================================
// Funcionário: dashboard do dia + rotina + tarefas
// ============================================================

function FuncionarioHome() {
  const { session, profile } = useAuth();
  const router = useRouter();
  const rotina = useRotinaChecklist();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openOrdersCount, setOpenOrdersCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [condominioName, setCondominioName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskFormOpen, setTaskFormOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    const [tasksRes, occRes, unreadRes, condoRes] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(50),
      supabase
        .from('occurrences')
        .select('id', { count: 'exact', head: true })
        .in('status', ['aberta', 'em_andamento']),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('read', false),
      profile?.condominio_id
        ? supabase.from('condominios').select('name').eq('id', profile.condominio_id).single()
        : Promise.resolve({ data: null }),
    ]);

    if (tasksRes.data) setTasks(tasksRes.data as Task[]);
    setOpenOrdersCount(occRes.count ?? 0);
    setUnreadCount(unreadRes.count ?? 0);
    if (condoRes.data) setCondominioName((condoRes.data as { name: string | null }).name);
    setLoading(false);
  }, [profile?.condominio_id]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleTask(task: Task) {
    const done = task.status === 'concluida';
    const { error } = await supabase
      .from('tasks')
      .update({
        status: done ? 'pendente' : 'concluida',
        completed_at: done ? null : new Date().toISOString(),
      })
      .eq('id', task.id);
    if (error) {
      Alert.alert(
        'Não foi possível atualizar a tarefa',
        supabaseErrorMessage(error, 'Tente novamente em instantes.') ?? undefined
      );
      return;
    }
    load();
  }

  const myTasks = tasks.filter(
    (t) => t.assigned_to === session?.user.id || t.created_by === session?.user.id
  );
  const pendingCount = myTasks.filter((t) => t.status === 'pendente').length;

  const sortedTasks = [...tasks].sort((a, b) => {
    const aPriority = a.assigned_to === session?.user.id && a.scheduled_for === today ? 0 : 1;
    const bPriority = b.assigned_to === session?.user.id && b.scheduled_for === today ? 0 : 1;
    return aPriority - bPriority;
  });

  const stats: VisaoGeralStat[] = [
    {
      icon: 'checkbox-outline',
      iconColor: colors.primary,
      label: 'Rotina concluída',
      value: `${rotina.doneCount}/${rotina.templates.length}`,
      caption: 'Hoje',
      captionColor: colors.primary,
    },
    {
      icon: 'time-outline',
      iconColor: colors.warning,
      label: 'Tarefas pendentes',
      value: String(pendingCount),
      caption: 'Suas tarefas',
      captionColor: colors.warning,
    },
    {
      icon: 'clipboard-outline',
      iconColor: colors.danger,
      label: 'Ordens abertas',
      value: String(openOrdersCount),
      caption: 'No condomínio',
      captionColor: colors.danger,
    },
  ];

  return (
    <View style={styles.container}>
      <FlatList
        data={[]}
        renderItem={() => null}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.listContentFull}
        ListHeaderComponent={
          <>
            <HomeHeader
              name={firstName(profile?.full_name)}
              condominioName={condominioName}
              hasAlerts={unreadCount > 0}
              onPressBell={() => router.push('/mensagens')}
            />
            <View style={styles.bodyContent}>
              <VisaoGeralCard stats={stats} />

              <Text style={styles.sectionTitle}>Rotina de hoje</Text>
              {rotina.templates.length === 0 && !rotina.loading && (
                <Text style={styles.empty}>O síndico ainda não cadastrou itens de rotina.</Text>
              )}
              {rotina.templates.map((template) => (
                <ChecklistItemRow
                  key={template.id}
                  template={template}
                  entry={rotina.entryFor(template)}
                  onToggle={() => rotina.toggleChecklist(template)}
                  onSaveDetails={(notes, photos) => rotina.saveChecklistDetails(template, notes, photos)}
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
            </View>
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
    <AppModal visible={visible} onClose={onClose}>
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
    </AppModal>
  );
}

// ============================================================
// Síndico: painel com Visão geral + Atividades recentes (Ordens de
// Serviço) + Tarefas — layout inspirado no app preview do manual da marca.
// ============================================================

export type FeedItem =
  | { kind: 'occurrence'; id: string; created_at: string; data: Occurrence }
  | { kind: 'task'; id: string; created_at: string; data: Task }
  | { kind: 'maintenance'; id: string; created_at: string; data: MaintenanceRecord }
  | { kind: 'document'; id: string; created_at: string; data: DocumentItem };

function SindicoHome() {
  const { profile } = useAuth();
  const router = useRouter();
  const rotina = useRotinaChecklist();
  const [recentOrdens, setRecentOrdens] = useState<Occurrence[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [funcionarios, setFuncionarios] = useState<Profile[]>([]);
  const [condominioName, setCondominioName] = useState<string | null>(null);
  const [openOrdersCount, setOpenOrdersCount] = useState(0);
  const [concludedThisMonth, setConcludedThisMonth] = useState(0);
  const [maintenanceDueCount, setMaintenanceDueCount] = useState(0);
  const [estimatedCostInPeriod, setEstimatedCostInPeriod] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [period, setPeriod] = useState<VisaoGeralPeriod>('mes');
  const [loading, setLoading] = useState(true);
  const [taskFormOpen, setTaskFormOpen] = useState(false);

  const load = useCallback(async () => {
    const periodStart = periodStartIso(period);
    const in7DaysStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [
      recentRes,
      openCountRes,
      concludedCountRes,
      costRes,
      maintCountRes,
      tasksRes,
      profilesRes,
      unreadRes,
      condoRes,
    ] = await Promise.all([
      supabase.from('occurrences').select('*').order('created_at', { ascending: false }).limit(8),
      supabase
        .from('occurrences')
        .select('id', { count: 'exact', head: true })
        .in('status', ['aberta', 'em_andamento'])
        .gte('created_at', periodStart),
      supabase
        .from('occurrences')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'concluida')
        .gte('resolved_at', periodStart),
      supabase
        .from('occurrences')
        .select('estimated_cost')
        .gte('created_at', periodStart)
        .not('estimated_cost', 'is', null),
      supabase.from('maintenance_items').select('id', { count: 'exact', head: true }).lte('next_due_date', in7DaysStr),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('profiles').select('*').eq('role', 'funcionario').eq('active', true),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('read', false),
      profile?.condominio_id
        ? supabase.from('condominios').select('name').eq('id', profile.condominio_id).single()
        : Promise.resolve({ data: null }),
    ]);

    setRecentOrdens((recentRes.data as Occurrence[]) ?? []);
    setOpenOrdersCount(openCountRes.count ?? 0);
    setConcludedThisMonth(concludedCountRes.count ?? 0);
    const costSum = ((costRes.data as { estimated_cost: number | null }[]) ?? []).reduce(
      (sum, r) => sum + (r.estimated_cost ?? 0),
      0
    );
    setEstimatedCostInPeriod(costSum);
    setMaintenanceDueCount(maintCountRes.count ?? 0);
    if (tasksRes.data) setTasks(tasksRes.data as Task[]);
    if (profilesRes.data) setFuncionarios(profilesRes.data as Profile[]);
    setUnreadCount(unreadRes.count ?? 0);
    if (condoRes.data) setCondominioName((condoRes.data as { name: string | null }).name);
    setLoading(false);
  }, [profile?.condominio_id, period]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('sindico-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const periodLabel = PERIOD_LABEL[period];
  const stats: VisaoGeralStat[] = [
    {
      icon: 'clipboard-outline',
      iconColor: colors.primary,
      label: 'Ordens de serviço',
      value: String(openOrdersCount),
      caption: periodLabel,
      captionColor: colors.primary,
    },
    {
      icon: 'checkmark-circle-outline',
      iconColor: colors.accent,
      label: 'Concluídas',
      value: String(concludedThisMonth),
      caption: periodLabel,
      captionColor: colors.accent,
    },
    {
      icon: 'calendar-outline',
      iconColor: colors.primary,
      label: 'Manutenções previstas',
      value: String(maintenanceDueCount),
      caption: 'Próximos 7 dias',
      captionColor: colors.primary,
    },
    {
      icon: 'cash-outline',
      iconColor: colors.accent,
      label: 'Custo previsto',
      value: formatCurrency(estimatedCostInPeriod),
      caption: periodLabel,
      captionColor: colors.accent,
    },
  ];

  return (
    <View style={styles.container}>
      <FlatList
        data={[]}
        renderItem={() => null}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.listContentFull}
        ListHeaderComponent={
          <>
            <HomeHeader
              name={firstName(profile?.full_name)}
              condominioName={condominioName}
              hasAlerts={unreadCount > 0}
              onPressBell={() => router.push('/mensagens')}
            />
            <View style={styles.bodyContent}>
              <VisaoGeralCard stats={stats} period={period} onPeriodChange={setPeriod} />

              {rotina.templates.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Rotina de hoje</Text>
                  {rotina.templates.map((template) => (
                    <ChecklistItemRow
                      key={template.id}
                      template={template}
                      entry={rotina.entryFor(template)}
                      onToggle={() => rotina.toggleChecklist(template)}
                      onSaveDetails={(notes, photos) => rotina.saveChecklistDetails(template, notes, photos)}
                    />
                  ))}
                </>
              )}

              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Atividades recentes</Text>
                <Pressable onPress={() => router.push('/ordens')}>
                  <Text style={styles.addLink}>Ver todas</Text>
                </Pressable>
              </View>
              {recentOrdens.length === 0 && !loading && (
                <Text style={styles.empty}>Nenhuma ordem de serviço registrada ainda.</Text>
              )}
              {recentOrdens.map((o) => (
                <OrdemActivityRow key={o.id} ordem={o} />
              ))}

              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Tarefas</Text>
                <Pressable onPress={() => setTaskFormOpen(true)}>
                  <Text style={styles.addLink}>+ Agendar tarefa</Text>
                </Pressable>
              </View>
              {tasks.length === 0 && !loading && <Text style={styles.empty}>Nenhuma tarefa registrada.</Text>}
              {tasks.slice(0, 10).map((t) => (
                <RecordCard
                  key={t.id}
                  recordType="task"
                  recordId={t.id}
                  title={t.title}
                  subtitle={new Date(t.created_at).toLocaleString('pt-BR')}
                  badge={{
                    label: t.status === 'concluida' ? 'Concluída' : 'Pendente',
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
              ))}
            </View>
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
        title={o.title}
        subtitle={new Date(o.created_at).toLocaleString('pt-BR')}
        badge={{ label: `OS #${o.os_number} • ${STATUS_LABEL[o.status]}`, color: STATUS_COLOR[o.status] }}
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
  listContentFull: { paddingBottom: spacing['3xl'] },
  bodyContent: { padding: spacing.lg },
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
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  activityIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityTitle: { fontFamily: fontFamily.semibold, fontSize: fontSize.base, color: colors.textPrimary },
  activityMeta: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  activityDate: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
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
