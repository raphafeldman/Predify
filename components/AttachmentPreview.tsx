import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, type ImageStyle, type StyleProp } from 'react-native';
import { getSignedUrl } from '../lib/storage';
import { colors, fontFamily, fontSize, radius, spacing } from '../lib/theme';
import { ImageViewerModal } from './ImageViewerModal';
import { RemoteImage } from './RemoteImage';

interface Props {
  path: string;
  mimeType: string;
  fileName?: string | null;
  style?: StyleProp<ImageStyle>;
}

export function AttachmentPreview({ path, mimeType, fileName, style }: Props) {
  const [viewerOpen, setViewerOpen] = useState(false);

  if (mimeType.startsWith('image/')) {
    return (
      <>
        <Pressable onPress={() => setViewerOpen(true)}>
          <RemoteImage path={path} style={style} />
        </Pressable>
        <ImageViewerModal visible={viewerOpen} paths={[path]} onClose={() => setViewerOpen(false)} />
      </>
    );
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
      <Ionicons name="document-text" size={22} color={colors.primary} />
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
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    maxWidth: 160,
  },
  name: { fontFamily: fontFamily.semibold, fontSize: fontSize.xs, color: colors.primary },
});
