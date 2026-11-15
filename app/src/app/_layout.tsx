import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConfirmProvider, ToastProvider } from '@/components/fx';
import { AuthProvider, useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync();

function Screens() {
  const { ready } = useAuth();
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const up = ready && (fontsLoaded || !!fontError);
  useEffect(() => {
    if (up) void SplashScreen.hideAsync();
  }, [up]);
  if (!up) return null;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Screen name="login" options={{ animation: 'fade' }} />
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="create" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="join" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="dare/[id]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <StatusBar style="light" />
            <Screens />
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
