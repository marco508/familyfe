// app/index.tsx
import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from './src/contexts/AuthContext';
import { useTheme } from './src/contexts/ThemeContext';

export default function Index() {
  const { isAuthenticated, loading } = useAuth();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary.main} />
      </View>
    );
  }

  return <Redirect href={isAuthenticated ? '/(app)/(tabs)' : '/(auth)/login'} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
