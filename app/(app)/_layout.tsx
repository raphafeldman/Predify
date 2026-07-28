import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Slot, Tabs } from 'expo-router';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { CreateCondominioScreen } from '../../components/CreateCondominioScreen';
import { Sidebar } from '../../components/Sidebar';
import { useAuth } from '../../lib/auth-context';
import { registerForPushNotificationsAsync } from '../../lib/notifications';
import { colors, layout } from '../../lib/theme';

export default function AppLayout() {
  const { session, profile, isPlatformAdmin, loading } = useAuth();

  useEffect(() => {
    if (session?.user?.id) {
      registerForPushNotificationsAsync(session.user.id);
    }
  }, [session?.user?.id]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  if (!isPlatformAdmin && profile && !profile.condominio_id) {
    return <CreateCondominioScreen />;
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webRoot}>
        <Sidebar />
        <View style={styles.webContentOuter}>
          <View style={styles.webContentInner}>
            <Slot />
          </View>
        </View>
      </View>
    );
  }

  return (
    <Tabs screenOptions={{ headerTitleAlign: 'center', tabBarActiveTintColor: colors.primary }}>
      <Tabs.Screen
        name="index"
        options={{
          title: isPlatformAdmin ? 'Administração' : profile?.role === 'sindico' ? 'Painel' : 'Rotina',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="ordens"
        options={{
          title: 'Ordens',
          tabBarIcon: ({ color, size }) => <Ionicons name="clipboard-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="manutencao"
        options={{
          title: 'Manutenção',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="construct" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="relatorios"
        options={{
          title: 'Relatórios',
          tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Mais',
          tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="mensagens" options={{ href: null, title: 'Mensagens' }} />
      <Tabs.Screen name="documentos" options={{ href: null, title: 'Documentos' }} />
      <Tabs.Screen name="historico" options={{ href: null, title: 'Histórico' }} />
      <Tabs.Screen name="equipe" options={{ href: null, title: 'Equipe' }} />
      <Tabs.Screen name="equipamentos" options={{ href: null, title: 'Equipamentos' }} />
      <Tabs.Screen name="rotinas" options={{ href: null, title: 'Rotinas' }} />
      <Tabs.Screen name="prestadores" options={{ href: null, title: 'Prestadores' }} />
      <Tabs.Screen name="admin" options={{ href: null, title: 'Administração' }} />
      <Tabs.Screen name="admin-condominio" options={{ href: null, title: 'Condomínio' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  webRoot: { flex: 1, flexDirection: 'row', backgroundColor: colors.surfaceAlt },
  webContentOuter: { flex: 1, alignItems: 'center' },
  webContentInner: { flex: 1, width: '100%', maxWidth: layout.maxContentWidth },
});
