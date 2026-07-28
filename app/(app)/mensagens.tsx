import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import type { Notification } from '../../lib/types';

function formatRelativeDateTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return `Hoje ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Ontem ${time}`;
  return date.toLocaleDateString('pt-BR');
}

export default function MensagensScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setNotifications(data as Notification[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    if (!session?.user.id) return;
    const channel = supabase
      .channel('notifications-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, session?.user.id]);

  async function openNotification(item: Notification) {
    if (!item.read) {
      await supabase.from('notifications').update({ read: true }).eq('id', item.id);
      load();
    }
    if (item.record_type === 'occurrence') {
      router.push('/ordens');
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
    load();
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Mensagens</Text>
        {unreadCount > 0 && (
          <Pressable onPress={markAllRead}>
            <Text style={styles.markAllLink}>Marcar todas como lidas</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="notifications-outline"
              title="Nenhuma mensagem por aqui"
              subtitle="Avisos sobre ordens de serviço atribuídas ou concluídas aparecem aqui."
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => openNotification(item)}>
            {!item.read && <View style={styles.unreadDot} />}
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, !item.read && styles.rowTitleUnread]}>{item.title}</Text>
              <Text style={styles.rowBodyText}>{item.body}</Text>
              <Text style={styles.rowDate}>{formatRelativeDateTime(item.created_at)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.textPrimary },
  markAllLink: { fontFamily: fontFamily.semibold, color: colors.primary, fontSize: fontSize.sm },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginTop: 6,
  },
  rowBody: { flex: 1 },
  rowTitle: { fontFamily: fontFamily.medium, fontSize: fontSize.base, color: colors.textSecondary },
  rowTitleUnread: { fontFamily: fontFamily.bold, color: colors.textPrimary },
  rowBodyText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  rowDate: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
});
