import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, type ImageStyle, type StyleProp } from 'react-native';
import { getSignedUrl } from '../lib/storage';
import { RemoteImage } from './RemoteImage';

interface Props {
  path: string;
  mimeType: string;
  fileName?: string | null;
  style?: StyleProp<ImageStyle>;
}

export function AttachmentPreview({ path, mimeType, fileName, style }: Props) {
  if (mimeType.startsWith('image/')) {
    return <RemoteImage path={path} style={style} />;
  }

  async function open() {
    try {
      const url = await getSignedUrl(path);
      Linking.openURL(url);
    } catch {
      // ignora — usuário pode tentar de novo
    }
  }

  return (
    <Pressable style={styles.chip} onPress={open}>
      <Ionicons name="document-text" size={22} color="#1F6FEB" />
      <Text style={styles.name} numberOfLines={1}>
        {fileName ?? 'Arquivo'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    maxWidth: 160,
  },
  name: { fontSize: 12, color: '#1F6FEB', fontWeight: '600' },
});
