import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '../../components/AppModal';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { FilePicker, type PickedFile } from '../../components/FilePicker';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { PhotoPicker } from '../../components/PhotoPicker';
import { RecordCard } from '../../components/RecordCard';
import { ScreenActionButton } from '../../components/ScreenActionButton';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../lib/auth-context';
import { uploadFile, uploadPhoto } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import type { DocumentItem } from '../../lib/types';

const CATEGORIES = ['Contrato', 'Nota fiscal', 'Ata de reunião', 'Comprovante', 'Outro'];

export default function DocumentosScreen() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setDocuments(data as DocumentItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <ScreenActionButton label="Novo documento" onPress={() => setFormOpen(true)} />

      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          !loading ? (
            <EmptyState icon="document-text-outline" title="Nenhum documento adicionado ainda" />
          ) : null
        }
        renderItem={({ item }) => (
          <RecordCard
            recordType="document"
            recordId={item.id}
            title={item.title}
            subtitle={`${item.category} • ${new Date(item.created_at).toLocaleDateString('pt-BR')}`}
          >
            {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
            <View style={styles.attachmentWrapper}>
              <AttachmentPreview
                path={item.file_url}
                mimeType={item.mime_type}
                fileName={item.file_name}
                style={styles.attachmentImage}
              />
            </View>
          </RecordCard>
        )}
      />

      <NewDocumentModal
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={() => {
          setFormOpen(false);
          load();
        }}
      />
    </View>
  );
}

type AttachmentMode = 'foto' | 'arquivo';

function NewDocumentModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { session, profile } = useAuth();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState<AttachmentMode>('foto');
  const [photos, setPhotos] = useState<string[]>([]);
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle('');
    setCategory(CATEGORIES[0]);
    setNotes('');
    setMode('foto');
    setPhotos([]);
    setPickedFile(null);
    setError(null);
  }

  async function submit() {
    if (!session || !profile) return;
    if (!title.trim()) {
      setError('Dê um título ao documento.');
      return;
    }
    if (mode === 'foto' && photos.length === 0) {
      setError('Tire ao menos uma foto.');
      return;
    }
    if (mode === 'arquivo' && !pickedFile) {
      setError('Escolha um arquivo.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let fileUrl: string;
      let fileName: string | null;
      let mimeType: string;

      if (mode === 'foto') {
        fileUrl = await uploadPhoto(photos[0], 'documents', session.user.id, profile.condominio_id);
        fileName = null;
        mimeType = 'image/jpeg';
      } else {
        fileUrl = await uploadFile(
          pickedFile!.uri,
          'documents',
          session.user.id,
          profile.condominio_id,
          pickedFile!.mimeType,
          pickedFile!.name
        );
        fileName = pickedFile!.name;
        mimeType = pickedFile!.mimeType;
      }

      const { error: insertError } = await supabase.from('documents').insert({
        title: title.trim(),
        category,
        file_url: fileUrl,
        file_name: fileName,
        mime_type: mimeType,
        notes: notes.trim() || null,
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
    <AppModal visible={visible} onClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Novo documento</Text>

        <TextField label="Título" value={title} onChangeText={setTitle} placeholder="Ex: Nota fiscal do elevador" />

        <Text style={styles.label}>Categoria</Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat}
              style={[styles.categoryOption, category === cat && styles.categoryOptionActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.categoryOptionText, category === cat && styles.categoryOptionTextActive]}>
                {cat}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextField
          label="Observações (opcional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Alguma observação sobre o documento"
          multiline
        />

        <Text style={styles.label}>Anexo</Text>
        <View style={styles.categoryRow}>
          <Pressable
            style={[styles.categoryOption, mode === 'foto' && styles.categoryOptionActive]}
            onPress={() => setMode('foto')}
          >
            <Text style={[styles.categoryOptionText, mode === 'foto' && styles.categoryOptionTextActive]}>
              Foto
            </Text>
          </Pressable>
          <Pressable
            style={[styles.categoryOption, mode === 'arquivo' && styles.categoryOptionActive]}
            onPress={() => setMode('arquivo')}
          >
            <Text style={[styles.categoryOptionText, mode === 'arquivo' && styles.categoryOptionTextActive]}>
              Arquivo (celular ou nuvem)
            </Text>
          </Pressable>
        </View>

        {mode === 'foto' ? (
          <PhotoPicker uris={photos.slice(0, 1)} onChange={(uris) => setPhotos(uris.slice(-1))} />
        ) : (
          <FilePicker file={pickedFile} onChange={setPickedFile} />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Salvar" onPress={submit} loading={saving} style={styles.flex1} />
        </View>
      </ModalFormLayout>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, paddingBottom: 90 },
  notes: { fontFamily: fontFamily.regular, fontSize: fontSize.base, color: colors.textSecondary, marginTop: spacing.sm },
  attachmentWrapper: { marginTop: spacing.sm },
  attachmentImage: { width: 90, height: 90, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
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
