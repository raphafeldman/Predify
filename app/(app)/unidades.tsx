import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '../../components/AppModal';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { supabaseErrorMessage } from '../../lib/supabaseError';
import { cardShadow, colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import { useIsWideScreen } from '../../lib/useIsWideScreen';
import type { Unit } from '../../lib/types';

export default function UnidadesScreen() {
  const { profile } = useAuth();
  const isWeb = useIsWideScreen();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [loteOpen, setLoteOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [busca, setBusca] = useState('');
  const isSindico = profile?.role === 'sindico';

  const load = useCallback(async () => {
    const { data } = await supabase.from('units').select('*').order('label');
    if (data) setUnits(data as Unit[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    if (!termo) return units;
    return units.filter((u) => u.label.toUpperCase().includes(termo));
  }, [units, busca]);

  if (!isSindico) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="lock-closed-outline"
          title="Somente o síndico administra as unidades"
          subtitle="Você continua podendo registrar encomendas para qualquer unidade."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Unidades</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.secondaryButton} onPress={() => setLoteOpen(true)}>
            <Ionicons name="layers-outline" size={15} color={colors.primary} />
            <Text style={styles.secondaryButtonText}>Cadastrar em lote</Text>
          </Pressable>
          <Pressable
            style={styles.newButton}
            onPress={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Ionicons name="add" size={16} color={colors.textOnPrimary} />
            <Text style={styles.newButtonText}>Nova unidade</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.buscaWrap}>
        <TextField
          label=""
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar por apartamento (ex.: A-302)"
        />
      </View>

      <FlatList
        data={filtradas}
        keyExtractor={(item) => item.id}
        numColumns={isWeb ? 4 : 2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="business-outline"
              title={units.length ? 'Nenhuma unidade com esse filtro' : 'Nenhuma unidade cadastrada'}
              subtitle={
                units.length
                  ? undefined
                  : 'Cadastre as unidades para poder registrar encomendas por apartamento.'
              }
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.unitCard}
            onPress={() => {
              setEditing(item);
              setFormOpen(true);
            }}
          >
            <Text style={styles.unitLabel}>{item.label}</Text>
            {item.floor ? <Text style={styles.unitMeta}>{item.floor}º andar</Text> : null}
            {!item.active ? <Badge label="Inativa" color={colors.textMuted} /> : null}
          </Pressable>
        )}
      />

      <UnitFormModal
        visible={formOpen}
        unit={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <UnitLoteModal
        visible={loteOpen}
        onClose={() => setLoteOpen(false)}
        onSaved={() => {
          setLoteOpen(false);
          load();
        }}
      />
    </View>
  );
}

function UnitFormModal({
  visible,
  unit,
  onClose,
  onSaved,
}: {
  visible: boolean;
  unit: Unit | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { session } = useAuth();
  const [block, setBlock] = useState('');
  const [number, setNumber] = useState('');
  const [floor, setFloor] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setBlock(unit?.block ?? '');
      setNumber(unit?.number ?? '');
      setFloor(unit?.floor ?? '');
      setNotes(unit?.notes ?? '');
      setActive(unit?.active ?? true);
      setError(null);
    }
  }, [visible, unit]);

  async function submit() {
    if (!session) return;
    if (!number.trim()) {
      setError('Informe o número da unidade.');
      return;
    }
    setSaving(true);
    setError(null);
    // Normaliza aqui para que "a" e "A" não virem blocos diferentes.
    const payload = {
      block: block.trim().toUpperCase(),
      number: number.trim().toUpperCase(),
      floor: floor.trim() || null,
      notes: notes.trim() || null,
      active,
    };
    const { error: saveError } = unit
      ? await supabase.from('units').update(payload).eq('id', unit.id)
      : await supabase.from('units').insert({ ...payload, created_by: session.user.id });
    setSaving(false);
    if (saveError) {
      setError(
        saveError.code === '23505'
          ? 'Já existe uma unidade com esse bloco e número.'
          : supabaseErrorMessage(saveError, 'Não foi possível salvar.') ?? 'Não foi possível salvar.'
      );
      return;
    }
    onSaved();
  }

  return (
    <AppModal visible={visible} onClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>{unit ? 'Editar unidade' : 'Nova unidade'}</Text>

        <TextField
          label="Bloco / torre (deixe vazio se não houver)"
          value={block}
          onChangeText={setBlock}
          placeholder="Ex.: A"
        />
        <TextField label="Número" value={number} onChangeText={setNumber} placeholder="Ex.: 302" />
        <TextField label="Andar (opcional)" value={floor} onChangeText={setFloor} placeholder="Ex.: 3" />
        <TextField label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline />

        {unit ? (
          <Pressable style={styles.toggleRow} onPress={() => setActive((v) => !v)}>
            <Ionicons
              name={active ? 'checkbox' : 'square-outline'}
              size={20}
              color={active ? colors.primary : colors.textMuted}
            />
            <Text style={styles.toggleText}>Unidade ativa</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Salvar" onPress={submit} loading={saving} style={styles.flex1} />
        </View>
      </ModalFormLayout>
    </AppModal>
  );
}

// Cadastrar 60 apartamentos um a um afundaria a função antes de ela
// começar a ser usada. Este atalho cobre o formato mais comum: N andares
// com as mesmas terminações em cada um.
function UnitLoteModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { session } = useAuth();
  const [block, setBlock] = useState('');
  const [andarInicial, setAndarInicial] = useState('1');
  const [andarFinal, setAndarFinal] = useState('10');
  const [terminacoes, setTerminacoes] = useState('01, 02, 03, 04');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previa = useMemo(() => {
    const ini = Number(andarInicial);
    const fim = Number(andarFinal);
    const sufixos = terminacoes
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (!Number.isInteger(ini) || !Number.isInteger(fim) || ini < 1 || fim < ini || !sufixos.length) {
      return [];
    }
    const lista: { block: string; number: string; floor: string }[] = [];
    for (let andar = ini; andar <= fim; andar += 1) {
      for (const sufixo of sufixos) {
        lista.push({
          block: block.trim().toUpperCase(),
          number: `${andar}${sufixo}`,
          floor: String(andar),
        });
      }
    }
    return lista;
  }, [block, andarInicial, andarFinal, terminacoes]);

  async function submit() {
    if (!session || !previa.length) return;
    setSaving(true);
    setError(null);
    // on conflict do nothing no banco: reexecutar não duplica, e quem já
    // cadastrou parte das unidades à mão não é penalizado.
    const { error: insertError, count } = await supabase
      .from('units')
      .upsert(
        previa.map((u) => ({ ...u, created_by: session.user.id })),
        { onConflict: 'condominio_id,block,number', ignoreDuplicates: true, count: 'exact' }
      );
    setSaving(false);
    if (insertError) {
      setError(supabaseErrorMessage(insertError, 'Não foi possível cadastrar.') ?? 'Erro.');
      return;
    }
    Alert.alert('Unidades cadastradas', `${count ?? previa.length} unidade(s) criada(s).`);
    onSaved();
  }

  return (
    <AppModal visible={visible} onClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Cadastrar unidades em lote</Text>
        <Text style={styles.hint}>
          Gera as unidades combinando cada andar com cada terminação. Unidades que já existirem são
          ignoradas, então dá para rodar de novo sem duplicar.
        </Text>

        <TextField
          label="Bloco / torre (deixe vazio se não houver)"
          value={block}
          onChangeText={setBlock}
          placeholder="Ex.: A"
        />
        <View style={styles.linha}>
          <View style={styles.flex1}>
            <TextField
              label="Do andar"
              value={andarInicial}
              onChangeText={setAndarInicial}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.flex1}>
            <TextField
              label="Até o andar"
              value={andarFinal}
              onChangeText={setAndarFinal}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <TextField
          label="Terminações por andar (separadas por vírgula)"
          value={terminacoes}
          onChangeText={setTerminacoes}
          placeholder="01, 02, 03, 04"
        />

        <Text style={styles.label}>Prévia</Text>
        {previa.length === 0 ? (
          <Text style={styles.hint}>Preencha os campos acima para ver o que será criado.</Text>
        ) : (
          <>
            <Text style={styles.previaTexto}>
              {previa.length} unidade(s):{' '}
              {previa
                .slice(0, 6)
                .map((u) => (u.block ? `${u.block}-${u.number}` : u.number))
                .join(', ')}
              {previa.length > 6 ? `… até ${
                previa[previa.length - 1].block
                  ? `${previa[previa.length - 1].block}-${previa[previa.length - 1].number}`
                  : previa[previa.length - 1].number
              }` : ''}
            </Text>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button
            title={`Criar ${previa.length || ''}`.trim()}
            onPress={submit}
            loading={saving}
            disabled={!previa.length}
            style={styles.flex1}
          />
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
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  headerActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
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
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: { fontFamily: fontFamily.semibold, color: colors.primary, fontSize: fontSize.sm },
  buscaWrap: { paddingHorizontal: spacing.lg },
  listContent: { padding: spacing.lg, paddingTop: spacing.sm },
  gridRow: { gap: spacing.sm },
  unitCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
    gap: 2,
    ...cardShadow,
  },
  unitLabel: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.textPrimary },
  unitMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  modalContainer: { flexGrow: 1, padding: spacing.xl, paddingTop: 60, backgroundColor: colors.background },
  modalTitle: { fontFamily: fontFamily.extrabold, fontSize: fontSize.xl, color: colors.textPrimary },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 },
  previaTexto: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  linha: { flexDirection: 'row', gap: spacing.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  toggleText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textPrimary },
  error: { fontFamily: fontFamily.medium, color: colors.danger, marginTop: spacing.md, fontSize: fontSize.sm },
  modalButtonsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  flex1: { flex: 1 },
});
