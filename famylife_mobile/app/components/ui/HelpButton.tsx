// components/ui/HelpButton.tsx
// Bouton icône « ? » qui ouvre la page d'aide web (la même que celle de la
// vitrine). Calqué sur NotificationBell : même gabarit 40×40, même pastille
// bordée, pour qu'il s'aligne naturellement à côté de la cloche en haut à
// droite des écrans principaux.
//
// L'URL est surchargeable via app.json → expo.extra.helpUrl (même mécanisme que
// les URLs d'API dans src/services/apiClient.ts), MAIS elle a un repli en dur.
//
// Pourquoi ce repli : `expo.extra` est figé dans le manifeste au moment du
// bundle. Un APK construit avant l'ajout de la clé — ou un Expo Go qui a gardé
// son manifeste en cache — reçoit `helpUrl === undefined`. La version
// précédente faisait alors un `return` silencieux : le bouton semblait cassé
// (« ne renvoie nulle part ») sans le moindre message. Un bouton visible doit
// TOUJOURS mener quelque part.
import React from 'react';
import { Pressable, StyleSheet, Linking, Alert } from 'react-native';
import Constants from 'expo-constants';
import { HelpCircle } from 'lucide-react-native';
import { borderRadius, shadows } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';

const AIDE_URL_PAR_DEFAUT = 'https://familyfe.dkpsolution.tech/aide.html';

const extra = (Constants.expoConfig?.extra ?? {}) as { helpUrl?: string };

export default function HelpButton() {
  const { colors } = useTheme();
  const { t } = useT();

  const openHelp = async () => {
    // Config si elle existe, sinon l'URL en dur : jamais de cul-de-sac.
    const url = extra.helpUrl || AIDE_URL_PAR_DEFAUT;
    try {
      await Linking.openURL(url);
    } catch {
      // Aucun navigateur disponible : on le dit, au lieu de ne rien faire.
      Alert.alert(t('common.aide'), url);
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
