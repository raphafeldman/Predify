import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { fontFamily, fontSize, radius } from '../../lib/theme';

interface Props {
  label: string;
  color: string;
  textColor?: string;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, color, textColor = '#fff', style }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor: color }, style]}>
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  text: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
  },
});
