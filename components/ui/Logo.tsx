import { Image, StyleSheet, View } from 'react-native';

// logo-predify-cropped.png é o logo-predify.png original com a margem
// transparente em excesso recortada — sem isso, o desenho fica minúsculo
// quando exibido pequeno (barra lateral, perfil).
const wordmarkLogo = require('../../assets/logo-predify-cropped.png');
const iconLogo = require('../../assets/icon.png');
const WORDMARK_ASPECT_RATIO = 1024 / 316;

interface Props {
  size?: 'sm' | 'lg';
  showWordmark?: boolean;
}

export function Logo({ size = 'sm', showWordmark = true }: Props) {
  const markSize = size === 'lg' ? 64 : 34;

  if (!showWordmark) {
    return (
      <View style={styles.row}>
        <Image
          source={iconLogo}
          style={[styles.icon, { width: markSize, height: markSize, borderRadius: markSize * 0.22 }]}
          resizeMode="cover"
        />
      </View>
    );
  }

  const wordmarkHeight = size === 'lg' ? 40 : 30;

  return (
    <View style={styles.row}>
      <Image
        source={wordmarkLogo}
        style={{ height: wordmarkHeight, width: wordmarkHeight * WORDMARK_ASPECT_RATIO }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: {},
});
