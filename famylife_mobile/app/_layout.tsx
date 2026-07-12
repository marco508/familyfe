import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import { AuthProvider } from './src/contexts/AuthContext';
import { MaisonProvider } from './src/contexts/MaisonContext';
import { NotificationProvider } from './src/contexts/NotificationContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { LanguageProvider } from './src/i18n';

LogBox.ignoreLogs(['It looks like you might be using shared value']);

function RootStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <MaisonProvider>
                <NotificationProvider>
                  <RootStatusBar />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="(app)" />
                  </Stack>
                </NotificationProvider>
              </MaisonProvider>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
