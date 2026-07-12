import { Stack } from 'expo-router';
import ScreenBackground from '../components/ScreenBackground';

export default function AuthLayout() {
  return (
    <ScreenBackground>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
      </Stack>
    </ScreenBackground>
  );
}
