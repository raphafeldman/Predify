import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '../../components/AppModal';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { DateInput } from '../../components/DateInput';
import { FilePicker, type PickedFile } from '../../components/FilePicker';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { PhotoPicker } from '../../components/PhotoPicker';
import { RecordCard } from '../../components/RecordCard';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../lib/auth-context';
import { getMaintenanceUrgency, URGENCY_COLOR, URGENCY_LABEL } from '../../lib/frequency';
import { uploadFile, uploadPhotos } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { supabaseErrorMessage } from '../../lib/supabaseError';
import { cardShadow, colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import { useIsWideScreen } from '../../lib/useIsWideScreen';
import {
  PLAN_FREQUENCIES_CALENDARIO,
  PLAN_FREQUENCY_LABEL,
  WO_STATUS_COLOR,
  WO_STATUS_LABEL,
} from '../../lib/workOrderStatus';
import type {
  Asset,
  Fornecedor,
  MaintenanceFrequencyType,
  MaintenancePlan,
  Profile,
  WorkOrder,
  WorkOrderEvidence,
} from '../../lib/types';

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
}

// O ativo em si não vence — quem vence é o plano. A urgência do
// equipamento na lista é a do plano mais próximo de vencer.
function proximoVencimento(planos: MaintenancePlan[]): string | null {
  const datas = planos
    .filter((p) => p.active && !p.deleted_at && p.next_due_at)
    .map((p) => p.next_due_at as string)
    .sort();
  return datas[0] ?? null;
}

export default function EquipamentosScreen() {
  const { profile } = useAuth();
  const isWeb = useIsWideScreen();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [planos, setPlanos] = useState<MaintenancePlan[]>([]);
  const [funcionarios, setFuncionarios] = useState<Profile[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [cortado, setCortado] = useState<boolean | null>(null);
  const [cortando, setCortando] = useState(false);
  const isSindico = profile?.role === 'sindico';

  const load = useCallback(async () => {
    const [assetsRes, planosRes, profilesRes, fornecedoresRes] = await Promise.all([
      supabase.from('assets').select('*').order('name'),
      supabase.from('maintenance_plans').select('*').order('next_due_at'),
      supabase.from('profiles').select('*').eq('role', 'funcionario').eq('active', true),
      supabase.from('fornecedores').select('*').eq('active', true).order('name'),
    ]);
    if (assetsRes.data) setAssets(assetsRes.data as Asset[]);
    if (planosRes.data) setPlanos(planosRes.data as MaintenancePlan[]);
    if (profilesRes.data) setFuncionarios(profilesRes.data as Profile[]);
    if (fornecedoresRes.data) setFornecedores(fornecedoresRes.data as Fornecedor[]);
    setLoading(false);
  }, []);

  // Mesma trava da tela de Ordens: antes do corte, o espelho reescreve
  // as tabelas novas a cada sincronização e o que fosse criado aqui
  // desapareceria sem aviso.
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
    load();
  }, [verificarCorte, load]);

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

  function funcionarioName(id: string | null) {
    if (!id) return '—';
    return funcionarios.find((f) => f.id === id)?.full_name ?? '—';
  }

  const planosDo = (assetId: string) => planos.filter((p) => p.asset_id === assetId && !p.deleted_at);

  if (cortado === null) {
    return (
      <View style={styles.carregando}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (cortado === false) {
    return (
      <View style={styles.container}>
        <View style={styles.avisoCorte}>
          <Ionicons name="swap-horizontal-outline" size={28} color={colors.primary} />
          <Text style={styles.modalTitle}>Migrar para o novo modelo de manutenção</Text>
          <Text style={styles.detailLine}>
            Hoje o equipamento e a regra de manutenção são a mesma coisa, e por isso só cabe uma
            frequência por equipamento. A migração separa os dois: o mesmo gerador passa a poder ter
            troca de filtro mensal e revisão anual ao mesmo tempo.
          </Text>
          <Text style={styles.detailLine}>
            Nada é apagado. Cada equipamento atual vira um ativo com um plano equivalente.
          </Text>
          {isSindico ? (
            <Button
              title={cortando ? 'Migrando…' : 'Migrar agora'}
              onPress={cortar}
              loading={cortando}
              style={{ marginTop: spacing.lg }}
            />
          ) : (
            <Text style={styles.detailLine}>Peça ao síndico para fazer a migração.</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Equipamentos</Text>
        {isSindico && (
          <Pressable style={styles.newButton} onPress={() => setFormOpen(true)}>
            <Ionicons name="add" size={16} color={colors.textOnPrimary} />
            <Text style={styles.newButtonText}>Novo equipamento</Text>
          </Pressable>
        )}
      </View>

      {isWeb && assets.length > 0 && (
        <View style={[styles.row, styles.tableHeader]}>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 2 }]}>Nome</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Local</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Planos</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Próxima data</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Responsável</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Status</Text>
        </View>
      )}

      <FlatList
        data={assets}
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
          const meus = planosDo(item.id);
          const proxima = proximoVencimento(meus);
          const urgency = proxima ? getMaintenanceUrgency(proxima) : null;
          const resumoPlanos =
            meus.length === 0 ? 'Sem plano' : meus.length === 1 ? '1 plano' : `${meus.length} planos`;

          if (isWeb) {
            return (
              <Pressable style={styles.row} onPress={() => setSelected(item)}>
                <Text style={[styles.tableCell, styles.tableCellStrong, { flex: 2 }]}>{item.name}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{item.location_text ?? '—'}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{resumoPlanos}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{proxima ? formatDate(proxima) : '—'}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>
                  {funcionarioName(item.responsible_user_id)}
                </Text>
                <View style={{ flex: 1 }}>
                  {urgency ? <Badge label={URGENCY_LABEL[urgency]} color={URGENCY_COLOR[urgency]} /> : null}
                </View>
              </Pressable>
            );
          }
          return (
            <Pressable style={styles.card} onPress={() => setSelected(item)}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                {urgency ? <Badge label={URGENCY_LABEL[urgency]} color={URGENCY_COLOR[urgency]} /> : null}
              </View>
              <Text style={styles.cardMeta}>
                {item.category} • {resumoPlanos}
                {item.location_text ? ` • ${item.location_text}` : ''}
              </Text>
              <Text style={styles.cardMeta}>
                {proxima ? `Próxima data: ${formatDate(proxima)}` : 'Nenhum plano de manutenção'}
              </Text>
            </Pressable>
          );
        }}
      />

      <AssetFormModal
        visible={formOpen}
        funcionarios={funcionarios}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <AssetDetailModal
        asset={selected}
        planos={selected ? planosDo(selected.id) : []}
        funcionarios={funcionarios}
        fornecedores={fornecedores}
        canEdit={isSindico}
        onClose={() => setSelected(null)}
        onSaved={() => {
          load();
        }}
        onClosed={() => setSelected(null)}
      />
    </View>
  );
}

