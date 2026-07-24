import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface Props {
  uris: string[];
  onChange: (uris: string[]) => void;
}

export function PhotoPicker({ uris, onChange }: Props) {
  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      onChange([...uris, result.assets[0].uri]);
    }
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      allowsMultipleSelection: true,
    });
    if (!result.canceled) {
      onChange([...uris, ...result.assets.map((a) => a.uri)]);
    }
  }

  function removeAt(index: number) {
    onChange(uris.filter((_, i) => i !== index));
  }

  return (
    <View>
      <View style={styles.buttonsRow}>
        <Pressable style={styles.button} onPress={takePhoto}>
          <Ionicons name="camera" size={18} color="#1F6FEB" />
          <Text style={styles.buttonText}>Tirar foto</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={pickFromLibrary}>
          <Ionicons name="images" size={18} color="#1F6FEB" />
          <Text style={styles.buttonText}>Galeria</Text>
        </Pressable>
      </View>

      {uris.length > 0 && (
        <ScrollView horizontal style={styles.previewRow} showsHorizontalScrollIndicator={false}>
          {uris.map((uri, index) => (
            <View key={uri} style={styles.previewWrapper}>
              <Image source={{ uri }} style={styles.previewImage} />
              <Pressable style={styles.removeBadge} onPress={() => removeAt(index)}>
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  buttonsRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#1F6FEB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  buttonText: { color: '#1F6FEB', fontWeight: '600' },
  previewRow: { marginTop: 10 },
  previewWrapper: { marginRight: 8, position: 'relative' },
  previewImage: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#F3F4F6' },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
