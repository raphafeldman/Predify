import { useWindowDimensions } from 'react-native';

// Usado pra decidir tabela (larga) vs. cartão (estreito) e Sidebar vs.
// abas — por largura de tela, não por Platform.OS. Sem isso, abrir a
// versão web pelo navegador do celular sempre caía no layout de
// desktop (Platform.OS já é "web" nesse caso, mas a tela é estreita).
const WIDE_BREAKPOINT = 768;

export function useIsWideScreen() {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT;
}
