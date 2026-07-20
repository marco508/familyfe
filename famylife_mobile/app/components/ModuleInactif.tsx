// components/ModuleInactif.tsx — ANNEXE V8 (découverte progressive).
//
// Écran de repli quand on atteint un module éteint. Les routes des modules
// restent VIVANTES (liens directs, notifications d'avant la désactivation,
// historique de navigation) : on ne redirige donc pas de force — une
// redirection silencieuse donne l'impression que l'app est cassée. On explique,
// et on propose d'activer.
//
// Le bouton n'apparaît qu'à qui peut réellement agir (`isGestion` = le miroir
// de `require_gestion` côté API) ; les autres reçoivent la marche à suivre.
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import ScreenBackground from './ScreenBackground';
import { CandyButton, EmptyState } from './ui';
import { useT } from '../src/i18n';
import { useTheme } from '../src/contexts/ThemeContext';
import { useMaison } from '../src/contexts/MaisonContext';
import { ModuleCle } from '../src/services/maisonService';
import { typography, spacing } from '../theme/designTokens';

const EMOJIS: Record<ModuleCle, string> = {
  courses: '🛒',
  depenses: '💸',
  decisions: '🗳️',
  jeu: '🏆',
  portefeuille: '🏘️',
  chat: '💬',
};

export default function ModuleInactif({ cle }: { cle: ModuleCle }) {
  const { colors } = useTheme();
  const { t } = useT();
  const { isGestion } = useMaison();

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>{t(`modules.${cle}Titre`)}</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.body}>
        <EmptyState
          emoji={EMOJIS[cle]}
          title={t('modules.inactifTitre')}
          // On rappelle le bénéfice du module : c'est le moment où la question
          // « à quoi ça sert ? » se pose vraiment.
          message={`${t(`modules.${cle}Desc`)}\n\n${
            isGestion ? t('modules.inactifMessage') : t('modules.inactifMessageMembre')
          }`}
          action={
            isGestion ? (
              <CandyButton
                label={t('modules.inactifAction')}
                onPress={() => router.push('/(app)/modules')}
                variant="pink"
              />
            ) : undefined
          }
        />
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.md,
  },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.extrabold },
  body: { flex: 1, justifyContent: 'center' },
});
