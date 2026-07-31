import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
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
import {
  INCIDENT_STATUS_COLOR,
  INCIDENT_STATUS_LABEL,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  WO_STATUS_COLOR,
  WO_STATUS_LABEL,
  podeIrPara,
} from '../../lib/workOrderStatus';
import type {
  Incident,
  OccurrenceSeverity,
  Profile,
  WorkOrder,
  WorkOrderStatus,
} from '../../lib/types';

const SEVERITY_LABEL: Record<OccurrenceSeverity, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

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
        <Text style={[styles.categoryOptionText, value === null && styles.categoryOptionTextActive]}>Ninguém</Text>
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

type Aba = 'ocorrencias' | 'ordens';

export default function OrdensScreen() {
  const { session, profile } = useAuth();
  const [aba, setAba] = useState<Aba>('ordens');
  const [ocorrencias, setOcorrencias] = useState<Incident[]>([]);
  const [ordens, setOrdens] = useState<WorkOrder[]>([]);
  const [funcionarios, setFuncionarios] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [quoteRequestFor, setQuoteRequestFor] = useState<WorkOrder | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Nulo enquanto não sabemos; false = ainda espelhado das telas antigas.
  const [cortado, setCortado] = useState<boolean | null>(null);
  const [cortando, setCortando] = useState(false);
  const isSindico = profile?.role === 'sindico';

  const load = useCallback(async () => {
    const [inc, wo] = await Promise.all([
      supabase.from('incidents').select('*').order('created_at', { ascending: false }),
      supabase.from('work_orders').select('*').order('created_at', { ascending: false }),
    ]);
    if (inc.data) setOcorrencias(inc.data as Incident[]);
    if (wo.data) setOrdens(wo.data as WorkOrder[]);
    setLoading(false);
  }, []);

  // Enquanto o condomínio não for cortado, as telas antigas continuam
  // mandando e o espelho é reescrito a cada sincronização: o que fosse
  // criado aqui seria desfeito sem aviso. Por isso a tela se recusa a
  // escrever antes do corte, em vez de aceitar e perder depois.
  const verificarCorte = useCallback(async () => {
    if (!profile?.condominio_id) return;
    const { data } = await supabase
      .from('condominios')
      .select('dominio_cortado_em')
      .eq('id', profile.condominio_id)
      .maybeSingle();
    setCortado(Boolean(data?.dominio_cortado_em));
  }, [profile?.condominio_id]);

  useEffect(() => {
    verificarCorte();
  }, [verificarCorte]);

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

  useEffect(() => {
    load();
    const channel = supabase
      .channel('dominio-manutencao')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function cortar() {
    setCortando(true);
    const { error } = await supabase.rpc('cortar_dominio_manutencao');
    setCortando(false);
    if (error) {
      Alert.alert('Não foi possível migrar', supabaseErrorMessage(error, 'Tente novamente.') ?? undefined);
      return;
    }
    await verificarCorte();
    load();
  }

  async function moverOrdem(os: WorkOrder, status: WorkOrderStatus) {
    setBusyId(os.id);
    const { error } = await supabase.from('work_orders').update({ status }).eq('id', os.id);
    setBusyId(null);
    if (error) {
      Alert.alert('Não foi possível atualizar', supabaseErrorMessage(error, 'Tente novamente.') ?? undefined);
      return;
    }
    load();
  }

  async function atribuir(id: string, assignedTo: string | null) {
    setBusyId(id);
    const { error } = await supabase.from('work_orders').update({ assigned_user_id: assignedTo }).eq('id', id);
    setBusyId(null);
    if (error) {
      Alert.alert('Não foi possível atribuir', supabaseErrorMessage(error, 'Tente novamente.') ?? undefined);
      return;
    }
    load();
  }

  // O ganho central da fase: a ocorrência é o fato, e dela pode nascer
  // mais de uma ordem — ou nenhuma, se resolver na hora.
  async function abrirOrdem(inc: Incident) {
    if (!session) return;
    setBusyId(inc.id);
    const { error } = await supabase.from('work_orders').insert({
      origin_type: 'incidente',
      incident_id: inc.id,
      title: inc.title,
      description: inc.description,
      category: inc.category,
      priority: inc.severity,
      asset_id: inc.asset_id,
      location_id: inc.location_id,
      requested_by: session.user.id,
    });
    if (!error && inc.status !== 'convertida_em_os') {
      await supabase.from('incidents').update({ status: 'convertida_em_os' }).eq('id', inc.id);
    }
    setBusyId(null);
    if (error) {
      Alert.alert('Não foi possível abrir a ordem', supabaseErrorMessage(error, 'Tente novamente.') ?? undefined);
      return;
    }
    setAba('ordens');
    load();
  }

  async function resolverSemOrdem(inc: Incident) {
    setBusyId(inc.id);
    const { error } = await supabase
      .from('incidents')
      .update({ status: 'resolvida_sem_os' })
      .eq('id', inc.id);
    setBusyId(null);
    if (error) {
      Alert.alert('Não foi possível resolver', supabaseErrorMessage(error, 'Tente novamente.') ?? undefined);
      return;
    }
    load();
  }

  const ordensPorOcorrencia = (incidentId: string) => ordens.filter((o) => o.incident_id === incidentId);

  if (cortado === false) {
    return (
      <View style={styles.container}>
        <View style={styles.avisoCorte}>
          <Ionicons name="swap-horizontal-outline" size={28} color={colors.primary} />
          <Text style={styles.avisoTitulo}>Migrar para o novo modelo de manutenção</Text>
          <Text style={styles.avisoTexto}>
            As ordens deste condomínio ainda são geridas pelo modelo antigo. A migração separa a
            ocorrência (o que foi observado) da ordem de serviço (o trabalho), permitindo que uma
            mesma ocorrência gere mais de uma ordem.
          </Text>
          <Text style={styles.avisoTexto}>
            Nada é apagado: as ordens atuais são copiadas com o mesmo número. Enquanto a migração não
            for feita, esta tela não grava — o que fosse criado aqui seria desfeito na próxima
            sincronização.
          </Text>
          {isSindico ? (
            <Button title={cortando ? 'Migrando…' : 'Migrar agora'} onPress={cortar} disabled={cortando} />
          ) : (
            <Text style={styles.avisoTexto}>Peça ao síndico para fazer a migração.</Text>
          )}
        </View>
      </View>
    );
  }

  if (cortado === null) {
    return (
      <View style={styles.carregando}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.abas}>
        <Pressable
          style={[styles.aba, aba === 'ocorrencias' && styles.abaAtiva]}
          onPress={() => setAba('ocorrencias')}
        >
          <Text style={[styles.abaTexto, aba === 'ocorrencias' && styles.abaTextoAtivo]}>
            Ocorrências ({ocorrencias.length})
          </Text>
        </Pressable>
        <Pressable style={[styles.aba, aba === 'ordens' && styles.abaAtiva]} onPress={() => setAba('ordens')}>
          <Text style={[styles.abaTexto, aba === 'ordens' && styles.abaTextoAtivo]}>
            Ordens ({ordens.length})
          </Text>
        </Pressable>
      </View>

      <ScreenActionButton
        label={aba === 'ocorrencias' ? 'Registrar ocorrência' : 'Nova ordem de serviço'}
        onPress={() => setFormOpen(true)}
      />

      {aba === 'ocorrencias' ? (
        <FlatList
          data={ocorrencias}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={loading}
          onRefresh={load}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="eye-outline"
                title="Nenhuma ocorrência registrada"
                subtitle="Ocorrência é o que foi observado. Dela pode nascer uma ordem de serviço — ou nenhuma."
              />
            ) : null
          }
          renderItem={({ item }) => {
            const geradas = ordensPorOcorrencia(item.id);
            const podeTratar = isSindico || item.reported_by === session?.user.id;
            return (
              <RecordCard
                recordType="incident"
                recordId={item.id}
                title={item.title}
                subtitle={new Date(item.created_at).toLocaleString('pt-BR')}
                badge={{
                  label: `#${item.number ?? '—'} • ${INCIDENT_STATUS_LABEL[item.status]}`,
                  color: INCIDENT_STATUS_COLOR[item.status],
                }}
                photoPaths={item.photo_urls}
              >
                <Text style={styles.description}>{item.description}</Text>
                <Text style={styles.meta}>
                  {CATEGORY_LABEL[item.category] ?? item.category} • Gravidade {SEVERITY_LABEL[item.severity]}
                </Text>

                {geradas.length > 0 ? (
                  <Text style={styles.meta}>
                    {geradas.length === 1 ? 'Gerou a ordem' : 'Gerou as ordens'}{' '}
                    {geradas.map((o) => `#${o.number ?? '—'}`).join(', ')}
                  </Text>
                ) : null}

                {podeTratar ? (
                  <View style={styles.actionsRow}>
                    <Pressable
                      disabled={busyId === item.id}
                      style={[styles.startButton, busyId === item.id && styles.optionDisabled]}
                      onPress={() => abrirOrdem(item)}
                    >
                      <Text style={styles.startButtonText}>
                        {geradas.length ? 'Abrir outra ordem' : 'Abrir ordem de serviço'}
                      </Text>
                    </Pressable>
                    {item.status !== 'resolvida_sem_os' && geradas.length === 0 ? (
                      <Pressable
                        disabled={busyId === item.id}
                        style={[styles.resolveButton, busyId === item.id && styles.optionDisabled]}
                        onPress={() => resolverSemOrdem(item)}
                      >
                        <Text style={styles.resolveButtonText}>Resolver sem OS</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </RecordCard>
            );
          }}
        />
      ) : (
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
                title="Nenhuma ordem de serviço"
                subtitle="Tudo tranquilo por aqui."
              />
            ) : null
          }
          renderItem={({ item }) => {
            const canManage =
              isSindico || item.requested_by === session?.user.id || item.assigned_user_id === session?.user.id;
            const assignee = funcionarios.find((f) => f.id === item.assigned_user_id);
            const ocorrencia = item.incident_id
              ? ocorrencias.find((o) => o.id === item.incident_id)
              : undefined;
            return (
              <RecordCard
                recordType="work_order"
                recordId={item.id}
                title={item.title}
                subtitle={new Date(item.created_at).toLocaleString('pt-BR')}
                badge={{
                  label: `OS #${item.number ?? '—'} • ${WO_STATUS_LABEL[item.status]}`,
                  color: WO_STATUS_COLOR[item.status],
                }}
              >
                {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
                <Text style={styles.meta}>
                  {CATEGORY_LABEL[item.category] ?? item.category} •{' '}
                  <Text style={{ color: PRIORITY_COLOR[item.priority] }}>
                    Prioridade {PRIORITY_LABEL[item.priority]}
                  </Text>
                  {item.estimated_cost != null ? ` • R$ ${Number(item.estimated_cost).toFixed(2)}` : ''}
                </Text>
                {item.origin_type === 'preventiva' ? (
                  <Text style={styles.meta}>Gerada por plano de manutenção</Text>
                ) : ocorrencia ? (
                  <Text style={styles.meta}>Da ocorrência #{ocorrencia.number ?? '—'}: {ocorrencia.title}</Text>
                ) : null}

                {isSindico ? (
                  <>
                    <Text style={styles.label}>Atribuir a</Text>
                    <AssigneePicker
                      value={item.assigned_user_id}
                      funcionarios={funcionarios}
                      onChange={(id) => atribuir(item.id, id)}
                      disabled={busyId === item.id}
                    />
                  </>
                ) : item.assigned_user_id ? (
                  <Text style={styles.meta}>
                    Responsável:{' '}
                    {item.assigned_user_id === session?.user.id ? 'você' : assignee?.full_name ?? '—'}
                  </Text>
                ) : null}

                <View style={styles.actionsRow}>
                  {canManage && podeIrPara(item.status, 'em_execucao') && (
                    <Pressable
                      disabled={busyId === item.id}
                      style={[styles.startButton, busyId === item.id && styles.optionDisabled]}
                      onPress={() => moverOrdem(item, 'em_execucao')}
                    >
                      <Text style={styles.startButtonText}>Iniciar</Text>
                    </Pressable>
                  )}
                  {canManage && podeIrPara(item.status, 'concluida') && (
                    <Pressable
                      disabled={busyId === item.id}
                      style={[styles.resolveButton, busyId === item.id && styles.optionDisabled]}
                      onPress={() => moverOrdem(item, 'concluida')}
                    >
                      <Text style={styles.resolveButtonText}>Concluir</Text>
                    </Pressable>
                  )}
                  {canManage && podeIrPara(item.status, 'encerrada') && (
                    <Pressable
                      disabled={busyId === item.id}
                      style={[styles.resolveButton, busyId === item.id && styles.optionDisabled]}
                      onPress={() => moverOrdem(item, 'encerrada')}
                    >
                      <Text style={styles.resolveButtonText}>Encerrar</Text>
                    </Pressable>
                  )}
                  {canManage && podeIrPara(item.status, 'reaberta') && (
                    <Pressable
                      disabled={busyId === item.id}
                      style={[styles.reopenButton, busyId === item.id && styles.optionDisabled]}
                      onPress={() => moverOrdem(item, 'reaberta')}
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
      )}

      <NovoRegistroModal
        visible={formOpen}
        modo={aba}
        funcionarios={funcionarios}
        onClose={() => setFormOpen(false)}
        onCreated={() => {
          setFormOpen(false);
          load();
        }}
      />

      <NewServiceRequestModal
        visible={Boolean(quoteRequestFor)}
        occurrenceId={quoteRequestFor?.incident_id ?? undefined}
        initialTitle={quoteRequestFor?.title}
        initialNotes={quoteRequestFor?.description}
        onClose={() => setQuoteRequestFor(null)}
        onCreated={() => setQuoteRequestFor(null)}
      />
    </View>
  );
}

function NovoRegistroModal({
  visible,
  modo,
  funcionarios,
  onClose,
  onCreated,
}: {
  visible: boolean;
  modo: Aba;
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
  const ehOcorrencia = modo === 'ocorrencias';

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
    if (!ehOcorrencia && estimatedCost.trim()) {
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
        ? await uploadPhotos(photos, ehOcorrencia ? 'incidents' : 'work_orders', session.user.id, profile.condominio_id)
        : [];

      const { error: insertError } = ehOcorrencia
        ? await supabase.from('incidents').insert({
            title: title.trim(),
            description: description.trim(),
            severity,
            category,
            photo_urls: photoPaths,
            reported_by: session.user.id,
          })
        : await supabase.from('work_orders').insert({
            origin_type: 'solicitacao_direta',
            title: title.trim(),
            description: description.trim(),
            category,
            priority: severity,
            estimated_cost: cost,
            assigned_user_id: profile.role === 'sindico' ? assignedTo : null,
            requested_by: session.user.id,
          });

      if (insertError) {
        setError(supabaseErrorMessage(insertError, 'Não foi possível salvar.') ?? 'Não foi possível salvar.');
        return;
      }
      reset();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      visible={visible}
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitulo}>
          {ehOcorrencia ? 'Registrar ocorrência' : 'Nova ordem de serviço'}
        </Text>
        {ehOcorrencia ? (
          <Text style={styles.ajuda}>
            Registre o que foi observado. A decisão de abrir uma ordem — ou resolver sem ela — vem
            depois.
          </Text>
        ) : null}

        <TextField label="Título" value={title} onChangeText={setTitle} placeholder="Ex.: Infiltração na garagem" />
        <TextField
          label="Descrição"
          value={description}
          onChangeText={setDescription}
          placeholder="O que aconteceu e onde"
          multiline
        />

        <Text style={styles.label}>Categoria</Text>
        <View style={styles.categoryRow}>
          {Object.keys(CATEGORY_LABEL).map((c) => (
            <Pressable
              key={c}
              style={[styles.categoryOption, category === c && styles.categoryOptionActive]}
              onPress={() => setCategory(c)}
            >
              <Text style={[styles.categoryOptionText, category === c && styles.categoryOptionTextActive]}>
                {CATEGORY_LABEL[c] ?? c}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>{ehOcorrencia ? 'Gravidade' : 'Prioridade'}</Text>
        <View style={styles.categoryRow}>
          {(['baixa', 'media', 'alta'] as OccurrenceSeverity[]).map((s) => (
            <Pressable
              key={s}
              style={[styles.categoryOption, severity === s && styles.categoryOptionActive]}
              onPress={() => setSeverity(s)}
            >
              <Text style={[styles.categoryOptionText, severity === s && styles.categoryOptionTextActive]}>
                {SEVERITY_LABEL[s]}
              </Text>
            </Pressable>
          ))}
        </View>

        {!ehOcorrencia ? (
          <>
            <TextField
              label="Custo estimado (opcional)"
              value={estimatedCost}
              onChangeText={setEstimatedCost}
              placeholder="0,00"
              keyboardType="decimal-pad"
            />
            {profile?.role === 'sindico' ? (
              <>
                <Text style={styles.label}>Atribuir a</Text>
                <AssigneePicker value={assignedTo} funcionarios={funcionarios} onChange={setAssignedTo} />
              </>
            ) : null}
          </>
        ) : (
          <PhotoPicker uris={photos} onChange={setPhotos} />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalFooter}>
          <Button title={saving ? 'Salvando…' : 'Salvar'} onPress={submit} disabled={saving} />
        </View>
      </ModalFormLayout>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  carregando: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  listContent: { padding: spacing.md, paddingBottom: spacing['3xl'] * 2, gap: spacing.md },
  abas: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  aba: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  abaAtiva: { backgroundColor: colors.primary },
  abaTexto: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textMuted },
  abaTextoAtivo: { color: colors.surface },
  avisoCorte: {
    margin: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  avisoTitulo: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.textPrimary },
  modalContainer: { gap: spacing.sm },
  modalTitulo: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  modalFooter: { marginTop: spacing.md },
  avisoTexto: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
  ajuda: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  description: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.textPrimary },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  categoryOption: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryOptionText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textPrimary },
  categoryOptionTextActive: { color: colors.surface },
  optionDisabled: { opacity: 0.5 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  startButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  startButtonText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.surface },
  resolveButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.success,
  },
  resolveButtonText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.surface },
  reopenButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reopenButtonText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textPrimary },
  quoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  quoteButtonText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.primary },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.danger, marginTop: spacing.sm },
});
