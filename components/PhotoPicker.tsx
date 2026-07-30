import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { classificarArquivo } from '../lib/imageTypes';
import { colors, fontFamily, fontSize, radius, spacing } from '../lib/theme';

interface Props {
  uris: string[];
  onChange: (uris: string[]) => void;
}

/** Seleção de imagens no navegador, sem passar pelo expo-image-picker —
 * que derruba a tela quando o navegador não informa o tipo do arquivo
 * (ver lib/imageTypes.ts). */
function escolherImagensNaWeb(): Promise<{ uris: string[]; recusados: string[] }> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';

    input.addEventListener('change', () => {
      const arquivos = Array.from(input.files ?? []);
      const uris: string[] = [];
      const recusados: string[] = [];

      for (const arquivo of arquivos) {
        const resultado = classificarArquivo(arquivo.name, arquivo.type);
        if (resultado.aceito) {
          uris.push(URL.createObjectURL(arquivo));
        } else if (resultado.motivo === 'formato_nao_exibivel') {
          recusados.push(`${arquivo.name} (${resultado.formato})`);
        } else {
          recusados.push(arquivo.name);
        }
      }

      document.body.removeChild(input);
      resolve({ uris, recusados });
    });

    input.addEventListener('cancel', () => {
      document.body.removeChild(input);
      resolve({ uris: [], recusados: [] });
    });

    document.body.appendChild(input);
    input.click();
  });
}

export function PhotoPicker({ uris, onChange }: Props) {
  async function takePhoto() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return;
      const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
      if (!result.canceled && result.assets[0]) {
        onChange([...uris, result.assets[0].uri]);
      }
    } catch {
      Alert.alert('Não foi possível usar a câmera', 'Tente novamente ou escolha uma foto da galeria.');
    }
  }

  async function pickFromLibrary() {
    try {
      if (Platform.OS === 'web') {
        const { uris: novas, recusados } = await escolherImagensNaWeb();
        if (novas.length > 0) onChange([...uris, ...novas]);
        if (recusados.length > 0) {
          Alert.alert(
            'Formato não aceito no navegador',
            `Não foi possível anexar: ${recusados.join(', ')}.\n\n` +
              'Fotos de iPhone (HEIC) não abrem no navegador. Envie pelo celular, ' +
              'ou converta para JPG/PNG antes.'
          );
        }
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.6,
        allowsMultipleSelection: true,
      });
      if (!result.canceled) {
        onChange([...uris, ...result.assets.map((a) => a.uri)]);
      }
    } catch {
      Alert.alert(
        'Não foi possível anexar a foto',
        'O arquivo escolhido não pôde ser lido. Tente outra imagem (JPG ou PNG).'
      );
    }
  }

  function removeAt(index: number) {
    onChange(uris.filter((_, i) => i !== index));
  }

  return (
    <View>
      <View style={styles.buttonsRow}>
        <Pressable style={styles.button} onPress={takePhoto}>
          <Ionicons name="camera" size={18} color={colors.primary} />
          <Text style={styles.buttonText}>Tirar foto</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={pickFromLibrary}>
          <Ionicons name="images" size={18} color={colors.primary} />
          <Text style={styles.buttonText}>Galeria</Text>
        </Pressable>
      </View>

      {uris.length > 0 && (
        <ScrollView horizontal style={styles.previewRow} showsHorizontalScrollIndicator={false}>
          {uris.map((uri, index) => (
            <View key={uri} style={styles.previewWrapper}>
              <Image source={{ uri }} style={styles.previewImage} />
              <Pressable style={styles.removeBadge} onPress={() => removeAt(index)}>
                <Ionicons name="close" size={14} color={colors.textOnPrimary} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  buttonsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  buttonText: { fontFamily: fontFamily.semibold, color: colors.primary, fontSize: fontSize.sm },
  previewRow: { marginTop: spacing.sm },
  previewWrapper: { marginRight: spacing.sm, position: 'relative' },
  previewImage: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.danger,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
