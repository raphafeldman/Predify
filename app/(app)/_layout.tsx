import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Slot, Tabs } from 'expo-router';
import { ActivityIndicator, Platform, View } from 'react-native';
import { CreateCondominioScreen } from '../../components/CreateCondominioScreen';
import { Sidebar } from '../../components/Sidebar';
import { useAuth } from '../../lib/auth-context';
import { registerForPushNotificationsAsync } from '../../lib/notifications';

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
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Sidebar />
        <View style={{ flex: 1 }}>
          <Slot />
        </View>
      </View>
    );
  }

  return (
    <Tabs screenOptions={{ headerTitleAlign: 'center', tabBarActiveTintColor: '#1F6FEB' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: isPlatformAdmin ? 'Administração' : profile?.role === 'sindico' ? 'Painel' : 'Rotina',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="ocorrencias"
        options={{
          title: 'Ocorrências',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="alert-circle" color={color} size={size} />
          ),
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
        name="documentos"
        options={{
          title: 'Documentos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="historico" options={{ href: null, title: 'Histórico' }} />
      <Tabs.Screen name="equipe" options={{ href: null, title: 'Equipe' }} />
      <Tabs.Screen name="equipamentos" options={{ href: null, title: 'Equipamentos' }} />
      <Tabs.Screen name="rotinas" options={{ href: null, title: 'Rotinas' }} />
      <Tabs.Screen name="relatorios" options={{ href: null, title: 'Relatórios' }} />
      <Tabs.Screen name="prestadores" options={{ href: null, title: 'Prestadores' }} />
      <Tabs.Screen name="admin" options={{ href: null, title: 'Administração' }} />
      <Tabs.Screen name="admin-condominio" options={{ href: null, title: 'Condomínio' }} />
    </Tabs>
  );
}
