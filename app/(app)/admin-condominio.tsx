import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '../../components/AppModal';
import { DashboardSummary } from '../../components/DashboardSummary';
import { FeedCard, type FeedItem } from './index';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../lib/auth-context';
import { FREQUENCY_LABEL } from '../../lib/frequency';
import { getInvokeErrorMessage, supabase } from '../../lib/supabase';
import { colors, fontFamily, fontSize, spacing } from '../../lib/theme';
import type {
  ChecklistTemplate,
  DocumentItem,
  MaintenanceItem,
  MaintenanceRecord,
  Occurrence,
  Profile,
  ServiceRequest,
  Task,
} from '../../lib/types';

export default function AdminCondominioScreen() {
  const { isPlatformAdmin } = useAuth();
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const condominioId = typeof params.id === 'string' ? params.id : undefined;

  const [loading, setLoading] = useState(true);
  const [equipe, setEquipe] = useState<Profile[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [equipamentos, setEquipamentos] = useState<MaintenanceItem[]>([]);
  const [rotinas, setRotinas] = useState<ChecklistTemplate[]>([]);
  const [prestadores, setPrestadores] = useState<ServiceRequest[]>([]);
  const [openOccurrences, setOpenOccurrences] = useState(0);
  const [deletingUser, setDeletingUser] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    // Segunda barreira além do "return" de renderização mais abaixo: sem
    // isso, as 8 queries deste load() disparavam pra qualquer usuário
    // autenticado que navegasse direto pra /admin-condominio, mesmo não
    // sendo admin da plataforma — a proteção real vem do RLS, mas a tela
    // não deveria nem tentar buscar o que não vai poder mostrar.
    if (!condominioId || !isPlatformAdmin) return;
    setLoading(true);
    const [profilesRes, occRes, taskRes, maintRes, docRes, itemsRes, templatesRes, requestsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('condominio_id', condominioId).order('full_name'),
      supabase
        .from('occurrences')
        .select('*')
        .eq('condominio_id', condominioId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('tasks')
        .select('*')
        .eq('condominio_id', condominioId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('maintenance_records')
        .select('*')
        .eq('condominio_id', condominioId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('documents')
        .select('*')
        .eq('condominio_id', condominioId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase.from('maintenance_items').select('*').eq('condominio_id', condominioId).order('name'),
      supabase.from('checklist_templates').select('*').eq('condominio_id', condominioId).order('title'),
      supabase
        .from('service_requests')
        .select('*')
        .eq('condominio_id', condominioId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (profilesRes.data) setEquipe(profilesRes.data as Profile[]);
    if (itemsRes.data) setEquipamentos(itemsRes.data as MaintenanceItem[]);
    if (templatesRes.data) setRotinas(templatesRes.data as ChecklistTemplate[]);
    if (requestsRes.data) setPrestadores(requestsRes.data as ServiceRequest[]);

    const occurrences = (occRes.data as Occurrence[]) ?? [];
    setOpenOccurrences(occurrences.filter((o) => o.status !== 'concluida' && o.status !== 'cancelada').length);

    const merged: FeedItem[] = [
      ...occurrences.map((d) => ({ kind: 'occurrence' as const, id: d.id, created_at: d.created_at, data: d })),
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

    setFeed(merged.slice(0, 30));
    setLoading(false);
  }, [condominioId, isPlatformAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isPlatformAdmin) {
    return (
      <View style={styles.container}>
        <Text style={styles.restricted}>Acesso restrito ao administrador da plataforma.</Text>
      </View>
    );
  }

  if (!condominioId) {
    return (
      <View style={styles.container}>
        <Text style={styles.restricted}>Condomínio não informado.</Text>
      </View>
    );
  }

  const sindico = equipe.find((p) => p.role === 'sindico');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{params.name || 'Condomínio'}</Text>
      <Text style={styles.subtitle}>
        Visão de suporte — somente leitura, exceto excluir um usuário (ícone de lixeira abaixo).
      </Text>

      <DashboardSummary
        stats={[
          { label: 'Usuários', value: String(equipe.length), color: colors.primary },
          { label: 'Ordens abertas', value: String(openOccurrences), color: colors.danger },
          { label: 'Equipamentos', value: String(equipamentos.length), color: colors.warning },
          { label: 'Prestadores', value: String(prestadores.length), color: colors.success },
        ]}
      />

      <Text style={styles.sectionTitle}>Equipe</Text>
      <Card style={styles.card}>
        {equipe.length === 0 && !loading ? (
          <Text style={styles.empty}>Nenhum usuário cadastrado.</Text>
        ) : (
          equipe.map((p) => (
            <View key={p.id} style={styles.equipeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.equipeName}>{p.full_name}</Text>
                <Text style={styles.equipeMeta}>{p.role === 'sindico' ? 'Síndico' : 'Funcionário'}</Text>
              </View>
              <Badge label={p.active ? 'Ativo' : 'Bloqueado'} color={p.active ? colors.success : colors.danger} />
              <Pressable style={styles.deleteIconButton} onPress={() => setDeletingUser(p)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            </View>
          ))
        )}
      </Card>
      {sindico ? <Text style={styles.hintSmall}>Síndico responsável: {sindico.full_name}</Text> : null}

      <Text style={styles.sectionTitle}>Equipamentos</Text>
      <Card style={styles.card}>
        {equipamentos.length === 0 && !loading ? (
          <Text style={styles.empty}>Nenhum equipamento cadastrado.</Text>
        ) : (
          equipamentos.map((item) => (
            <View key={item.id} style={styles.simpleRow}>
              <Text style={styles.simpleRowTitle}>{item.name}</Text>
              <Text style={styles.simpleRowMeta}>
                {FREQUENCY_LABEL[item.frequency]} • próxima: {new Date(item.next_due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Text style={styles.sectionTitle}>Rotinas</Text>
      <Card style={styles.card}>
        {rotinas.length === 0 && !loading ? (
          <Text style={styles.empty}>Nenhuma rotina cadastrada.</Text>
        ) : (
          rotinas.map((t) => (
            <View key={t.id} style={styles.simpleRow}>
              <Text style={styles.simpleRowTitle}>{t.title}</Text>
              <Text style={styles.simpleRowMeta}>
                {FREQUENCY_LABEL[t.frequency]} • {t.active ? 'ativa' : 'inativa'}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Text style={styles.sectionTitle}>Prestadores / orçamentos</Text>
      <Card style={styles.card}>
        {prestadores.length === 0 && !loading ? (
          <Text style={styles.empty}>Nenhuma solicitação registrada.</Text>
        ) : (
          prestadores.map((req) => (
            <View key={req.id} style={styles.simpleRow}>
              <Text style={styles.simpleRowTitle}>{req.title}</Text>
              <Text style={styles.simpleRowMeta}>
                {req.status} • {new Date(req.created_at).toLocaleDateString('pt-BR')}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Text style={styles.sectionTitle}>Atividade recente</Text>
      {feed.length === 0 && !loading ? (
        <Text style={styles.empty}>Nenhuma atividade registrada ainda.</Text>
      ) : (
        feed.map((item) => <FeedCard key={`${item.kind}-${item.id}`} item={item} />)
      )}

      <DeleteUserModal profile={deletingUser} onClose={() => setDeletingUser(null)} onDeleted={() => { setDeletingUser(null); load(); }} />
    </ScrollView>
  );
}

function DeleteUserModal({
  profile,
  onClose,
  onDeleted,
}: {
  profile: Profile | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmText('');
    setError(null);
  }, [profile]);

  async function handleDelete() {
    if (!profile) return;
    setDeleting(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke('admin-delete-user', {
      body: { user_id: profile.id },
    });
    setDeleting(false);
    const responseError = await getInvokeErrorMessage(invokeError, data);
    if (responseError) {
      setError(responseError);
      return;
    }
    onDeleted();
  }

  if (!profile) return null;

  return (
    <AppModal visible={Boolean(profile)} onClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Excluir usuário</Text>
        <Text style={styles.confirmText}>
          Isso apaga PERMANENTEMENTE a conta de &quot;{profile.full_name}&quot; ({profile.role === 'sindico' ? 'síndico' : 'funcionário'}).
          Ordens, tarefas e documentos que essa pessoa criou continuam existindo, só deixam de mostrar o nome dela.
          Não dá pra desfazer.
        </Text>
        <Text style={styles.hintSmall}>
          Digite o nome completo (&quot;{profile.full_name}&quot;) pra confirmar.
        </Text>
        <TextField value={confirmText} onChangeText={setConfirmText} placeholder={profile.full_name} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.confirmButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button
            title="Excluir permanentemente"
            variant="danger"
            onPress={handleDelete}
            loading={deleting}
            disabled={confirmText !== profile.full_name}
            style={styles.flex1}
          />
        </View>
      </ModalFormLayout>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing['3xl'] },
  restricted: { textAlign: 'center', marginTop: 40, fontFamily: fontFamily.regular, color: colors.textMuted },
  title: { fontFamily: fontFamily.extrabold, fontSize: fontSize.xl, color: colors.textPrimary },
  subtitle: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.lg },
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  card: { gap: spacing.sm },
  empty: { fontFamily: fontFamily.regular, color: colors.textMuted },
  equipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  equipeName: { fontFamily: fontFamily.semibold, fontSize: fontSize.base, color: colors.textPrimary },
  equipeMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  hintSmall: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  simpleRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  simpleRowTitle: { fontFamily: fontFamily.semibold, fontSize: fontSize.base, color: colors.textPrimary },
  simpleRowMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  deleteIconButton: { marginLeft: spacing.sm, padding: spacing.xs },
  modalContainer: { flexGrow: 1, padding: spacing.xl, paddingTop: 60, backgroundColor: colors.background },
  modalTitle: { fontFamily: fontFamily.extrabold, fontSize: fontSize.xl, marginBottom: spacing.lg, color: colors.textPrimary },
  confirmText: { fontFamily: fontFamily.medium, color: colors.textSecondary, fontSize: fontSize.sm, marginBottom: spacing.md },
  error: { fontFamily: fontFamily.medium, color: colors.danger, marginTop: spacing.md, fontSize: fontSize.sm },
  confirmButtonsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  flex1: { flex: 1 },
});
