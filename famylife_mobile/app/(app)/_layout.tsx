// app/(app)/_layout.tsx
// Zone protégée : nécessite d'être authentifié. Si l'utilisateur n'a encore
// aucune maison, on le redirige vers l'onboarding (créer / rejoindre).
import { Redirect, Stack, usePathname } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../src/contexts/AuthContext';
import { useMaison } from '../src/contexts/MaisonContext';
import { useTheme } from '../src/contexts/ThemeContext';
import RulesReminderModal from '../components/RulesReminderModal';

export default function AppLayout() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { hasMaison, loading: maisonLoading, initialized } = useMaison();
  const pathname = usePathname();
  const { colors } = useTheme();

  if (authLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary.main} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  // Tant que la liste n'a pas été chargée au moins une fois avec succès, on
  // affiche un loader plutôt que de rediriger (évite un renvoi injustifié vers
  // l'onboarding sur une simple erreur/latence réseau).
  if (maisonLoading || !initialized) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary.main} />
      </View>
    );
  }

  const onOnboarding = pathname?.includes('onboarding');
  if (!hasMaison && !onOnboarding) {
    return <Redirect href="/(app)/onboarding" />;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="membres/ajouter" options={{ presentation: 'modal' }} />
        <Stack.Screen name="activites/[id]" />
        <Stack.Screen name="votes/[id]" />
        <Stack.Screen name="evenements/[id]" />
        <Stack.Screen name="notifications" options={{ presentation: 'modal' }} />
        {/* ANNEXE V3 — écrans accessibles depuis l'onglet "Plus" */}
        <Stack.Screen name="courses" />
        <Stack.Screen name="depenses" />
        <Stack.Screen name="menu" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="boutique" />
        <Stack.Screen name="defis" />
        <Stack.Screen name="classement" />
        <Stack.Screen name="reglages" />
        {/* ANNEXE V4 — Tâches, Règles, Portefeuille immobilier */}
        <Stack.Screen name="taches" />
        <Stack.Screen name="regles" />
        <Stack.Screen name="portefeuille" />
        {/* ANNEXE V6 — Invitation partageable, moteur d'équité */}
        <Stack.Screen name="inviter" />
        <Stack.Screen name="equite" />
      </Stack>
      {/* ANNEXE V4 — rappel des règles à la connexion (modale non bloquante). */}
      <RulesReminderModal />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
