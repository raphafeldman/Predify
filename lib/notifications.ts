import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Registra o token de push do dispositivo para o usuário logado.
 * No Expo Go, notificações remotas só funcionam no iOS (limitação da Expo
 * desde o SDK 53 no Android) — nesse caso a função apenas não faz nada.
 */
export async function registerForPushNotificationsAsync(userId: string) {
  if (!Device.isDevice) return;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    const { error } = await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, expo_push_token: tokenResponse.data }, { onConflict: 'expo_push_token' });
    if (error) {
      // Registro de push é best-effort e roda em segundo plano no login —
      // não há tela pra mostrar um erro pro usuário aqui, só log técnico.
      console.log('Não foi possível salvar o token de notificações push:', error.message);
    }
  } catch (error) {
    console.log('Não foi possível registrar notificações push:', error);
  }
}
