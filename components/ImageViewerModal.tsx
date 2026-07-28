import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { getSignedUrl } from '../lib/storage';
import { fontFamily, fontSize, spacing } from '../lib/theme';

interface Props {
  visible: boolean;
  paths: string[];
  initialIndex?: number;
  onClose: () => void;
}

// Visualizador de foto em tela cheia — usado em qualquer lugar que mostra
// miniaturas de fotos (RecordCard, AttachmentPreview), já que antes disso
// não existia nenhum jeito de abrir/ampliar uma foto no app inteiro.
export function ImageViewerModal({ visible, paths, initialIndex = 0, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [visible, initialIndex]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setUrl(null);
    getSignedUrl(paths[index]).then((signedUrl) => {
      if (!cancelled) setUrl(signedUrl);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, index, paths]);

  const hasPrev = index > 0;
  const hasNext = index < paths.length - 1;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>

        {url ? (
          <Image source={{ uri: url }} style={styles.image} resizeMode="contain" />
        ) : (
          <ActivityIndicator color="#fff" size="large" />
        )}

        {paths.length > 1 && (
          <View style={styles.navRow}>
            <Pressable disabled={!hasPrev} onPress={() => setIndex((i) => i - 1)} hitSlop={12}>
              <Ionicons name="chevron-back" size={30} color={hasPrev ? '#fff' : 'rgba(255,255,255,0.3)'} />
            </Pressable>
            <Text style={styles.counter}>
              {index + 1} / {paths.length}
            </Text>
            <Pressable disabled={!hasNext} onPress={() => setIndex((i) => i + 1)} hitSlop={12}>
              <Ionicons name="chevron-forward" size={30} color={hasNext ? '#fff' : 'rgba(255,255,255,0.3)'} />
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: spacing.lg,
    zIndex: 1,
    padding: spacing.xs,
  },
  image: { width: '100%', height: '80%' },
  navRow: {
    position: 'absolute',
    bottom: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  counter: { fontFamily: fontFamily.semibold, color: '#fff', fontSize: fontSize.sm },
});
