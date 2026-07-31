import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '../../components/AppModal';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { PhotoPicker } from '../../components/PhotoPicker';
import { RecordCard } from '../../components/RecordCard';
import { ScreenActionButton } from '../../components/ScreenActionButton';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../lib/auth-context';
import { uploadPhotos } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { supabaseErrorMessage } from '../../lib/supabaseError';
import { colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import type { Delivery, DeliveryStatus, Profile, Unit } from '../../lib/types';

// Sugestões, não lista fechada: a cada ano aparece uma loja nova, e uma
// lista fixa obrigaria a mexer no código para registrar a realidade.
const LOJAS_SUGERIDAS = [
  'Amazon',
  'Mercado Livre',
  'Magalu',
  'Shopee',
  'Correios',
  'AliExpress',
  'Americanas',
  'iFood',
];

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  recebida: 'Na portaria',
  entregue: 'Entregue',
  devolvida: 'Devolvida',
};

const STATUS_COLOR: Record<DeliveryStatus, string> = {
  recebida: colors.warning,
  entregue: colors.success,
  devolvida: colors.textMuted,
};

const PERIODOS = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: 'Tudo', days: null as number | null },
];

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EncomendasScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [encomendas, setEncomendas] = useState<Delivery[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [equipe, setEquipe] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [entregando, setEntregando] = useState<Delivery | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Filtros da busca.
  const [statusFiltro, setStatusFiltro] = useState<DeliveryStatus | 'pendentes' | 'todas'>('pendentes');
  const [lojaFiltro, setLojaFiltro] = useState<string | null>(null);
  const [periodoDias, setPeriodoDias] = useState<number | null>(30);
  const [buscaUnidade, setBuscaUnidade] = useState('');

  const isSindico = profile?.role === 'sindico';

  const load = useCallback(async () => {
    const [encRes, unitsRes, equipeRes] = await Promise.all([
      supabase.from('deliveries').select('*').order('received_at', { ascending: false }).limit(400),
      supabase.from('units').select('*').order('label'),
      supabase.from('profiles').select('*'),
    ]);
    if (encRes.data) setEncomendas(encRes.data as Delivery[]);
    if (unitsRes.data) setUnits(unitsRes.data as Unit[]);
    if (equipeRes.data) setEquipe(equipeRes.data as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('encomendas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const nomeDe = (id: string | null) =>
    id ? equipe.find((p) => p.id === id)?.full_name ?? 'Usuário removido' : '—';

  const lojasUsadas = useMemo(() => {
    const set = new Set<string>();
    for (const e of encomendas) if (e.store) set.add(e.store);
    return [...set].sort();
  }, [encomendas]);

  const filtradas = useMemo(() => {
    const corte = periodoDias ? Date.now() - periodoDias * 24 * 60 * 60 * 1000 : null;
    const termo = buscaUnidade.trim().toUpperCase();
    return encomendas.filter((e) => {
      if (statusFiltro === 'pendentes' && e.status !== 'recebida') return false;
      if (statusFiltro !== 'pendentes' && statusFiltro !== 'todas' && e.status !== statusFiltro) return false;
      if (lojaFiltro && e.store !== lojaFiltro) return false;
      if (corte && new Date(e.received_at).getTime() < corte) return false;
      if (termo) {
        const label = unitById.get(e.unit_id)?.label.toUpperCase() ?? '';
        if (!label.includes(termo)) return false;
      }
      return true;
    });
  }, [encomendas, statusFiltro, lojaFiltro, periodoDias, buscaUnidade, unitById]);

  const pendentes = encomendas.filter((e) => e.status === 'recebida').length;

  async function devolver(enc: Delivery) {
    const motivo = 'Devolvida ao remetente';
    setBusyId(enc.id);
    const { error } = await supabase
      .from('deliveries')
      .update({ status: 'devolvida', returned_reason: motivo })
      .eq('id', enc.id);
    setBusyId(null);
    if (error) {
      Alert.alert('Não foi possível registrar', supabaseErrorMessage(error, 'Tente novamente.') ?? undefined);
      return;
    }
    load();
  }

  if (!loading && units.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.avisoWrap}>
          <Ionicons name="business-outline" size={28} color={colors.primary} />
          <Text style={styles.avisoTitulo}>Cadastre as unidades primeiro</Text>
          <Text style={styles.avisoTexto}>
            A encomenda é registrada para um apartamento. Sem as unidades cadastradas, a busca por
            apartamento não teria como funcionar.
          </Text>
          {isSindico ? (
            <Button title="Ir para Unidades" onPress={() => router.push('/unidades')} />
          ) : (
            <Text style={styles.avisoTexto}>Peça ao síndico para cadastrar as unidades.</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenActionButton label="Registrar encomenda" onPress={() => setFormOpen(true)} />

      <FlatList
        data={filtradas}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          <View style={styles.filtros}>
            <Text style={styles.resumo}>
              {pendentes === 0
                ? 'Nenhuma encomenda aguardando entrega'
                : `${pendentes} encomenda(s) aguardando entrega`}
            </Text>

            <View style={styles.chipRow}>
              {(['pendentes', 'entregue', 'devolvida', 'todas'] as const).map((s) => (
                <Pressable
                  key={s}
                  style={[styles.chip, statusFiltro === s && styles.chipAtivo]}
                  onPress={() => setStatusFiltro(s)}
                >
                  <Text style={[styles.chipTexto, statusFiltro === s && styles.chipTextoAtivo]}>
                    {s === 'pendentes'
                      ? 'Na portaria'
                      : s === 'todas'
                        ? 'Todas'
                        : STATUS_LABEL[s as DeliveryStatus]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.chipRow}>
              {PERIODOS.map((p) => (
                <Pressable
                  key={p.label}
                  style={[styles.chip, periodoDias === p.days && styles.chipAtivo]}
                  onPress={() => setPeriodoDias(p.days)}
                >
                  <Text style={[styles.chipTexto, periodoDias === p.days && styles.chipTextoAtivo]}>
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {lojasUsadas.length > 0 ? (
              <View style={styles.chipRow}>
                <Pressable
                  style={[styles.chip, lojaFiltro === null && styles.chipAtivo]}
                  onPress={() => setLojaFiltro(null)}
                >
                  <Text style={[styles.chipTexto, lojaFiltro === null && styles.chipTextoAtivo]}>
                    Todas as lojas
                  </Text>
                </Pressable>
                {lojasUsadas.map((loja) => (
                  <Pressable
                    key={loja}
                    style={[styles.chip, lojaFiltro === loja && styles.chipAtivo]}
                    onPress={() => setLojaFiltro(loja)}
                  >
                    <Text style={[styles.chipTexto, lojaFiltro === loja && styles.chipTextoAtivo]}>
                      {loja}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <TextField
              label=""
              value={buscaUnidade}
              onChangeText={setBuscaUnidade}
              placeholder="Filtrar por apartamento (ex.: A-302)"
            />
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState icon="cube-outline" title="Nenhuma encomenda com esses filtros" />
          ) : null
        }
        renderItem={({ item }) => {
          const unidade = unitById.get(item.unit_id);
          const partes = [`Recebida ${formatarDataHora(item.received_at)}`];
          if (item.received_by) partes.push(`por ${nomeDe(item.received_by)}`);
          return (
            <RecordCard
              recordType="delivery"
              recordId={item.id}
              title={`${unidade?.label ?? 'Unidade removida'}${item.store ? ` • ${item.store}` : ''}`}
              subtitle={partes.join(' · ')}
              badge={{ label: STATUS_LABEL[item.status], color: STATUS_COLOR[item.status] }}
              photoPaths={[...item.photo_urls, ...item.delivery_photo_urls]}
            >
              {item.recipient_name ? (
                <Text style={styles.linha}>Para: {item.recipient_name}</Text>
              ) : null}
              {item.tracking_code ? (
                <Text style={styles.linha}>Rastreio: {item.tracking_code}</Text>
              ) : null}
              {item.notes ? <Text style={styles.linha}>{item.notes}</Text> : null}

              {item.status === 'entregue' && item.delivered_at ? (
                <Text style={styles.linhaForte}>
                  Entregue {formatarDataHora(item.delivered_at)} por {nomeDe(item.delivered_by)}
                </Text>
              ) : null}
              {item.status === 'devolvida' && item.returned_reason ? (
                <Text style={styles.linha}>Devolvida: {item.returned_reason}</Text>
              ) : null}

              {item.status === 'recebida' ? (
                <View style={styles.acoes}>
                  <Pressable
                    disabled={busyId === item.id}
                    style={[styles.botaoEntregar, busyId === item.id && styles.desabilitado]}
                    onPress={() => setEntregando(item)}
                  >
                    <Ionicons name="checkmark" size={14} color={colors.textOnPrimary} />
                    <Text style={styles.botaoEntregarTexto}>Entregar</Text>
                  </Pressable>
                  <Pressable
                    disabled={busyId === item.id}
                    style={[styles.botaoSecundario, busyId === item.id && styles.desabilitado]}
                    onPress={() => devolver(item)}
                  >
                    <Text style={styles.botaoSecundarioTexto}>Devolver</Text>
                  </Pressable>
                </View>
              ) : null}
            </RecordCard>
          );
        }}
      />

      <NovaEncomendaModal
        visible={formOpen}
        units={units}
        lojasUsadas={lojasUsadas}
        onClose={() => setFormOpen(false)}
        onCreated={() => {
          setFormOpen(false);
          load();
        }}
      />

      <EntregaModal
        encomenda={entregando}
        unidade={entregando ? unitById.get(entregando.unit_id) ?? null : null}
        onClose={() => setEntregando(null)}
        onDone={() => {
          setEntregando(null);
          load();
        }}
      />
    </View>
  );
}

function UnitPicker({
  value,
  units,
  onChange,
}: {
  value: string | null;
  units: Unit[];
  onChange: (id: string) => void;
}) {
  const [busca, setBusca] = useState('');
  const filtradas = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    const ativas = units.filter((u) => u.active);
    if (!termo) return ativas.slice(0, 40);
    return ativas.filter((u) => u.label.toUpperCase().includes(termo)).slice(0, 40);
  }, [units, busca]);

  return (
    <>
      <TextField label="" value={busca} onChangeText={setBusca} placeholder="Buscar apartamento" />
      <View style={styles.chipRow}>
        {filtradas.map((u) => (
          <Pressable
            key={u.id}
            style={[styles.chip, value === u.id && styles.chipAtivo]}
            onPress={() => onChange(u.id)}
          >
            <Text style={[styles.chipTexto, value === u.id && styles.chipTextoAtivo]}>{u.label}</Text>
          </Pressable>
        ))}
      </View>
      {filtradas.length === 0 ? (
        <Text style={styles.avisoTexto}>Nenhuma unidade encontrada com esse filtro.</Text>
      ) : null}
    </>
  );
}

function NovaEncomendaModal({
  visible,
  units,
  lojasUsadas,
  onClose,
  onCreated,
}: {
  visible: boolean;
  units: Unit[];
  lojasUsadas: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { session, profile } = useAuth();
  const [unitId, setUnitId] = useState<string | null>(null);
  const [store, setStore] = useState('');
  const [recipient, setRecipient] = useState('');
  const [tracking, setTracking] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setUnitId(null);
      setStore('');
      setRecipient('');
      setTracking('');
      setNotes('');
      setPhotos([]);
      setError(null);
    }
  }, [visible]);

  const sugestoes = useMemo(() => {
    const set = new Set([...lojasUsadas, ...LOJAS_SUGERIDAS]);
    return [...set].sort();
  }, [lojasUsadas]);

  async function submit() {
    if (!session || !profile) return;
    if (!unitId) {
      setError('Escolha o apartamento.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const photoPaths = photos.length
        ? await uploadPhotos(photos, 'deliveries', session.user.id, profile.condominio_id)
        : [];
      const { error: insertError } = await supabase.from('deliveries').insert({
        unit_id: unitId,
        store: store.trim() || null,
        recipient_name: recipient.trim() || null,
        tracking_code: tracking.trim() || null,
        notes: notes.trim() || null,
        photo_urls: photoPaths,
        received_by: session.user.id,
      });
      if (insertError) throw insertError;
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
        <Text style={styles.modalTitle}>Registrar encomenda</Text>
        <Text style={styles.hint}>
          A data e a hora do recebimento são registradas automaticamente.
        </Text>

        <Text style={styles.label}>Apartamento</Text>
        <UnitPicker value={unitId} units={units} onChange={setUnitId} />

        <Text style={styles.label}>Loja / remetente</Text>
        <View style={styles.chipRow}>
          {sugestoes.map((l) => (
            <Pressable
              key={l}
              style={[styles.chip, store === l && styles.chipAtivo]}
              onPress={() => setStore(store === l ? '' : l)}
            >
              <Text style={[styles.chipTexto, store === l && styles.chipTextoAtivo]}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <TextField label="" value={store} onChangeText={setStore} placeholder="Ou digite outra" />

        <TextField
          label="Para quem (opcional)"
          value={recipient}
          onChangeText={setRecipient}
          placeholder="Nome do morador"
        />
        <TextField
          label="Código de rastreio (opcional)"
          value={tracking}
          onChangeText={setTracking}
        />
        <TextField label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline />

        <Text style={styles.label}>Foto do volume ou da etiqueta (opcional)</Text>
        <PhotoPicker uris={photos} onChange={setPhotos} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Registrar" onPress={submit} loading={saving} style={styles.flex1} />
        </View>
      </ModalFormLayout>
    </AppModal>
  );
}

function EntregaModal({
  encomenda,
  unidade,
  onClose,
  onDone,
}: {
  encomenda: Delivery | null;
  unidade: Unit | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { session, profile } = useAuth();
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPhotos([]);
    setError(null);
  }, [encomenda]);

  if (!encomenda) return null;

  async function confirmar() {
    if (!session || !profile || !encomenda) return;
    setSaving(true);
    setError(null);
    try {
      const photoPaths = photos.length
        ? await uploadPhotos(photos, 'deliveries', session.user.id, profile.condominio_id)
        : [];
      // Só o status vai: quando e por quem são carimbados pelo banco, e
      // é isso que dá valor de comprovação ao registro.
      const { error: updateError } = await supabase
        .from('deliveries')
        .update({ status: 'entregue', delivery_photo_urls: photoPaths })
        .eq('id', encomenda.id);
      if (updateError) throw updateError;
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar a entrega.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal visible={Boolean(encomenda)} onClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Confirmar entrega</Text>
        <Text style={styles.hint}>
          {unidade?.label ?? 'Unidade'}
          {encomenda.store ? ` • ${encomenda.store}` : ''}
          {encomenda.recipient_name ? ` • para ${encomenda.recipient_name}` : ''}
        </Text>

        <Text style={styles.label}>Comprovante da entrega (opcional)</Text>
        <PhotoPicker uris={photos} onChange={setPhotos} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Confirmar entrega" onPress={confirmar} loading={saving} style={styles.flex1} />
        </View>
      </ModalFormLayout>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, paddingBottom: 90, gap: spacing.md },
  filtros: { gap: spacing.sm, marginBottom: spacing.md },
  resumo: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.textPrimary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  chipAtivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTexto: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.textSecondary },
  chipTextoAtivo: { color: colors.textOnPrimary },
  linha: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  linhaForte: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.success, marginTop: spacing.xs },
  acoes: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  botaoEntregar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  botaoEntregarTexto: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.textOnPrimary },
  botaoSecundario: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  botaoSecundarioTexto: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.textSecondary },
  desabilitado: { opacity: 0.5 },
  avisoWrap: { margin: spacing.lg, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.sm, alignItems: 'flex-start' },
  avisoTitulo: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.textPrimary },
  avisoTexto: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
  modalContainer: { flexGrow: 1, padding: spacing.xl, paddingTop: 60, backgroundColor: colors.background },
  modalTitle: { fontFamily: fontFamily.extrabold, fontSize: fontSize.xl, color: colors.textPrimary },
  label: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 },
  error: { fontFamily: fontFamily.medium, color: colors.danger, marginTop: spacing.md, fontSize: fontSize.sm },
  modalButtonsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  flex1: { flex: 1 },
});
