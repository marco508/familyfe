// components/sections/EquiteSection.tsx
// ANNEXE V7 — Corps de l'écran "Équité" (moteur d'équité, ANNEXE V6), extrait
// de l'ancien `(app)/equite.tsx` pour être rendu comme segment du hub Équité.
// Ne rend ni fond ni en-tête : le hub s'en charge (pas d'en-tête dupliqué).
//
// Montre, par membre, la part de la charge domestique (tâches validées) sur la
// période choisie : barres colorées, repère de moyenne attendue, bandeau si la
// charge est déséquilibrée, suggestion du·de la prochain·e volontaire.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';
import { useMaison } from '../../src/contexts/MaisonContext';
import { useT } from '../../src/i18n';
import { useTheme } from '../../src/contexts/ThemeContext';
import statsService, { Equite, PeriodeEquite } from '../../src/services/statsService';
import { Avatar, CandyCard, EmptyState, Segmented } from '../ui';
import { typography, spacing, borderRadius, shadows } from '../../theme/designTokens';

// Couleurs pleines (candy) qui se succèdent pour chaque barre de membre —
// simple repère visuel, pas de sens particulier par couleur.
type CandyKey = 'pink' | 'purple' | 'blue' | 'green' | 'orange' | 'yellowDark';
const BAR_COLOR_KEYS: CandyKey[] = ['pink', 'purple', 'blue', 'green', 'orange', 'yellowDark'];

interface Props {
  /** Marge basse du contenu (barre d'onglets flottante dans l'onglet Équité). */
  bottomInset?: number;
}

export default function EquiteSection({ bottomInset = spacing['4xl'] }: Props) {
  const { colors, gradients } = useTheme();
  const { t } = useT();
  const { maisonActive } = useMaison();

  const [periode, setPeriode] = useState<PeriodeEquite>('semaine');
  const [equite, setEquite] = useState<Equite | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (p: PeriodeEquite) => {
      if (!maisonActive) {
        setEquite(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const res = await statsService.equite(maisonActive.id, p);
      setEquite(res.data ?? null);
      setLoading(false);
    },
    [maisonActive]
  );

  useFocusEffect(
    useCallback(() => {
      load(periode);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  const handlePeriodeChange = (p: PeriodeEquite) => {
    setPeriode(p);
    load(p);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load(periode);
    setRefreshing(false);
  };

  const barColor = (idx: number) => colors.candy[BAR_COLOR_KEYS[idx % BAR_COLOR_KEYS.length]];

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
    >
      <View style={styles.periodeWrap}>
        <Segmented
          value={periode}
          onChange={handlePeriodeChange}
          options={[
            { value: 'semaine', label: t('equite.semaine') },
            { value: 'mois', label: t('equite.mois') },
          ]}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
      ) : !equite || equite.total_taches === 0 ? (
        <EmptyState emoji="⚖️" title={t('equite.videTitre')} message={t('equite.videMessage')} />
      ) : (
        <>
          {equite.desequilibre ? (
            <View style={[styles.bandeau, { backgroundColor: 'rgba(255,138,61,0.16)', borderColor: colors.candy.orange }]}>
              <Text style={styles.bandeauEmoji}>⚖️</Text>
              <Text style={[styles.bandeauText, { color: colors.candy.orangeDark }]}>{t('equite.desequilibre')}</Text>
            </View>
          ) : null}

          {equite.suggestion ? (
            <Pressable onPress={() => router.push('/(app)/(tabs)/taches')}>
              <LinearGradient colors={gradients.candyGreen} style={[styles.suggestionCard, shadows.candyGreen]}>
                <Avatar name={equite.suggestion.nom} image={equite.suggestion.image} size={44} ringColor="rgba(255,255,255,0.7)" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionLabel}>{t('equite.suggestionLabel')}</Text>
                  <Text style={styles.suggestionNom} numberOfLines={1}>
                    {t('equite.suggestionPrefix')} {equite.suggestion.nom}
                  </Text>
                </View>
                <ChevronRight size={20} color="#FFFFFF" />
              </LinearGradient>
            </Pressable>
          ) : null}

          <View style={styles.moyenneRow}>
            <View style={[styles.moyenneDot, { backgroundColor: colors.text.dark }]} />
            <Text style={[styles.moyenneText, { color: colors.text.body }]}>
              {t('equite.moyenneAttendue')} : {equite.moyenne_pct}%
            </Text>
          </View>

          {equite.membres.map((m, idx) => (
            <CandyCard key={m.utilisateur_id} style={styles.membreCard}>
              <View style={styles.membreTopRow}>
                <Avatar name={m.nom} image={m.image} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.membreNom, { color: colors.text.dark }]} numberOfLines={1}>
                    {m.nom}
                  </Text>
                  <Text style={[styles.membreMeta, { color: colors.text.body }]}>
                    {m.taches_faites} {m.taches_faites > 1 ? t('equite.taches') : t('equite.tache')}
                  </Text>
                </View>
                <Text style={[styles.membrePct, { color: barColor(idx) }]}>{m.part_pct}%</Text>
              </View>
              <View style={[styles.barTrack, { backgroundColor: colors.surface }]}>
                <View style={[styles.barFill, { width: `${Math.min(100, m.part_pct)}%`, backgroundColor: barColor(idx) }]} />
                <View
                  pointerEvents="none"
                  style={[
                    styles.barMoyenneMarker,
                    { left: `${Math.min(100, equite.moyenne_pct)}%`, backgroundColor: colors.text.dark },
                  ]}
                />
              </View>
            </CandyCard>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  periodeWrap: { marginBottom: spacing.lg },
  bandeau: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  bandeauEmoji: { fontSize: 18 },
  bandeauText: { flex: 1, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: borderRadius.card,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  suggestionLabel: { color: 'rgba(255,255,255,0.85)', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  suggestionNom: { color: '#FFFFFF', fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold, marginTop: 2 },
  moyenneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  moyenneDot: { width: 8, height: 8, borderRadius: 4 },
  moyenneText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  membreCard: { marginBottom: spacing.md },
  membreTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  membreNom: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  membreMeta: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: 2 },
  membrePct: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.black },
  barTrack: { height: 12, borderRadius: borderRadius.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: borderRadius.pill },
  barMoyenneMarker: { position: 'absolute', top: 0, width: 2, height: '100%', opacity: 0.6 },
});
