import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth-context';
import { colors, fontFamily, fontSize, radius, spacing } from '../lib/theme';
import { Logo } from './ui/Logo';

interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  sindicoOnly?: boolean;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Início', icon: 'home' },
  { href: '/ocorrencias', label: 'Ocorrências', icon: 'alert-circle' },
  { href: '/prestadores', label: 'Prestadores', icon: 'briefcase' },
  { href: '/equipamentos', label: 'Equipamentos', icon: 'hardware-chip' },
  { href: '/manutencao', label: 'Manutenção', icon: 'construct' },
  { href: '/rotinas', label: 'Rotinas', icon: 'repeat', sindicoOnly: true },
  { href: '/documentos', label: 'Documentos', icon: 'document-text' },
  { href: '/relatorios', label: 'Relatórios', icon: 'bar-chart', sindicoOnly: true },
  { href: '/historico', label: 'Histórico', icon: 'time' },
  { href: '/equipe', label: 'Equipe', icon: 'people', sindicoOnly: true },
  { href: '/admin', label: 'Administração', icon: 'shield-checkmark', adminOnly: true },
  { href: '/perfil', label: 'Perfil', icon: 'person' },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, isPlatformAdmin, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.logoRow}>
        <Logo />
      </View>

      <View style={styles.nav}>
        {NAV_ITEMS.filter((item) => {
          if (item.adminOnly) return isPlatformAdmin;
          if (isPlatformAdmin) return item.href === '/' || item.href === '/perfil';
          return !item.sindicoOnly || profile?.role === 'sindico';
        }).map((item) => {
          const active = pathname === item.href;
          return (
            <Pressable
              key={item.href}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => router.push(item.href as never)}
            >
              <Ionicons name={item.icon} size={18} color={active ? colors.primary : colors.textSecondary} />
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text style={styles.userName}>{profile?.full_name ?? 'Administrador da plataforma'}</Text>
        <Text style={styles.userRole}>
          {isPlatformAdmin ? 'Admin da plataforma' : profile?.role === 'sindico' ? 'Síndico' : 'Funcionário'}
        </Text>
        <Pressable onPress={signOut}>
          <Text style={styles.signOut}>Sair</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 232,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'space-between',
  },
  logoRow: { marginBottom: spacing.xl, paddingHorizontal: spacing.xs },
  nav: { gap: 2 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  navItemActive: { backgroundColor: colors.primaryLight },
  navLabel: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.textSecondary },
  navLabelActive: { color: colors.primary },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg },
  userName: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.textPrimary },
  userRole: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  signOut: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.danger, marginTop: spacing.md },
});
