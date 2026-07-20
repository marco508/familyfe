// app/(app)/decisions.tsx
// ANNEXE V7 — "Décisions" : fusion de l'ancien onglet Votes et de l'écran
// Règles. Voter une règle EST un vote : les deux écrans manipulaient le même
// objet (`regleService` crée un vote quand on soumet une règle au vote) tout en
// vivant à deux endroits différents du menu. Ils deviennent deux segments.
//
// Les corps vivent dans `components/sections/VotesSection` et `ReglesSection`
// (extraits des anciens écrans, sans en-tête : il est fourni une seule fois ici).
// `(tabs)/votes.tsx` et `(app)/regles.tsx` redirigent désormais vers cet écran.
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import ModuleInactif from '../components/ModuleInactif';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';
import { useMaison } from '../src/contexts/MaisonContext';
import { Segmented } from '../components/ui';
import VotesSection from '../components/sections/VotesSection';
import ReglesSection from '../components/sections/ReglesSection';
import { typography, spacing } from '../theme/designTokens';

type Segment = 'votes' | 'regles';

export default function DecisionsScreen() {
  const { colors } = useTheme();
  const { t } = useT();
  const { isModuleActif } = useMaison();
  // `?segment=regles` permet aux anciens liens vers `(app)/regles` d'atterrir
  // directement sur le bon segment.
  const params = useLocalSearchParams<{ segment?: string }>();
  const [segment, setSegment] = useState<Segment>(params.segment === 'regles' ? 'regles' : 'votes');

  // ANNEXE V8 — la route reste vivante ; on explique au lieu de rediriger.
  if (!isModuleActif('decisions')) return <ModuleInactif cle="decisions" />;

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>🗳️ {t('decisions.titre')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.segmentedWrap}>
        <Segmented
          value={segment}
          onChange={setSegment}
          options={[
            { value: 'votes', label: t('nav.votes') },
            { value: 'regles', label: t('regles.titre') },
          ]}
        />
      </View>

      <View style={styles.flex}>
        {segment === 'votes' ? <VotesSection /> : <ReglesSection />}
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.md,
  },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.extrabold },
  segmentedWrap: { paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
});
