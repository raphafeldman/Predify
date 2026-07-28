import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, fontSize, radius, spacing } from '../lib/theme';

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
        <Ionicons name="folder-open" size={18} color={colors.primary} />
        <Text style={styles.buttonText}>Escolher arquivo (celular ou nuvem)</Text>
      </Pressable>

      {file && (
        <View style={styles.fileRow}>
          <Ionicons name="document" size={20} color={colors.textSecondary} />
          <Text style={styles.fileName} numberOfLines={1}>
            {file.name}
          </Text>
          <Pressable onPress={() => onChange(null)}>
            <Ionicons name="close-circle" size={20} color={colors.danger} />
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
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  buttonText: { fontFamily: fontFamily.semibold, color: colors.primary, fontSize: fontSize.sm },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  fileName: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
});
