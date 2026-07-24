import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RecordType } from '../lib/types';
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
        {badge && (
          <View style={[styles.badge, { backgroundColor: badge.color }]}>
            <Text style={styles.badgeText}>{badge.label}</Text>
          </View>
        )}
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

      <Pressable onPress={() => setShowComments((v) => !v)}>
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
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8, color: '#111827' },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  photosRow: { marginTop: 10 },
  photo: { width: 64, height: 64, borderRadius: 8, marginRight: 6, backgroundColor: '#F3F4F6' },
  commentsToggle: { marginTop: 10, color: '#1F6FEB', fontSize: 13, fontWeight: '600' },
});
