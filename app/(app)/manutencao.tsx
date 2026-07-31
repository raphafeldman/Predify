import { useRouter } from 'expo-router';
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
import { useAuth } from '../../lib/auth-context';
import { registrarManutencao } from '../../lib/registrarManutencao';
import { uploadPhotos } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { supabaseErrorMessage } from '../../lib/supabaseError';
import { colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import { WO_STATUS_COLOR, WO_STATUS_LABEL } from '../../lib/workOrderStatus';
import type { Asset, MaintenancePlan, WorkOrder, WorkOrderEvidence } from '../../lib/types';

// Manutenção preventiva nasce de um plano; corretiva não tem plano de
// origem e entra como solicitação direta. É a mesma distinção que o
// modelo antigo fazia com o campo "tipo", agora expressa pela estrutura.
type TipoManutencao = 'preventiva' | 'corretiva';

export default function ManutencaoScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [planos, setPlanos] = useState<MaintenancePlan[]>([]);
  const [ordens, setOrdens] = useState<WorkOrder[]>([]);
  const [evidencias, setEvidencias] = useState<WorkOrderEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordFormOpen, setRecordFormOpen] = useState(false);
  const [cortado, setCortado] = useState<boolean | null>(null);
  const [cortando, setCortando] = useState(false);
  const isSindico = profile?.role === 'sindico';

  const load = useCallback(async () => {
    const [assetsRes, planosRes, ordensRes] = await Promise.all([
      supabase.from('assets').select('*').order('name'),
      supabase.from('maintenance_plans').select('*'),
      supabase
        .from('work_orders')
        .select('*')
        .in('origin_type', ['preventiva', 'solicitacao_direta'])
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    if (assetsRes.data) setAssets(assetsRes.data as Asset[]);
    if (planosRes.data) setPlanos(planosRes.data as MaintenancePlan[]);

    const lista = (ordensRes.data ?? []) as WorkOrder[];
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
    setLoading(false);
  }, []);

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
          <Text style={styles.modalTitle}>Migrar para o novo modelo</Text>
          <Text style={styles.description}>
            As manutenções deste condomínio ainda são geridas pelo modelo antigo. A migração copia
            tudo, preservando o histórico, e passa a tratar cada manutenção como uma ordem de
            serviço — com status, responsável e evidências.
          </Text>
          {isSindico ? (
            <Button
              title={cortando ? 'Migrando…' : 'Migrar agora'}
              onPress={cortar}
              loading={cortando}
              style={{ marginTop: spacing.lg }}
            />
          ) : (
            <Text style={styles.hintSmall}>Peça ao síndico para fazer a migração.</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenActionButton label="Registrar manutenção" onPress={() => setRecordFormOpen(true)} />

      <FlatList
        data={ordens}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Histórico de manutenções</Text>
            <Pressable onPress={() => router.push('/equipamentos')}>
              <Text style={styles.addLink}>Ver equipamentos →</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState icon="construct-outline" title="Nenhuma manutenção registrada ainda" />
          ) : null
        }
        renderItem={({ item }) => {
          const asset = assets.find((a) => a.id === item.asset_id);
          const fotos = evidencias
            .filter((e) => e.work_order_id === item.id && e.kind.startsWith('foto'))
            .map((e) => e.file_url);
          const preventiva = item.origin_type === 'preventiva';
          return (
            <RecordCard
              recordType="work_order"
              recordId={item.id}
              title={asset ? asset.name : item.title}
              subtitle={`OS #${item.number ?? '—'} • ${new Date(item.created_at).toLocaleString('pt-BR')}`}
              badge={{
                label: `${preventiva ? 'Preventiva' : 'Corretiva'} • ${WO_STATUS_LABEL[item.status]}`,
                color: preventiva ? colors.primary : WO_STATUS_COLOR[item.status],
              }}
              photoPaths={fotos}
            >
              <Text style={styles.description}>{item.description}</Text>
            </RecordCard>
          );
        }}
      />

      <NewRecordModal
        visible={recordFormOpen}
        assets={assets}
        planos={planos}
        onClose={() => setRecordFormOpen(false)}
        onCreated={() => {
          setRecordFormOpen(false);
          load();
        }}
      />
    </View>
  );
}

