import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { FilePicker, type PickedFile } from '../../components/FilePicker';
import { PhotoPicker } from '../../components/PhotoPicker';
import { RecordCard } from '../../components/RecordCard';
import { useAuth } from '../../lib/auth-context';
import { uploadFile, uploadPhoto } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
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
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>Nenhum documento adicionado ainda.</Text> : null
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

      <Pressable style={styles.fab} onPress={() => setFormOpen(true)}>
        <Text style={styles.fabText}>+ Novo documento</Text>
      </Pressable>

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
  const { session } = useAuth();
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
    if (!session) return;
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
        fileUrl = await uploadPhoto(photos[0], 'documents', session.user.id);
        fileName = null;
        mimeType = 'image/jpeg';
      } else {
        fileUrl = await uploadFile(
          pickedFile!.uri,
          'documents',
          session.user.id,
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
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Novo documento</Text>

        <Text style={styles.label}>Título</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Ex: Nota fiscal do elevador"
        />

        <Text style={styles.label}>Categoria</Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat}
              style={[styles.categoryOption, category === cat && styles.categoryOptionActive]}
              onPress={() => setCategory(cat)}
            >
              <Text
                style={[
                  styles.categoryOptionText,
                  category === cat && styles.categoryOptionTextActive,
                ]}
              >
                {cat}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Observações (opcional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
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
            <Text
              style={[styles.categoryOptionText, mode === 'foto' && styles.categoryOptionTextActive]}
            >
              Foto
            </Text>
          </Pressable>
          <Pressable
            style={[styles.categoryOption, mode === 'arquivo' && styles.categoryOptionActive]}
            onPress={() => setMode('arquivo')}
          >
            <Text
              style={[
                styles.categoryOptionText,
                mode === 'arquivo' && styles.categoryOptionTextActive,
              ]}
            >
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
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </Pressable>
          <Pressable style={styles.saveButton} onPress={submit} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Salvar</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  listContent: { padding: 16, paddingBottom: 90 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40 },
  notes: { fontSize: 14, color: '#374151', marginTop: 8 },
  attachmentWrapper: { marginTop: 10 },
  attachmentImage: { width: 90, height: 90, borderRadius: 8, backgroundColor: '#F3F4F6' },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#1F6FEB',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 18,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  fabText: { color: '#fff', fontWeight: '700' },
  modalContainer: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#fff' },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16, color: '#111827' },
  label: { fontSize: 13, color: '#374151', marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryOption: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  categoryOptionActive: { backgroundColor: '#1F6FEB', borderColor: '#1F6FEB' },
  categoryOptionText: { color: '#374151', fontSize: 13, fontWeight: '600' },
  categoryOptionTextActive: { color: '#fff' },
  error: { color: '#DC2626', marginTop: 12, fontSize: 13 },
  modalButtonsRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelButtonText: { color: '#374151', fontWeight: '600' },
  saveButton: {
    flex: 1,
    backgroundColor: '#1F6FEB',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontWeight: '700' },
});
