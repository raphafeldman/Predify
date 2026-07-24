import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../lib/auth-context';

export default function PerfilScreen() {
  const { profile, session, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{profile?.full_name ?? '—'}</Text>
        <Text style={styles.role}>
          {profile?.role === 'sindico' ? 'Síndico' : 'Funcionário'}
        </Text>
        <Text style={styles.detail}>{session?.user.email}</Text>
        {profile?.phone ? <Text style={styles.detail}>{profile.phone}</Text> : null}
      </View>

      <Pressable style={styles.logoutButton} onPress={signOut}>
        <Text style={styles.logoutText}>Sair</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  card: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 18,
    marginBottom: 24,
  },
  name: { fontSize: 20, fontWeight: '700', color: '#111827' },
  role: { fontSize: 14, color: '#1F6FEB', fontWeight: '600', marginTop: 4 },
  detail: { fontSize: 14, color: '#6B7280', marginTop: 8 },
  logoutButton: {
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutText: { color: '#DC2626', fontWeight: '600' },
});
