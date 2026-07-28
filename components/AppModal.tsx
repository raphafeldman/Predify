import type { ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../lib/theme';
import { useIsWideScreen } from '../lib/useIsWideScreen';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
}

/** Modal que se adapta ao contexto: tela cheia deslizando de baixo no
 * celular (nativo do RN), diálogo centralizado com fundo escurecido na
 * versão web larga — evita a sensação de "app mobile esticado" no
 * navegador, onde uma tela cheia cobrindo tudo não é o padrão esperado. */
export function AppModal({ visible, onClose, children, maxWidth = 560 }: Props) {
  const isWideScreen = useIsWideScreen();
  const isDialog = Platform.OS === 'web' && isWideScreen;

  if (isDialog) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
          <View style={[styles.dialog, { maxWidth }]}>{children}</View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {children}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 26, 58, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  dialog: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    shadowColor: '#0A1A3A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 32,
    elevation: 12,
  },
});
