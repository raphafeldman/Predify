import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { PhotoPicker } from '../../components/PhotoPicker';
import { RecordCard } from '../../components/RecordCard';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../lib/auth-context';
import { uploadPhotos } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { colors, floatingShadow, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import type { ServiceRequest, ServiceRequestStatus } from '../../lib/types';

export const CATEGORY_LABEL: Record<string, string> = {
  infiltracao: 'Infiltração',
  eletrica: 'Elétrica',
  hidraulica: 'Hidráulica',
  estrutural: 'Estrutural',
  pintura: 'Pintura',
  portas_janelas: 'Portas e janelas',
  elevador: 'Elevador',
  outro: 'Outro',
};

const STATUS_LABEL: Record<ServiceRequestStatus, string> = {
  aberta: 'Aberta',
  orcamento_solicitado: 'Orçamento solicitado',
  orcado: 'Orçado',
  aprovado: 'Aprovado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const STATUS_COLOR: Record<ServiceRequestStatus, string> = {
  aberta: colors.warning,
  orcamento_solicitado: colors.primary,
  orcado: colors.primary,
  aprovado: colors.success,
  concluido: colors.success,
  cancelado: colors.textMuted,
};

export function buildShareText(req: ServiceRequest) {
  const lines = [
    `Solicitação de orçamento — ${req.title}`,
    `Categoria: ${CATEGORY_LABEL[req.category] ?? req.category}`,
  ];
  if (req.notes) lines.push(`Detalhes: ${req.notes}`);
  lines.push('', 'Enviado pelo app Zelo.');
  return lines.join('\n');
}

export default function PrestadoresScreen() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRequest | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('service_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setRequests(data as ServiceRequest[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('service-requests-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function share(req: ServiceRequest) {
    await Share.share({ message: buildShareText(req) });
    if (req.status === 'aberta') {
      await supabase.from('service_requests').update({ status: 'orcamento_solicitado' }).eq('id', req.id);
      load();
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="briefcase-outline"
              title="Nenhuma solicitação registrada"
              subtitle="Documente um problema e peça orçamento a um prestador."
            />
          ) : null
        }
        renderItem={({ item }) => (
          <RecordCard
            recordType="service_request"
            recordId={item.id}
            title={item.title}
            subtitle={`${CATEGORY_LABEL[item.category] ?? item.category} • ${new Date(item.created_at).toLocaleString('pt-BR')}`}
            badge={{ label: STATUS_LABEL[item.status], color: STATUS_COLOR[item.status] }}
            photoPaths={item.photo_urls}
          >
            {item.notes ? <Text style={styles.description}>{item.notes}</Text> : null}
            {item.provider_name ? (
              <Text style={styles.description}>
                Prestador: {item.provider_name}
                {item.quote_value ? ` • R$ ${item.quote_value.toFixed(2)}` : ''}
              </Text>
            ) : null}
            <View style={styles.actionsRow}>
              <Pressable style={styles.shareButton} onPress={() => share(item)}>
                <Ionicons name="share-social-outline" size={14} color={colors.primary} />
                <Text style={styles.shareButtonText}>Compartilhar</Text>
              </Pressable>
              <Pressable style={styles.editButton} onPress={() => setEditing(item)}>
                <Text style={styles.editButtonText}>Atualizar status</Text>
              </Pressable>
            </View>
          </RecordCard>
        )}
      />

      <Pressable style={styles.fab} onPress={() => setFormOpen(true)}>
        <Ionicons name="add" size={18} color={colors.textOnPrimary} />
        <Text style={styles.fabText}>Nova solicitação</Text>
      </Pressable>

      <NewServiceRequestModal
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={() => {
          setFormOpen(false);
          load();
        }}
      />

      <EditServiceRequestModal
        request={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </View>
  );
}

export function NewServiceRequestModal({
  visible,
  onClose,
  onCreated,
  occurrenceId,
  initialTitle,
  initialNotes,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  occurrenceId?: string;
  initialTitle?: string;
  initialNotes?: string;
}) {
  const { session, profile } = useAuth();
  const [title, setTitle] = useState(initialTitle ?? '');
  const [category, setCategory] = useState('outro');
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setTitle(initialTitle ?? '');
      setNotes(initialNotes ?? '');
    }
  }, [visible, initialTitle, initialNotes]);

  function reset() {
    setTitle('');
    setCategory('outro');
    setNotes('');
    setPhotos([]);
    setError(null);
  }

  async function submit() {
    if (!session || !profile) return;
    if (!title.trim()) {
      setError('Dê um título para a solicitação.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const photoPaths = photos.length
        ? await uploadPhotos(photos, 'service_requests', session.user.id, profile.condominio_id)
        : [];
      const { error: insertError } = await supabase.from('service_requests').insert({
        title: title.trim(),
        category,
        notes: notes.trim() || null,
        photo_urls: photoPaths,
        occurrence_id: occurrenceId ?? null,
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
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Solicitar orçamento</Text>

        <TextField label="Título" value={title} onChangeText={setTitle} placeholder="Ex: Infiltração na garagem" />

        <Text style={styles.label}>Categoria</Text>
        <View style={styles.categoryRow}>
          {Object.keys(CATEGORY_LABEL).map((key) => (
            <Pressable
              key={key}
              style={[styles.categoryOption, category === key && styles.categoryOptionActive]}
              onPress={() => setCategory(key)}
            >
              <Text style={[styles.categoryOptionText, category === key && styles.categoryOptionTextActive]}>
                {CATEGORY_LABEL[key]}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextField
          label="Detalhes (opcional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Descreva o problema"
          multiline
        />

        <Text style={styles.label}>Fotos (opcional)</Text>
        <PhotoPicker uris={photos} onChange={setPhotos} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.hintSmall}>
          Depois de salvar, use &quot;Compartilhar&quot; para enviar essa solicitação pelo GetNinjas, WhatsApp ou
          qualquer prestador de sua confiança.
        </Text>

        <View style={styles.modalButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Salvar" onPress={submit} loading={saving} style={styles.flex1} />
        </View>
      </ModalFormLayout>
    </Modal>
  );
}

function EditServiceRequestModal({
  request,
  onClose,
  onSaved,
}: {
  request: ServiceRequest | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<ServiceRequestStatus>('aberta');
  const [providerName, setProviderName] = useState('');
  const [providerContact, setProviderContact] = useState('');
  const [quoteValue, setQuoteValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (request) {
      setStatus(request.status);
      setProviderName(request.provider_name ?? '');
      setProviderContact(request.provider_contact ?? '');
      setQuoteValue(request.quote_value != null ? String(request.quote_value) : '');
      setError(null);
    }
  }, [request]);

  async function save() {
    if (!request) return;
    let quote: number | null = null;
    if (quoteValue.trim()) {
      quote = Number(quoteValue.replace(',', '.'));
      if (Number.isNaN(quote)) {
        setError('Valor do orçamento inválido.');
        return;
      }
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('service_requests')
      .update({
        status,
        provider_name: providerName.trim() || null,
        provider_contact: providerContact.trim() || null,
        quote_value: quote,
      })
      .eq('id', request.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved();
  }

  if (!request) return null;

  return (
    <Modal visible={Boolean(request)} animationType="slide" onRequestClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>{request.title}</Text>

        <Text style={styles.label}>Status</Text>
        <View style={styles.categoryRow}>
          {(Object.keys(STATUS_LABEL) as ServiceRequestStatus[]).map((key) => (
            <Pressable
              key={key}
              style={[styles.categoryOption, status === key && styles.categoryOptionActive]}
              onPress={() => setStatus(key)}
            >
              <Text style={[styles.categoryOptionText, status === key && styles.categoryOptionTextActive]}>
                {STATUS_LABEL[key]}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextField label="Prestador (opcional)" value={providerName} onChangeText={setProviderName} placeholder="Nome da empresa/pessoa" />
        <TextField label="Contato do prestador (opcional)" value={providerContact} onChangeText={setProviderContact} placeholder="Telefone ou e-mail" />
        <TextField
          label="Valor do orçamento (opcional)"
          value={quoteValue}
          onChangeText={setQuoteValue}
          placeholder="Ex: 850.00"
          keyboardType="numeric"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Fechar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Salvar" onPress={save} loading={saving} style={styles.flex1} />
        </View>
      </ModalFormLayout>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, paddingBottom: 90 },
  description: { fontFamily: fontFamily.regular, fontSize: fontSize.base, color: colors.textSecondary, marginTop: spacing.sm },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  shareButtonText: { fontFamily: fontFamily.semibold, color: colors.primary, fontSize: fontSize.xs },
  editButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  editButtonText: { fontFamily: fontFamily.semibold, color: colors.textSecondary, fontSize: fontSize.xs },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...floatingShadow,
  },
  fabText: { fontFamily: fontFamily.bold, color: colors.textOnPrimary, fontSize: fontSize.sm },
  modalContainer: { flexGrow: 1, padding: spacing.xl, paddingTop: 60, backgroundColor: colors.background },
  modalTitle: { fontFamily: fontFamily.extrabold, fontSize: fontSize.xl, marginBottom: spacing.lg, color: colors.textPrimary },
  label: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  hintSmall: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.md },
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
