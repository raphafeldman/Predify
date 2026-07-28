import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { supabase } from '../../lib/supabase';
import { colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import type { BillingStatus, Condominio, CondominioUsageStats, Profile } from '../../lib/types';

const isWeb = Platform.OS === 'web';

const BILLING_LABEL: Record<BillingStatus, string> = {
  trialing: 'Em teste',
  active: 'Ativo',
  exempt: 'Isento',
  suspended: 'Suspenso',
};

const BILLING_COLOR: Record<BillingStatus, string> = {
  trialing: colors.warning,
  active: colors.success,
  exempt: colors.primary,
  suspended: colors.danger,
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function AdminPanel() {
  const router = useRouter();
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [usageStats, setUsageStats] = useState<Record<string, CondominioUsageStats>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Condominio | null>(null);
  const [sindicoFor, setSindicoFor] = useState<{ id: string; name: string | null } | null>(null);

  const load = useCallback(async () => {
    const [condosRes, profilesRes, usageRes] = await Promise.all([
      supabase.from('condominios').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('active', true),
      supabase.rpc('condominio_usage_stats'),
    ]);
    if (condosRes.data) setCondominios(condosRes.data as Condominio[]);
    if (profilesRes.data) setProfiles(profilesRes.data as Profile[]);
    if (usageRes.data) {
      const map: Record<string, CondominioUsageStats> = {};
      for (const row of usageRes.data as CondominioUsageStats[]) {
        map[row.condominio_id] = row;
      }
      setUsageStats(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function statsFor(condominioId: string) {
    const members = profiles.filter((p) => p.condominio_id === condominioId);
    const sindico = members.find((p) => p.role === 'sindico');
    return { userCount: members.length, sindicoName: sindico?.full_name ?? '—' };
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Administração da plataforma</Text>
        <Pressable style={styles.newButton} onPress={() => setCreating(true)}>
          <Ionicons name="add" size={16} color={colors.textOnPrimary} />
          <Text style={styles.newButtonText}>Novo condomínio</Text>
        </Pressable>
      </View>

      {isWeb && (
        <View style={[styles.row, styles.tableHeader]}>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 2 }]}>Condomínio</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1.5 }]}>Síndico</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Usuários</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Assentos</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Armazenamento</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Status</Text>
        </View>
      )}

      <FlatList
        data={condominios}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => {
          const { userCount, sindicoName } = statsFor(item.id);
          const usage = usageStats[item.id];
          const storageLabel = usage ? formatBytes(usage.photos_bytes) : '—';
          return isWeb ? (
            <Pressable style={styles.row} onPress={() => setEditing(item)}>
              <Text style={[styles.tableCell, styles.tableCellStrong, { flex: 2 }]}>
                {item.name ?? 'Sem nome'}
              </Text>
              <Text style={[styles.tableCell, { flex: 1.5 }]}>{sindicoName}</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>{userCount}</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>{item.paid_seats}</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>{storageLabel}</Text>
              <View style={{ flex: 1 }}>
                <Badge label={BILLING_LABEL[item.billing_status]} color={BILLING_COLOR[item.billing_status]} />
              </View>
            </Pressable>
          ) : (
            <Pressable style={styles.row} onPress={() => setEditing(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name ?? 'Sem nome'}</Text>
                <Text style={styles.meta}>
                  {sindicoName} • {userCount} usuário{userCount === 1 ? '' : 's'} • {item.paid_seats} assento
                  {item.paid_seats === 1 ? '' : 's'} • {storageLabel}
                </Text>
              </View>
              <Badge label={BILLING_LABEL[item.billing_status]} color={BILLING_COLOR[item.billing_status]} />
            </Pressable>
          );
        }}
      />

      <NewCondominioModal
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(id, name) => {
          setCreating(false);
          setSindicoFor({ id, name });
          load();
        }}
      />

      <EditCondominioModal
        condominio={editing}
        usage={editing ? usageStats[editing.id] : undefined}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
        onCreateSindico={() => {
          if (!editing) return;
          setSindicoFor({ id: editing.id, name: editing.name });
          setEditing(null);
        }}
        onViewData={() => {
          if (!editing) return;
          router.push({ pathname: '/admin-condominio', params: { id: editing.id, name: editing.name ?? '' } });
          setEditing(null);
        }}
      />

      <CreateSindicoModal
        condominioId={sindicoFor?.id ?? null}
        condominioName={sindicoFor?.name ?? null}
        onClose={() => setSindicoFor(null)}
        onCreated={() => {
          setSindicoFor(null);
          load();
        }}
      />
    </View>
  );
}

function NewCondominioModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (id: string, name: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [administradora, setAdministradora] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setCnpj('');
    setAddress('');
    setPhone('');
    setAdministradora('');
    setError(null);
  }

  async function submit() {
    if (!name.trim()) {
      setError('Dê um nome para o condomínio.');
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('condominios')
      .insert({
        name: name.trim(),
        cnpj: cnpj.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
        administradora: administradora.trim() || null,
      })
      .select('id, name')
      .single();
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    const createdName = data.name as string | null;
    reset();
    onCreated(data.id, createdName);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        reset();
        onClose();
      }}
    >
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Novo condomínio</Text>
        <TextField label="Nome" value={name} onChangeText={setName} placeholder="Ex: Edifício Aurora" />
        <TextField label="CNPJ (opcional)" value={cnpj} onChangeText={setCnpj} placeholder="00.000.000/0000-00" />
        <TextField label="Endereço (opcional)" value={address} onChangeText={setAddress} />
        <TextField label="Telefone (opcional)" value={phone} onChangeText={setPhone} />
        <TextField label="Administradora (opcional)" value={administradora} onChangeText={setAdministradora} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.hintSmall}>
          Depois de criar, você já cadastra o síndico desse condomínio na tela seguinte.
        </Text>

        <View style={styles.modalButtonsRow}>
          <Button
            title="Cancelar"
            variant="secondary"
            onPress={() => {
              reset();
              onClose();
            }}
            style={styles.flex1}
          />
          <Button title="Criar" onPress={submit} loading={saving} style={styles.flex1} />
        </View>
      </ModalFormLayout>
    </Modal>
  );
}

function CreateSindicoModal({
  condominioId,
  condominioName,
  onClose,
  onCreated,
}: {
  condominioId: string | null;
  condominioName: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFullName('');
    setEmail('');
    setPassword('');
    setError(null);
  }

  async function submit() {
    if (!condominioId) return;
    if (!fullName.trim() || !email.trim() || !password) {
      setError('Preencha nome, e-mail e senha.');
      return;
    }
    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke('admin-users', {
      body: {
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        role: 'sindico',
        condominio_id: condominioId,
      },
    });
    setSaving(false);
    const responseError = invokeError ? invokeError.message : (data as { error?: string } | null)?.error;
    if (responseError) {
      setError(responseError);
      return;
    }
    reset();
    onCreated();
  }

  return (
    <Modal
      visible={Boolean(condominioId)}
      animationType="slide"
      onRequestClose={() => {
        reset();
        onClose();
      }}
    >
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Criar síndico</Text>
        {condominioName ? <Text style={styles.hint}>Condomínio: {condominioName}</Text> : null}

        <TextField label="Nome" value={fullName} onChangeText={setFullName} placeholder="Nome completo" />
        <TextField
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="pessoa@email.com"
        />
        <TextField
          label="Senha provisória"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="mínimo 8 caracteres"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button
            title="Fechar"
            variant="secondary"
            onPress={() => {
              reset();
              onClose();
            }}
            style={styles.flex1}
          />
          <Button title="Criar" onPress={submit} loading={saving} style={styles.flex1} />
        </View>

        <Text style={styles.hintSmall}>
          Se aparecer erro dizendo que a função não foi encontrada, é porque o deploy da Edge Function ainda não foi
          feito — veja o SETUP.md.
        </Text>
      </ModalFormLayout>
    </Modal>
  );
}