function NewRecordModal({
  visible,
  assets,
  planos,
  onClose,
  onCreated,
}: {
  visible: boolean;
  assets: Asset[];
  planos: MaintenancePlan[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { session, profile } = useAuth();
  const [tipo, setTipo] = useState<TipoManutencao>('corretiva');
  const [assetId, setAssetId] = useState<string | null>(null);
  const [planoId, setPlanoId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTipo('corretiva');
    setAssetId(null);
    setPlanoId(null);
    setDescription('');
    setPhotos([]);
    setError(null);
  }

  useEffect(() => {
    if (visible) reset();
  }, [visible]);

  const planosDoAtivo = assetId ? planos.filter((p) => p.asset_id === assetId && !p.deleted_at) : [];

  async function submit() {
    if (!session || !profile) return;
    if (!description.trim()) {
      setError('Descreva o que foi feito.');
      return;
    }
    if (tipo === 'preventiva' && !planoId) {
      setError('Escolha o equipamento e o plano desta preventiva.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const photoPaths = photos.length
        ? await uploadPhotos(photos, 'maintenance', session.user.id, profile.condominio_id)
        : [];
      const asset = assets.find((a) => a.id === assetId);
      const plano = planosDoAtivo.find((p) => p.id === planoId);

      await registrarManutencao({
        assetId,
        planId: tipo === 'preventiva' ? planoId : null,
        title: plano ? plano.name : asset ? `Manutenção — ${asset.name}` : 'Manutenção corretiva',
        description: description.trim(),
        category: asset?.category ?? 'outro',
        userId: session.user.id,
        photoPaths,
      });

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
        <Text style={styles.modalTitle}>Registrar manutenção</Text>

        <Text style={styles.label}>Tipo</Text>
        <View style={styles.severityRow}>
          {(['preventiva', 'corretiva'] as TipoManutencao[]).map((key) => (
            <Pressable
              key={key}
              style={[styles.severityOption, tipo === key && styles.severityOptionActive]}
              onPress={() => {
                setTipo(key);
                if (key === 'corretiva') setPlanoId(null);
              }}
            >
              <Text style={[styles.severityOptionText, tipo === key && styles.severityOptionTextActive]}>
                {key === 'preventiva' ? 'Preventiva' : 'Corretiva'}
              </Text>
            </Pressable>
          ))}
        </View>

        {assets.length > 0 ? (
          <>
            <Text style={styles.label}>Equipamento {tipo === 'corretiva' ? '(opcional)' : ''}</Text>
            <View style={styles.categoryRow}>
              {tipo === 'corretiva' && (
                <Pressable
                  style={[styles.categoryOption, assetId === null && styles.categoryOptionActive]}
                  onPress={() => {
                    setAssetId(null);
                    setPlanoId(null);
                  }}
                >
                  <Text
                    style={[styles.categoryOptionText, assetId === null && styles.categoryOptionTextActive]}
                  >
                    Nenhum
                  </Text>
                </Pressable>
              )}
              {assets.map((asset) => (
                <Pressable
                  key={asset.id}
                  style={[styles.categoryOption, assetId === asset.id && styles.categoryOptionActive]}
                  onPress={() => {
                    setAssetId(asset.id);
                    setPlanoId(null);
                  }}
                >
                  <Text
                    style={[
                      styles.categoryOptionText,
                      assetId === asset.id && styles.categoryOptionTextActive,
                    ]}
                  >
                    {asset.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.hintSmall}>
            Nenhum equipamento cadastrado ainda — cadastre um em &quot;Equipamentos&quot; primeiro.
          </Text>
        )}

        {tipo === 'preventiva' && assetId ? (
          planosDoAtivo.length > 0 ? (
            <>
              <Text style={styles.label}>Plano</Text>
              <View style={styles.categoryRow}>
                {planosDoAtivo.map((p) => (
                  <Pressable
                    key={p.id}
                    style={[styles.categoryOption, planoId === p.id && styles.categoryOptionActive]}
                    onPress={() => setPlanoId(p.id)}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        planoId === p.id && styles.categoryOptionTextActive,
                      ]}
                    >
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.hintSmall}>
              Este equipamento ainda não tem plano de manutenção. Crie um na tela de Equipamentos, ou
              registre como corretiva.
            </Text>
          )
        ) : null}

        <TextField
          label="O que foi feito"
          value={description}
          onChangeText={setDescription}
          placeholder="Descreva o serviço realizado"
          multiline
        />

        <Text style={styles.label}>Fotos (opcional)</Text>
        <PhotoPicker uris={photos} onChange={setPhotos} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Salvar" onPress={submit} loading={saving} style={styles.flex1} />
        </View>

        {tipo === 'preventiva' && planoId ? (
          <Text style={styles.hintSmall}>
            Ao salvar, o próximo vencimento deste plano avança um ciclo a partir da data programada.
          </Text>
        ) : null}
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
    gap: spacing.sm,
  },
  listContent: { padding: spacing.lg, paddingBottom: 90 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.textPrimary },
  addLink: { fontFamily: fontFamily.semibold, color: colors.primary, fontSize: fontSize.sm },
  hintSmall: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  description: { fontFamily: fontFamily.regular, fontSize: fontSize.base, color: colors.textSecondary, marginTop: spacing.sm },
  modalContainer: { flexGrow: 1, padding: spacing.xl, paddingTop: 60, backgroundColor: colors.background },
  modalTitle: { fontFamily: fontFamily.extrabold, fontSize: fontSize.xl, marginBottom: spacing.lg, color: colors.textPrimary },
  label: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  severityRow: { flexDirection: 'row', gap: spacing.sm },
  severityOption: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  severityOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  severityOptionText: { fontFamily: fontFamily.semibold, color: colors.textSecondary, fontSize: fontSize.sm },
  severityOptionTextActive: { color: colors.textOnPrimary },
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
