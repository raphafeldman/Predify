import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import { Logo } from '../../components/ui/Logo';
import { useAuth } from '../../lib/auth-context';
import { colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';

export default function PerfilScreen() {
  const { profile, isPlatformAdmin, session, signOut } = useAuth();
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.logoRow}>
        <Logo />
      </View>

      <Card style={styles.card}>
        <Text style={styles.name}>{profile?.full_name ?? (isPlatformAdmin ? 'Administrador da plataforma' : '—')}</Text>
        <Text style={styles.role}>
          {isPlatformAdmin ? 'Admin da plataforma' : profile?.role === 'sindico' ? 'Síndico' : 'Funcionário'}
        </Text>
        <Text style={styles.detail}>{session?.user.email}</Text>
        {profile?.phone ? <Text style={styles.detail}>{profile.phone}</Text> : null}
      </Card>

      {!isPlatformAdmin && (
        <>
          <Pressable style={styles.linkRow} onPress={() => router.push('/mensagens')}>
            <Ionicons name="notifications-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.linkText}>Mensagens</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
          </Pressable>

          <Pressable style={styles.linkRow} onPress={() => router.push('/encomendas')}>
            <Ionicons name="cube-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.linkText}>Encomendas</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
          </Pressable>

          <Pressable style={styles.linkRow} onPress={() => router.push('/documentos')}>
            <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.linkText}>Documentos</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
          </Pressable>

          <Pressable style={styles.linkRow} onPress={() => router.push('/equipamentos')}>
            <Ionicons name="hardware-chip-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.linkText}>Equipamentos</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
          </Pressable>

          <Pressable style={styles.linkRow} onPress={() => router.push('/fornecedores')}>
            <Ionicons name="business-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.linkText}>Fornecedores</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
          </Pressable>

          <Pressable style={styles.linkRow} onPress={() => router.push('/prestadores')}>
            <Ionicons name="briefcase-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.linkText}>Prestadores</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
          </Pressable>

          <Pressable style={styles.linkRow} onPress={() => router.push('/historico')}>
            <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.linkText}>Ver histórico completo</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
          </Pressable>
        </>
      )}

      {isPlatformAdmin && (
        <Pressable style={styles.linkRow} onPress={() => router.push('/admin')}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.linkText}>Administração</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
        </Pressable>
      )}

      {profile?.role === 'sindico' && (
        <>
          <Pressable style={styles.linkRow} onPress={() => router.push('/unidades')}>
            <Ionicons name="business-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.linkText}>Gerenciar unidades</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
          </Pressable>
          <Pressable style={styles.linkRow} onPress={() => router.push('/rotinas')}>
            <Ionicons name="repeat-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.linkText}>Gerenciar rotinas</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
          </Pressable>
          <Pressable style={styles.linkRow} onPress={() => router.push('/equipe')}>
            <Ionicons name="people-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.linkText}>Gerenciar equipe</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
          </Pressable>
        </>
      )}

      <Pressable style={styles.logoutButton} onPress={signOut}>
        <Text style={styles.logoutText}>Sair</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing['3xl'] },
  logoRow: { alignItems: 'center', marginBottom: spacing.lg },
  card: { marginBottom: spacing.lg },
  name: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.textPrimary },
  role: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.primary, marginTop: spacing.xs },
  detail: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  linkText: { flex: 1, fontFamily: fontFamily.semibold, fontSize: fontSize.base, color: colors.textPrimary },
  chevron: { marginLeft: 'auto' },
  logoutButton: {
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  logoutText: { fontFamily: fontFamily.bold, color: colors.danger },
});
