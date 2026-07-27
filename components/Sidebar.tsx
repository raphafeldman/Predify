import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth-context';

interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  sindicoOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Início', icon: 'home' },
  { href: '/ocorrencias', label: 'Ocorrências', icon: 'alert-circle' },
  { href: '/manutencao', label: 'Manutenção', icon: 'construct' },
  { href: '/documentos', label: 'Documentos', icon: 'document-text' },
  { href: '/historico', label: 'Histórico', icon: 'time' },
  { href: '/equipe', label: 'Equipe', icon: 'people', sindicoOnly: true },
  { href: '/perfil', label: 'Perfil', icon: 'person' },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Gestão do Condomínio</Text>

      <View style={styles.nav}>
        {NAV_ITEMS.filter((item) => !item.sindicoOnly || profile?.role === 'sindico').map(
          (item) => {
            const active = pathname === item.href;
            return (
              <Pressable
                key={item.href}
                style={[styles.navItem, active && styles.navItemActive]}
                onPress={() => router.push(item.href as never)}
              >
                <Ionicons name={item.icon} size={18} color={active ? '#1F6FEB' : '#6B7280'} />
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          }
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.userName}>{profile?.full_name}</Text>
        <Text style={styles.userRole}>{profile?.role === 'sindico' ? 'Síndico' : 'Funcionário'}</Text>
        <Pressable onPress={signOut}>
          <Text style={styles.signOut}>Sair</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 220,
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    justifyContent: 'space-between',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 24 },
  nav: { gap: 4 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  navItemActive: { backgroundColor: '#EFF6FF' },
  navLabel: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
  navLabelActive: { color: '#1F6FEB' },
  footer: { borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 16 },
  userName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  userRole: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  signOut: { fontSize: 13, color: '#DC2626', fontWeight: '600', marginTop: 10 },
});
