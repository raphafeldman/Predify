import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

interface Props {
  file: PickedFile | null;
  onChange: (file: PickedFile | null) => void;
}

export function FilePicker({ file, onChange }: Props) {
  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    onChange({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
    });
  }

  return (
    <View>
      <Pressable style={styles.button} onPress={pick}>
        <Ionicons name="folder-open" size={18} color="#1F6FEB" />
        <Text style={styles.buttonText}>Escolher arquivo (celular ou nuvem)</Text>
      </Pressable>

      {file && (
        <View style={styles.fileRow}>
          <Ionicons name="document" size={20} color="#374151" />
          <Text style={styles.fileName} numberOfLines={1}>
            {file.name}
          </Text>
          <Pressable onPress={() => onChange(null)}>
            <Ionicons name="close-circle" size={20} color="#DC2626" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#1F6FEB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  buttonText: { color: '#1F6FEB', fontWeight: '600', fontSize: 13 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
  },
  fileName: { flex: 1, fontSize: 13, color: '#374151' },
});