function FrequencyPicker({
  value,
  onChange,
}: {
  value: MaintenanceFrequencyType;
  onChange: (f: MaintenanceFrequencyType) => void;
}) {
  return (
    <View style={styles.optionsRow}>
      {PLAN_FREQUENCIES_CALENDARIO.map((key) => (
        <Pressable
          key={key}
          style={[styles.option, value === key && styles.optionActive]}
          onPress={() => onChange(key)}
        >
          <Text style={[styles.optionText, value === key && styles.optionTextActive]}>
            {PLAN_FREQUENCY_LABEL[key]}
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

// Só a identidade do equipamento. A recorrência saiu daqui e virou
// plano — é o que permite ter mais de uma por ativo.
function AssetFormModal({
  visible,
  funcionarios,
  onClose,
  onSaved,
  asset,
}: {
  visible: boolean;
  funcionarios: Profile[];
  onClose: () => void;
  onSaved: () => void;
  asset?: Asset | null;
}) {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [responsavel, setResponsavel] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(asset?.name ?? '');
      setCategory(asset?.category ?? '');
      setLocation(asset?.location_text ?? '');
      setManufacturer(asset?.manufacturer ?? '');
      setModel(asset?.model ?? '');
      setSerialNumber(asset?.serial_number ?? '');
      setResponsavel(asset?.responsible_user_id ?? null);
      setNotes(asset?.notes ?? '');
      setError(null);
    }
  }, [visible, asset]);

  async function submit() {
    if (!session) return;
    if (!name.trim() || !category.trim()) {
      setError('Preencha nome e categoria.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: name.trim(),
      category: category.trim(),
      location_text: location.trim() || null,
      manufacturer: manufacturer.trim() || null,
      model: model.trim() || null,
      serial_number: serialNumber.trim() || null,
      responsible_user_id: responsavel,
      notes: notes.trim() || null,
    };
    const { error: saveError } = asset
      ? await supabase.from('assets').update(payload).eq('id', asset.id)
      : await supabase.from('assets').insert({ ...payload, created_by: session.user.id });
    setSaving(false);
    if (saveError) {
      setError(supabaseErrorMessage(saveError, 'Não foi possível salvar.') ?? 'Não foi possível salvar.');
      return;
    }
    onSaved();
  }

  return (
    <AppModal visible={visible} onClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>{asset ? 'Editar equipamento' : 'Novo equipamento'}</Text>

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
        <TextField label="Marca (opcional)" value={manufacturer} onChangeText={setManufacturer} />
        <TextField label="Modelo (opcional)" value={model} onChangeText={setModel} />
        <TextField
          label="Número de série / patrimônio (opcional)"
          value={serialNumber}
          onChangeText={setSerialNumber}
        />

        <Text style={styles.label}>Responsável pelo equipamento</Text>
        <AssigneePicker value={responsavel} funcionarios={funcionarios} onChange={setResponsavel} />

        <TextField label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Salvar" onPress={submit} loading={saving} style={styles.flex1} />
        </View>

        {!asset ? (
          <Text style={styles.hint}>
            Depois de salvar, abra o equipamento para adicionar um ou mais planos de manutenção.
          </Text>
        ) : null}
      </ModalFormLayout>
    </AppModal>
  );
}

function PlanFormModal({
  visible,
  assetId,
  plano,
  funcionarios,
  onClose,
  onSaved,
}: {
  visible: boolean;
  assetId: string;
  plano?: MaintenancePlan | null;
  funcionarios: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<MaintenanceFrequencyType>('mensal');
  const [nextDueAt, setNextDueAt] = useState('');
  const [responsavel, setResponsavel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(plano?.name ?? '');
      setFrequency(plano?.frequency_type ?? 'mensal');
      setNextDueAt(plano?.next_due_at ?? '');
      setResponsavel(plano?.responsible_user_id ?? null);
      setError(null);
    }
  }, [visible, plano]);

  async function submit() {
    if (!session) return;
    if (!name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(nextDueAt)) {
      setError('Preencha o nome do plano e a próxima data.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      asset_id: assetId,
      name: name.trim(),
      frequency_type: frequency,
      next_due_at: nextDueAt,
      responsible_user_id: responsavel,
    };
    const { error: saveError } = plano
      ? await supabase.from('maintenance_plans').update(payload).eq('id', plano.id)
      : await supabase.from('maintenance_plans').insert({ ...payload, created_by: session.user.id });
    setSaving(false);
    if (saveError) {
      setError(supabaseErrorMessage(saveError, 'Não foi possível salvar.') ?? 'Não foi possível salvar.');
      return;
    }
    onSaved();
  }

  return (
    <AppModal visible={visible} onClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>{plano ? 'Editar plano' : 'Novo plano de manutenção'}</Text>
        <Text style={styles.hint}>
          Um equipamento pode ter vários planos — por exemplo, troca de filtro mensal e revisão geral
          anual.
        </Text>

        <TextField
          label="O que será feito"
          value={name}
          onChangeText={setName}
          placeholder="Ex: Troca de filtro"
        />

        <Text style={styles.label}>Frequência</Text>
        <FrequencyPicker value={frequency} onChange={setFrequency} />

        <Text style={styles.label}>Próxima data</Text>
        <DateInput value={nextDueAt} onChangeISO={setNextDueAt} />

        <Text style={styles.label}>Responsável</Text>
        <AssigneePicker value={responsavel} funcionarios={funcionarios} onChange={setResponsavel} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Salvar" onPress={submit} loading={saving} style={styles.flex1} />
        </View>
      </ModalFormLayout>
    </AppModal>
  );
}

function AssetDetailModal({
  asset,
  planos,
  funcionarios,
  fornecedores,
  canEdit,
  onClose,
  onSaved,
  onClosed,
}: {
  asset: Asset | null;
  planos: MaintenancePlan[];
  funcionarios: Profile[];
  fornecedores: Fornecedor[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
  onClosed: () => void;
}) {
  const [ordens, setOrdens] = useState<WorkOrder[]>([]);
  const [evidencias, setEvidencias] = useState<WorkOrderEvidence[]>([]);
  const [editing, setEditing] = useState(false);
  const [planoEmEdicao, setPlanoEmEdicao] = useState<MaintenancePlan | null>(null);
  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [logFormOpen, setLogFormOpen] = useState(false);

  const loadHistorico = useCallback(async () => {
    if (!asset) return;
    const { data } = await supabase
      .from('work_orders')
      .select('*')
      .eq('asset_id', asset.id)
      .order('created_at', { ascending: false });
    const lista = (data ?? []) as WorkOrder[];
    setOrdens(lista);
    if (lista.length) {
      const { data: ev } = await supabase
        .from('work_order_evidence')
        .select('*')
        .in(
          'work_order_id',
          lista.map((o) => o.id)
        );
      setEvidencias((ev ?? []) as WorkOrderEvidence[]);
    } else {
      setEvidencias([]);
    }
  }, [asset]);

  useEffect(() => {
    setEditing(false);
    setLogFormOpen(false);
    setPlanFormOpen(false);
    setPlanoEmEdicao(null);
    loadHistorico();
  }, [asset, loadHistorico]);

  if (!asset) return null;

  if (editing) {
    return (
      <AssetFormModal
        visible
        asset={asset}
        funcionarios={funcionarios}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onSaved();
        }}
      />
    );
  }

  if (planFormOpen) {
    return (
      <PlanFormModal
        visible
        assetId={asset.id}
        plano={planoEmEdicao}
        funcionarios={funcionarios}
        onClose={() => {
          setPlanFormOpen(false);
          setPlanoEmEdicao(null);
        }}
        onSaved={() => {
          setPlanFormOpen(false);
          setPlanoEmEdicao(null);
          onSaved();
        }}
      />
    );
  }

  const proxima = proximoVencimento(planos);
  const urgency = proxima ? getMaintenanceUrgency(proxima) : null;

  return (
    <AppModal visible={Boolean(asset)} onClose={onClosed}>
      <ModalFormLayout style={styles.modalContainer}>
        <View style={styles.detailHeaderRow}>
          <Text style={styles.modalTitle}>{asset.name}</Text>
          {urgency ? <Badge label={URGENCY_LABEL[urgency]} color={URGENCY_COLOR[urgency]} /> : null}
        </View>

        <Text style={styles.detailLine}>{asset.category}</Text>
        {asset.location_text ? <Text style={styles.detailLine}>📍 {asset.location_text}</Text> : null}
        {asset.manufacturer || asset.model ? (
          <Text style={styles.detailLine}>{[asset.manufacturer, asset.model].filter(Boolean).join(' ')}</Text>
        ) : null}
        {asset.serial_number ? (
          <Text style={styles.detailLine}>Nº série/patrimônio: {asset.serial_number}</Text>
        ) : null}
        {asset.notes ? <Text style={styles.detailLine}>{asset.notes}</Text> : null}

        <View style={styles.modalButtonsRow}>
          {canEdit && (
            <Button title="Editar" variant="secondary" onPress={() => setEditing(true)} style={styles.flex1} />
          )}
          <Button title="Registrar manutenção" onPress={() => setLogFormOpen(true)} style={styles.flex1} />
        </View>

        <View style={styles.secaoHeader}>
          <Text style={styles.label}>Planos de manutenção</Text>
          {canEdit && (
            <Pressable
              style={styles.linkButton}
              onPress={() => {
                setPlanoEmEdicao(null);
                setPlanFormOpen(true);
              }}
            >
              <Ionicons name="add" size={14} color={colors.primary} />
              <Text style={styles.linkButtonText}>Adicionar</Text>
            </Pressable>
          )}
        </View>

        {planos.length === 0 ? (
          <Text style={styles.empty}>
            Nenhum plano ainda. Sem plano, este equipamento não gera manutenção preventiva.
          </Text>
        ) : (
          planos.map((p) => {
            const u = p.next_due_at ? getMaintenanceUrgency(p.next_due_at) : null;
            return (
              <Pressable
                key={p.id}
                style={styles.planoCard}
                disabled={!canEdit}
                onPress={() => {
                  setPlanoEmEdicao(p);
                  setPlanFormOpen(true);
                }}
              >
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardTitle}>{p.name}</Text>
                  {u ? <Badge label={URGENCY_LABEL[u]} color={URGENCY_COLOR[u]} /> : null}
                </View>
                <Text style={styles.cardMeta}>
                  {PLAN_FREQUENCY_LABEL[p.frequency_type]}
                  {p.next_due_at ? ` • Próxima: ${formatDate(p.next_due_at)}` : ''}
                  {!p.active ? ' • Inativo' : ''}
                </Text>
              </Pressable>
            );
          })
        )}

        <Text style={[styles.label, { marginTop: spacing.xl }]}>Histórico</Text>
        {ordens.length === 0 && <Text style={styles.empty}>Nenhuma manutenção registrada ainda.</Text>}
        {ordens.map((os) => {
          const minhas = evidencias.filter((e) => e.work_order_id === os.id);
          const fotos = minhas.filter((e) => e.kind.startsWith('foto')).map((e) => e.file_url);
          const om = minhas.find((e) => e.kind === 'om_fornecedor');
          const fornecedor = fornecedores.find((f) => f.id === os.supplier_id);
          const partes = [new Date(os.created_at).toLocaleString('pt-BR')];
          if (fornecedor) partes.push(`Fornecedor: ${fornecedor.name}`);
          return (
            <RecordCard
              key={os.id}
              recordType="work_order"
              recordId={os.id}
              title={`OS #${os.number ?? '—'} • ${os.title}`}
              subtitle={partes.join(' • ')}
              badge={{ label: WO_STATUS_LABEL[os.status], color: WO_STATUS_COLOR[os.status] }}
              photoPaths={fotos}
            >
              {os.description ? <Text style={styles.detailLine}>{os.description}</Text> : null}
              {om && (
                <View style={{ marginTop: spacing.sm }}>
                  <AttachmentPreview
                    path={om.file_url}
                    mimeType={om.mime_type ?? 'application/octet-stream'}
                    fileName={om.file_name ?? 'OM'}
                  />
                </View>
              )}
            </RecordCard>
          );
        })}

        <Button title="Fechar" variant="secondary" onPress={onClosed} style={{ marginTop: spacing.md }} />
      </ModalFormLayout>

      <LogMaintenanceModal
        visible={logFormOpen}
        asset={asset}
        planos={planos}
        fornecedores={fornecedores}
        onClose={() => setLogFormOpen(false)}
        onSaved={() => {
          setLogFormOpen(false);
          loadHistorico();
          onSaved();
        }}
      />
    </AppModal>
  );
}

function FornecedorPicker({
  value,
  fornecedores,
  onChange,
}: {
  value: string | null;
  fornecedores: Fornecedor[];
  onChange: (id: string | null) => void;
}) {
  return (
    <View style={styles.optionsRow}>
      <Pressable style={[styles.option, value === null && styles.optionActive]} onPress={() => onChange(null)}>
        <Text style={[styles.optionText, value === null && styles.optionTextActive]}>Nenhum</Text>
      </Pressable>
      {fornecedores.map((f) => (
        <Pressable
          key={f.id}
          style={[styles.option, value === f.id && styles.optionActive]}
          onPress={() => onChange(f.id)}
        >
          <Text style={[styles.optionText, value === f.id && styles.optionTextActive]}>{f.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function LogMaintenanceModal({
  visible,
  asset,
  planos,
  fornecedores,
  onClose,
  onSaved,
}: {
  visible: boolean;
  asset: Asset;
  planos: MaintenancePlan[];
  fornecedores: Fornecedor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { session, profile } = useAuth();
  const [planoId, setPlanoId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [fornecedorId, setFornecedorId] = useState<string | null>(null);
  const [omFile, setOmFile] = useState<PickedFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPlanoId(planos.length === 1 ? planos[0].id : null);
      setDescription('');
      setPhotos([]);
      setFornecedorId(null);
      setOmFile(null);
      setError(null);
    }
  }, [visible, planos]);

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
      const omPath = omFile
        ? await uploadFile(omFile.uri, 'maintenance', session.user.id, profile.condominio_id, omFile.mimeType, omFile.name)
        : null;

      const plano = planos.find((p) => p.id === planoId);

      // Entra como "em execução" e só depois é concluída, em vez de
      // nascer concluída: a máquina de estados do banco só age em
      // UPDATE, e é a conclusão que empurra o vencimento do plano.
      const { data: os, error: insertError } = await supabase
        .from('work_orders')
        .insert({
          origin_type: planoId ? 'preventiva' : 'solicitacao_direta',
          maintenance_plan_id: planoId,
          asset_id: asset.id,
          title: plano ? plano.name : `Manutenção — ${asset.name}`,
          description: description.trim(),
          category: asset.category,
          status: 'em_execucao',
          started_at: new Date().toISOString(),
          requested_by: session.user.id,
          assigned_user_id: session.user.id,
          supplier_id: fornecedorId,
        })
        .select()
        .single();
      if (insertError) throw insertError;

      const evidencias = [
        ...photoPaths.map((url) => ({
          work_order_id: os!.id,
          kind: 'foto_depois',
          file_url: url,
          uploaded_by: session.user.id,
        })),
        ...(omPath
          ? [
              {
                work_order_id: os!.id,
                kind: 'om_fornecedor',
                file_url: omPath,
                file_name: omFile?.name ?? null,
                mime_type: omFile?.mimeType ?? null,
                uploaded_by: session.user.id,
              },
            ]
          : []),
      ];
      if (evidencias.length) {
        const { error: evError } = await supabase.from('work_order_evidence').insert(evidencias);
        if (evError) throw evError;
      }

      // Por último, para que o registro esteja completo quando o
      // vencimento do plano avançar.
      const { error: concluirError } = await supabase
        .from('work_orders')
        .update({ status: 'concluida' })
        .eq('id', os!.id);
      if (concluirError) throw concluirError;

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal visible={visible} onClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Registrar manutenção — {asset.name}</Text>

        {planos.length > 0 && (
          <>
            <Text style={styles.label}>De qual plano</Text>
            <View style={styles.optionsRow}>
              <Pressable
                style={[styles.option, planoId === null && styles.optionActive]}
                onPress={() => setPlanoId(null)}
              >
                <Text style={[styles.optionText, planoId === null && styles.optionTextActive]}>
                  Fora de plano
                </Text>
              </Pressable>
              {planos.map((p) => (
                <Pressable
                  key={p.id}
                  style={[styles.option, planoId === p.id && styles.optionActive]}
                  onPress={() => setPlanoId(p.id)}
                >
                  <Text style={[styles.optionText, planoId === p.id && styles.optionTextActive]}>
                    {p.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <TextField
          label="O que foi feito"
          value={description}
          onChangeText={setDescription}
          placeholder="Descreva o serviço realizado"
          multiline
        />

        {fornecedores.length > 0 && (
          <>
            <Text style={styles.label}>Fornecedor que realizou (opcional)</Text>
            <FornecedorPicker value={fornecedorId} fornecedores={fornecedores} onChange={setFornecedorId} />
          </>
        )}

        <Text style={styles.label}>Fotos (opcional)</Text>
        <PhotoPicker uris={photos} onChange={setPhotos} />

        <Text style={styles.label}>Anexar OM do fornecedor (opcional)</Text>
        <FilePicker file={omFile} onChange={setOmFile} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Salvar" onPress={submit} loading={saving} style={styles.flex1} />
        </View>

        <Text style={styles.hint}>
          {planoId
            ? 'Ao concluir, o próximo vencimento do plano avança um ciclo a partir da data programada — não da data de hoje, para a periodicidade não desalinhar do calendário.'
            : 'Sem plano vinculado, esta manutenção fica registrada no histórico do equipamento mas não altera nenhum vencimento.'}
        </Text>
      </ModalFormLayout>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  carregando: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  avisoCorte: {
    margin: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.xs,
    alignItems: 'flex-start',
    ...cardShadow,
  },
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
  planoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontFamily: fontFamily.semibold, fontSize: fontSize.md, color: colors.textPrimary, flex: 1, marginRight: spacing.sm },
  cardMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  secaoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl },
  linkButton: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkButtonText: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.primary },
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
