// components/ui/HelpButton.tsx
// Bouton icône « ? » qui ouvre la page d'aide web (la même que celle de la
// vitrine). Calqué sur NotificationBell : même gabarit 40×40, même pastille
// bordée, pour qu'il s'aligne naturellement à côté de la cloche en haut à
// droite des écrans principaux.
//
// L'URL n'est PAS codée en dur ici : elle vient de app.json → expo.extra.helpUrl
// (même mécanisme que les URLs d'API dans src/services/apiClient.ts). Si la clé
// manque, le bouton ne fait rien plutôt que de planter.
import React from 'react';
import { Pressable, StyleSheet, Linking } from 'react-native';
import Constants from 'expo-constants';
import { HelpCircle } from 'lucide-react-native';
import { borderRadius, shadows } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';

const extra = (Constants.expoConfig?.extra ?? {}) as { helpUrl?: string };

export default function HelpButton() {
  const { colors } = useTheme();
  const { t } = useT();

  const openHelp = async () => {
    const url = extra.helpUrl;
    // Repli silencieux : pas d'URL configurée → on ne tente rien.
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      // Aucun navigateur disponible : on n'interrompt pas l'utilisateur.
    }
  };

  return (
    <Pressable
      onPress={openHelp}
      style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.border }, shadows.soft]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('common.aide')}
    >
      <HelpCircle size={18} color={colors.text.dark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
});