function EditCondominioModal({
  condominio,
  usage,
  onClose,
  onSaved,
  onCreateSindico,
  onViewData,
}: {
  condominio: Condominio | null;
  usage?: CondominioUsageStats;
  onClose: () => void;
  onSaved: () => void;
  onCreateSindico: () => void;
  onViewData: () => void;
}) {
  const [paidSeats, setPaidSeats] = useState('0');
  const [billingStatus, setBillingStatus] = useState<BillingStatus>('trialing');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (condominio) {
      setPaidSeats(String(condominio.paid_seats));
      setBillingStatus(condominio.billing_status);
      setError(null);
    }
  }, [condominio]);

  async function save() {
    if (!condominio) return;
    const seats = Number.parseInt(paidSeats, 10);
    if (Number.isNaN(seats) || seats < 0) {
      setError('Número de assentos inválido.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('condominios')
      .update({ paid_seats: seats, billing_status: billingStatus })
      .eq('id', condominio.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved();
  }

  if (!condominio) return null;

  return (
    <Modal visible={Boolean(condominio)} animationType="slide" onRequestClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>{condominio.name ?? 'Condomínio'}</Text>

        <Button title="Ver dados do condomínio (suporte)" onPress={onViewData} />
        <Button
          title="Criar síndico para este condomínio"
          variant="secondary"
          onPress={onCreateSindico}
          style={styles.secondaryActionSpacing}
        />

        <Text style={styles.label}>Uso do condomínio</Text>
        {usage ? (
          <View style={styles.usageGrid}>
            <UsageStat label="Usuários" value={usage.users_count} />
            <UsageStat label="Ocorrências" value={usage.occurrences_count} />
            <UsageStat label="Tarefas" value={usage.tasks_count} />
            <UsageStat label="Equipamentos" value={usage.maintenance_items_count} />
            <UsageStat label="Manutenções" value={usage.maintenance_records_count} />
            <UsageStat label="Documentos" value={usage.documents_count} />
            <UsageStat label="Itens de rotina feitos" value={usage.checklist_entries_count} />
            <UsageStat label="Prestadores" value={usage.service_requests_count} />
            <UsageStat label="Fotos/arquivos" value={usage.photos_count} />
            <UsageStat label="Armazenamento" value={formatBytes(usage.photos_bytes)} />
          </View>
        ) : (
          <Text style={styles.hintSmall}>Carregando...</Text>
        )}

        <TextField
          label="Assentos pagos (síndico + funcionários)"
          value={paidSeats}
          onChangeText={setPaidSeats}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Status de cobrança</Text>
        <View style={styles.optionsRow}>
          {(['trialing', 'active', 'exempt', 'suspended'] as BillingStatus[]).map((status) => (
            <Pressable
              key={status}
              style={[styles.option, billingStatus === status && styles.optionActive]}
              onPress={() => setBillingStatus(status)}
            >
              <Text style={[styles.optionText, billingStatus === status && styles.optionTextActive]}>
                {BILLING_LABEL[status]}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hintSmall}>
          Ajuste manual enquanto não existe cobrança automática. &quot;Isento&quot; libera assentos ilimitados sem
          cobrar.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Fechar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Salvar" onPress={save} loading={saving} style={styles.flex1} />
        </View>
      </ModalFormLayout>
    </Modal>
  );
}

function UsageStat({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.usageStat}>
      <Text style={styles.usageStatValue}>{value}</Text>
      <Text style={styles.usageStatLabel}>{label}</Text>
    </View>
  );
}

export default function AdminScreen() {
  return <AdminPanel />;
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
  tableHeader: { borderBottomWidth: 2, borderBottomColor: colors.border, paddingVertical: spacing.sm },
  tableHeaderText: { fontFamily: fontFamily.bold, color: colors.textSecondary, fontSize: fontSize.xs, textTransform: 'uppercase' },
  tableCell: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.textSecondary },
  tableCellStrong: { fontFamily: fontFamily.semibold, color: colors.textPrimary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  name: { fontFamily: fontFamily.semibold, fontSize: fontSize.base, color: colors.textPrimary },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  modalContainer: { flexGrow: 1, padding: spacing.xl, paddingTop: 60, backgroundColor: colors.background },
  modalTitle: { fontFamily: fontFamily.extrabold, fontSize: fontSize.xl, marginBottom: spacing.lg, color: colors.textPrimary },
  label: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  hint: { marginTop: spacing.sm, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  secondaryActionSpacing: { marginTop: spacing.sm },
  hintSmall: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  usageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  usageStat: {
    minWidth: 100,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  usageStatValue: { fontFamily: fontFamily.extrabold, fontSize: fontSize.lg, color: colors.textPrimary },
  usageStatLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  optionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { fontFamily: fontFamily.semibold, color: colors.textSecondary, fontSize: fontSize.sm },
  optionTextActive: { color: colors.textOnPrimary },
  error: { fontFamily: fontFamily.medium, color: colors.danger, marginTop: spacing.md, fontSize: fontSize.sm },
  modalButtonsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  flex1: { flex: 1 },
});
