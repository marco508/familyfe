// components/sections/ClassementSection.tsx
// ANNEXE V7 — Corps de l'ancien écran `(app)/classement.tsx`, extrait pour être
// rendu comme segment du hub Équité. Ne rend ni fond ni en-tête.
// Classement des points + badges (ANNEXE V3) : sélecteur de période
// (semaine/mois/total), médailles 🥇🥈🥉, badges par membre.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useMaison } from '../../src/contexts/MaisonContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';
import classementService, { ClassementEntry, MembreBadges, PeriodeClassement } from '../../src/services/classementService';
import { Avatar, CandyCard, EmptyState, SectionTitle, Segmented } from '../ui';
import { typography, spacing, borderRadius } from '../../theme/designTokens';

const MEDALS = ['🥇', '🥈', '🥉'];

interface Props {
  bottomInset?: number;
}

export default function ClassementSection({ bottomInset = spacing['4xl'] }: Props) {
  const { maisonActive } = useMaison();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t } = useT();

  const [periode, setPeriode] = useState<PeriodeClassement>('total');
  const [entries, setEntries] = useState<ClassementEntry[]>([]);
  const [badges, setBadges] = useState<MembreBadges[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!maisonActive) {
      setEntries([]);
      setBadges([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [classRes, badgesRes] = await Promise.all([
        classementService.get(maisonActive.id, periode),
        classementService.badges(maisonActive.id),
      ]);
      setEntries(classRes.data ?? []);
      setBadges(badgesRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [maisonActive, periode]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Points du meneur = barre pleine ; les autres se comparent visuellement à lui.
  const maxPoints = Math.max(1, ...entries.map((e) => e.points));

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
    >
      <View style={styles.periodeWrap}>
        <Segmented
          value={periode}
          onChange={setPeriode}
          options={[
            { value: 'semaine', label: t('classement.semaine') },
            { value: 'mois', label: t('classement.mois') },
            { value: 'total', label: t('classement.total') },
          ]}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
      ) : entries.length === 0 ? (
        <EmptyState emoji="🥇" title={t('common.aucunResultat')} />
      ) : (
        entries.map((e, idx) => {
          const barColor = idx === 0 ? colors.candy.yellowDark : idx === 1 ? colors.secondary.main : colors.primary.main;
          return (
            <CandyCard key={e.utilisateur_id} style={styles.rankCard}>
              <View style={styles.rankRow}>
                <Text style={styles.rankMedal}>{MEDALS[idx] ?? `#${idx + 1}`}</Text>
                <Avatar name={e.nom} image={e.image} size={42} ringColor={idx === 0 ? colors.candy.yellowDark : undefined} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rankNom, { color: colors.text.dark }]} numberOfLines={1}>
                    {e.nom}{e.utilisateur_id === user?.id ? ` ${t('maison.vous')}` : ''}
                  </Text>
                  <View style={[styles.pointsBar, { backgroundColor: colors.surface }]}>
                    <View style={[styles.pointsBarFill, { width: `${Math.round((e.points / maxPoints) * 100)}%`, backgroundColor: barColor }]} />
                  </View>
                </View>
                <View style={[styles.coin, { backgroundColor: 'rgba(221,162,76,0.18)' }]}>
                  <Text style={[styles.coinText, { color: colors.candy.yellowDark }]}>🪙 {e.points}</Text>
                </View>
              </View>
            </CandyCard>
          );
        })
      )}

      {badges.length > 0 ? (
        <>
          <SectionTitle title={t('classement.badges')} emoji="🎖️" style={{ marginTop: spacing.xl }} />
          {badges.map((mb) => (
            <CandyCard key={mb.utilisateur_id} style={styles.badgeCard}>
              <View style={styles.rankRow}>
                <Avatar name={mb.nom} image={mb.image} size={36} />
                <Text style={[styles.rankNom, { color: colors.text.dark, flex: 1 }]} numberOfLines={1}>
                  {mb.nom}
                </Text>
              </View>
              {mb.badges.length === 0 ? (
                <Text style={[styles.noBadge, { color: colors.text.muted }]}>—</Text>
              ) : (
                <View style={styles.badgeChipsRow}>
                  {mb.badges.map((b) => (
                    <View key={b.code} style={[styles.badgeChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[styles.badgeChipText, { color: colors.text.dark }]}>{b.titre}</Text>
                    </View>
                  ))}
                </View>
              )}
            </CandyCard>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  periodeWrap: { marginBottom: spacing.lg },
  rankCard: { marginBottom: spacing.sm },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rankMedal: { fontSize: 22, width: 32, textAlign: 'center' },
  rankNom: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  rankPoints: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.black },
  pointsBar: { height: 8, borderRadius: borderRadius.pill, overflow: 'hidden', marginTop: 6 },
  pointsBarFill: { height: '100%', borderRadius: borderRadius.pill },
  coin: { borderRadius: borderRadius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  coinText: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.black },
  badgeCard: { marginBottom: spacing.sm },
  badgeChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  badgeChip: { borderRadius: borderRadius.pill, borderWidth: 1.5, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  badgeChipText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  noBadge: { fontSize: typography.fontSize.sm, marginTop: spacing.sm },
});
