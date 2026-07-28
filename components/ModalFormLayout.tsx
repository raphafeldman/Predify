import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { spacing } from '../lib/theme';
import { useIsWideScreen } from '../lib/useIsWideScreen';

/** Envolve o conteúdo de um formulário em modal para o teclado nunca
 * esconder os campos de baixo — permite rolar a tela quando o teclado abre.
 * Também neutraliza o padding-top pensado pra tela cheia (limpar a barra de
 * status) e o flexGrow (que força altura mínima de tela inteira) quando
 * está dentro do diálogo centralizado do AppModal na versão web larga —
 * assim toda tela que já usa este componente ganha o ajuste automático,
 * sem precisar mexer no style próprio de cada uma. */
export function ModalFormLayout({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const isWideScreen = useIsWideScreen();
  const isDialog = Platform.OS === 'web' && isWideScreen;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[style, isDialog && styles.dialogOverrides]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  dialogOverrides: { flexGrow: 0, paddingTop: spacing.xl },
});
