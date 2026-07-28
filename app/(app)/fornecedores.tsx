import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '../../components/AppModal';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { FilePicker, type PickedFile } from '../../components/FilePicker';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../lib/auth-context';
import { uploadFile } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { cardShadow, colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import { useIsWideScreen } from '../../lib/useIsWideScreen';
import type { Fornecedor, MaintenanceItem } from '../../lib/types';

export default function FornecedoresScreen() {
  const { profile } = useAuth();
  const isWeb = useIsWideScreen();
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<Fornecedor | null>(null);

  const load = useCallback(async () => {
    const [fornecedoresRes, itemsRes] = await Promise.all([
      supabase.from('fornecedores').select('*').order('name'),
      supabase.from('maintenance_items').select('*').order('name'),
    ]);
    if (fornecedoresRes.data) setFornecedores(fornecedoresRes.data as Fornecedor[]);
    if (itemsRes.data) setItems(itemsRes.data as MaintenanceItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function equipmentName(id: string | null) {
    if (!id) return '—';
    return items.find((i) => i.id === id)?.name ?? '—';
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Fornecedores</Text>
        {profile?.role === 'sindico' && (
          <Pressable style={styles.newButton} onPress={() => setFormOpen(true)}>
            <Ionicons name="add" size={16} color={colors.textOnPrimary} />
            <Text style={styles.newButtonText}>Novo fornecedor</Text>
          </Pressable>
        )}
      </View>

      {isWeb && fornecedores.length > 0 && (
        <View style={[styles.row, styles.tableHeader]}>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 2 }]}>Nome</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Serviço</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Equipamento</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Contato</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Status</Text>
        </View>
      )}

      <FlatList
        data={fornecedores}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="briefcase-outline"
              title="Nenhum fornecedor cadastrado ainda"
              subtitle="Cadastre empresas com contrato fixo, como manutenção de gerador ou jardinagem."
            />
          ) : null
        }
        renderItem={({ item: f }) => {
          if (isWeb) {
            return (
              <Pressable style={styles.row} onPress={() => setSelected(f)}>
                <Text style={[styles.tableCell, styles.tableCellStrong, { flex: 2 }]}>{f.name}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{f.service_type}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{equipmentName(f.maintenance_item_id)}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{f.phone ?? f.contact_name ?? '—'}</Text>
                <View style={{ flex: 1 }}>
                  <Badge
                    label={f.active ? 'Ativo' : 'Inativo'}
                    color={f.active ? colors.success : colors.textMuted}
                  />
                </View>
              </Pressable>
            );
          }
          return (
            <Pressable style={styles.card} onPress={() => setSelected(f)}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>{f.name}</Text>
                <Badge label={f.active ? 'Ativo' : 'Inativo'} color={f.active ? colors.success : colors.textMuted} />
              </View>
              <Text style={styles.cardMeta}>{f.service_type}</Text>
              {f.maintenance_item_id ? (
                <Text style={styles.cardMeta}>Equipamento: {equipmentName(f.maintenance_item_id)}</Text>
              ) : null}
            </Pressable>
          );
        }}
      />

      <FornecedorFormModal
        visible={formOpen}
        items={items}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <FornecedorDetailModal
        fornecedor={selected}
        items={items}
        canEdit={profile?.role === 'sindico'}
        onClose={() => setSelected(null)}
        onSaved={() => {
          setSelected(null);
          load();
        }}
      />
    </View>
  );
}

