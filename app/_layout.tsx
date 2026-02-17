import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useState } from 'react';

import Loader from '@/components/Loader';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppProviders } from '@/providers/AppProviders';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [showLoader, setShowLoader] = useState(true);

  return (
    <AppProviders>
      {showLoader ? <Loader onComplete={() => setShowLoader(false)} /> : null}
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerBackTitleVisible: false, headerBackTitle: "" }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ title: 'Login' }} />
          <Stack.Screen name="register" options={{ title: 'Register' }} />
          <Stack.Screen name="mfa" options={{ title: 'Two-Factor' }} />
          <Stack.Screen name="wallet" options={{ title: 'Wallet' }} />
          <Stack.Screen name="withdraw" options={{ title: 'Withdraw' }} />
          <Stack.Screen name="promotions" options={{ title: 'Promotions' }} />
          <Stack.Screen name="help-center" options={{ title: 'Help Center' }} />
          <Stack.Screen name="markets/[eventId]" options={{ title: 'Markets' }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AppProviders>
  );
}
