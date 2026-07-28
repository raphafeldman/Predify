import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RecordType } from '../lib/types';
import { cardShadow, colors, fontFamily, fontSize, radius, spacing } from '../lib/theme';
import { Badge } from './ui/Badge';
import { CommentsThread } from './CommentsThread';
import { RemoteImage } from './RemoteImage';

interface Props {
  recordType: RecordType;
  recordId: string;
  title: string;
  subtitle?: string;
  badge?: { label: string; color: string };
  photoPaths?: string[];
  children?: ReactNode;
}

export function RecordCard({
  recordType,
  recordId,
  title,
  subtitle,
  badge,
  photoPaths,
  children,
}: Props) {
  const [showComments, setShowComments] = useState(false);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {badge && <Badge label={badge.label} color={badge.color} />}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}

      {photoPaths && photoPaths.length > 0 && (
        <ScrollView horizontal style={styles.photosRow} showsHorizontalScrollIndicator={false}>
          {photoPaths.map((path) => (
            <RemoteImage key={path} path={path} style={styles.photo} />
          ))}
        </ScrollView>
      )}

      <Pressable style={styles.commentsToggleRow} onPress={() => setShowComments((v) => !v)}>
        <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.primary} />
        <Text style={styles.commentsToggle}>
          {showComments ? 'Ocultar comentários' : 'Comentários'}
        </Text>
      </Pressable>

      {showComments && <CommentsThread recordType={recordType} recordId={recordId} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...cardShadow,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    flex: 1,
    marginRight: spacing.sm,
    color: colors.textPrimary,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  photosRow: { marginTop: spacing.md },
  photo: { width: 64, height: 64, borderRadius: radius.md, marginRight: spacing.sm, backgroundColor: colors.surfaceAlt },
  commentsToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  commentsToggle: { fontFamily: fontFamily.semibold, color: colors.primary, fontSize: fontSize.sm },
});