function EquipmentPicker({
  value,
  items,
  onChange,
}: {
  value: string | null;
  items: MaintenanceItem[];
  onChange: (id: string | null) => void;
}) {
  return (
    <View style={styles.optionsRow}>
      <Pressable style={[styles.option, value === null && styles.optionActive]} onPress={() => onChange(null)}>
        <Text style={[styles.optionText, value === null && styles.optionTextActive]}>Nenhum</Text>
      </Pressable>
      {items.map((item) => (
        <Pressable
          key={item.id}
          style={[styles.option, value === item.id && styles.optionActive]}
          onPress={() => onChange(item.id)}
        >
          <Text style={[styles.optionText, value === item.id && styles.optionTextActive]}>{item.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ActivePicker({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.optionsRow}>
      <Pressable style={[styles.option, value && styles.optionActive]} onPress={() => onChange(true)}>
        <Text style={[styles.optionText, value && styles.optionTextActive]}>Ativo</Text>
      </Pressable>
      <Pressable style={[styles.option, !value && styles.optionActive]} onPress={() => onChange(false)}>
        <Text style={[styles.optionText, !value && styles.optionTextActive]}>Inativo</Text>
      </Pressable>
    </View>
  );
}

function FornecedorFormModal({
  visible,
  items,
  onClose,
  onSaved,
  fornecedor,
}: {
  visible: boolean;
  items: MaintenanceItem[];
  onClose: () => void;
  onSaved: () => void;
  fornecedor?: Fornecedor | null;
}) {
  const { session, profile } = useAuth();
  const [name, setName] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [maintenanceItemId, setMaintenanceItemId] = useState<string | null>(null);
  const [contractNotes, setContractNotes] = useState('');
  const [active, setActive] = useState(true);
  const [contractFile, setContractFile] = useState<PickedFile | null>(null);
  const [existingContract, setExistingContract] = useState<{
    url: string;
    name: string | null;
    mimeType: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(fornecedor?.name ?? '');
      setServiceType(fornecedor?.service_type ?? '');
      setContactName(fornecedor?.contact_name ?? '');
      setPhone(fornecedor?.phone ?? '');
      setEmail(fornecedor?.email ?? '');
      setMaintenanceItemId(fornecedor?.maintenance_item_id ?? null);
      setContractNotes(fornecedor?.contract_notes ?? '');
      setActive(fornecedor?.active ?? true);
      setContractFile(null);
      setExistingContract(
        fornecedor?.contract_file_url
          ? {
              url: fornecedor.contract_file_url,
              name: fornecedor.contract_file_name,
              mimeType: fornecedor.contract_file_mime_type,
            }
          : null
      );
      setError(null);
    }
  }, [visible, fornecedor]);

  async function submit() {
    if (!session || !profile) return;
    if (!name.trim() || !serviceType.trim()) {
      setError('Preencha nome e tipo de serviço.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let contractFileUrl = existingContract?.url ?? null;
      let contractFileName = existingContract?.name ?? null;
      let contractFileMimeType = existingContract?.mimeType ?? null;
      if (contractFile) {
        contractFileUrl = await uploadFile(
          contractFile.uri,
          'fornecedores',
          session.user.id,
          profile.condominio_id,
          contractFile.mimeType,
          contractFile.name
        );
        contractFileName = contractFile.name;
        contractFileMimeType = contractFile.mimeType;
      }
      const payload = {
        name: name.trim(),
        service_type: serviceType.trim(),
        contact_name: contactName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        maintenance_item_id: maintenanceItemId,
        contract_notes: contractNotes.trim() || null,
        active,
        contract_file_url: contractFileUrl,
        contract_file_name: contractFileName,
        contract_file_mime_type: contractFileMimeType,
      };
      const { error: saveError } = fornecedor
        ? await supabase.from('fornecedores').update(payload).eq('id', fornecedor.id)
        : await supabase.from('fornecedores').insert({ ...payload, created_by: session.user.id });
      if (saveError) throw saveError;
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
        <Text style={styles.modalTitle}>{fornecedor ? 'Editar fornecedor' : 'Novo fornecedor'}</Text>

        <TextField label="Nome do fornecedor" value={name} onChangeText={setName} placeholder="Ex: Gerarma Manutenção" />
        <TextField
          label="Tipo de serviço"
          value={serviceType}
          onChangeText={setServiceType}
          placeholder="Ex: Manutenção mensal de gerador, Jardinagem..."
        />
        <TextField label="Contato (opcional)" value={contactName} onChangeText={setContactName} />
        <TextField label="Telefone (opcional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <TextField label="E-mail (opcional)" value={email} onChangeText={setEmail} keyboardType="email-address" />

        <Text style={styles.label}>Equipamento vinculado (opcional)</Text>
        <EquipmentPicker value={maintenanceItemId} items={items} onChange={setMaintenanceItemId} />

        <TextField
          label="Observações do contrato (opcional)"
          value={contractNotes}
          onChangeText={setContractNotes}
          multiline
        />

        <Text style={styles.label}>Documento do contrato (opcional)</Text>
        {existingContract && !contractFile && (
          <View style={{ marginBottom: spacing.sm }}>
            <AttachmentPreview
              path={existingContract.url}
              mimeType={existingContract.mimeType ?? 'application/octet-stream'}
              fileName={existingContract.name ?? 'Documento'}
            />
            <Pressable onPress={() => setExistingContract(null)}>
              <Text style={styles.removeLink}>Remover anexo</Text>
            </Pressable>
          </View>
        )}
        <FilePicker file={contractFile} onChange={setContractFile} />

        <Text style={styles.label}>Status</Text>
        <ActivePicker value={active} onChange={setActive} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Salvar" onPress={submit} loading={saving} style={styles.flex1} />
        </View>
      </ModalFormLayout>
    </AppModal>
  );
}

function FornecedorDetailModal({
  fornecedor,
  items,
  canEdit,
  onClose,
  onSaved,
}: {
  fornecedor: Fornecedor | null;
  items: MaintenanceItem[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setEditing(false);
  }, [fornecedor]);

  if (!fornecedor) return null;

  if (editing) {
    return (
      <FornecedorFormModal
        visible
        fornecedor={fornecedor}
        items={items}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onSaved();
        }}
      />
    );
  }

  const equipmentName = items.find((i) => i.id === fornecedor.maintenance_item_id)?.name;

  return (
    <AppModal visible={Boolean(fornecedor)} onClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <View style={styles.detailHeaderRow}>
          <Text style={styles.modalTitle}>{fornecedor.name}</Text>
          <Badge
            label={fornecedor.active ? 'Ativo' : 'Inativo'}
            color={fornecedor.active ? colors.success : colors.textMuted}
          />
        </View>

        <Text style={styles.detailLine}>{fornecedor.service_type}</Text>
        {equipmentName ? <Text style={styles.detailLine}>Equipamento: {equipmentName}</Text> : null}
        {fornecedor.contact_name ? <Text style={styles.detailLine}>Contato: {fornecedor.contact_name}</Text> : null}
        {fornecedor.phone ? <Text style={styles.detailLine}>Telefone: {fornecedor.phone}</Text> : null}
        {fornecedor.email ? <Text style={styles.detailLine}>E-mail: {fornecedor.email}</Text> : null}
        {fornecedor.contract_notes ? <Text style={styles.detailLine}>{fornecedor.contract_notes}</Text> : null}
        {fornecedor.contract_file_url ? (
          <View style={{ marginTop: spacing.sm }}>
            <AttachmentPreview
              path={fornecedor.contract_file_url}
              mimeType={fornecedor.contract_file_mime_type ?? 'application/octet-stream'}
              fileName={fornecedor.contract_file_name ?? 'Documento do contrato'}
            />
          </View>
        ) : null}

        <View style={styles.modalButtonsRow}>
          {canEdit && (
            <Button title="Editar" variant="secondary" onPress={() => setEditing(true)} style={styles.flex1} />
          )}
          <Button title="Fechar" onPress={onClose} style={styles.flex1} />
        </View>
      </ModalFormLayout>
    </AppModal>
  );
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
  removeLink: { fontFamily: fontFamily.semibold, color: colors.danger, fontSize: fontSize.xs, marginTop: spacing.xs },
  modalButtonsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  flex1: { flex: 1 },
});
