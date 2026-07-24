import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import { getSignedUrl } from '../lib/storage';

export function RemoteImage({ path, style }: { path: string; style?: StyleProp<ImageStyle> }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSignedUrl(path)
      .then((signedUrl) => {
        if (!cancelled) setUrl(signedUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!url) {
    return (
      <View style={[styles.placeholder, style]}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Image source={{ uri: url }} style={style} />;
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
