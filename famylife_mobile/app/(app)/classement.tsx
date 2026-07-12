// app/(app)/classement.tsx — Classement des points + badges (ANNEXE V3)
// Sélecteur de période (semaine/mois/total), médailles 🥇🥈🥉, et badges par
// membre (calculés côté serveur — voir classementService.badges).
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { useMaison } from '../src/contexts/MaisonContext';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';
import classementService, { ClassementEntry, MembreBadges, PeriodeClassement } from '../src/services/classementService';
import { Avatar, CandyCard, EmptyState, SectionTitle, Segmented } from '../components/ui';
import { typography, spacing, borderRadius } from '../theme/designTokens';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function ClassementScreen() {
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

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>🥇 {t('classement.titre')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.segmentedWrap}>
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

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
        ) : entries.length === 0 ? (
          <EmptyState emoji="🥇" title={t('common.aucunResultat')} />
        ) : (
          entries.map((e, idx) => (
            <CandyCard key={e.utilisateur_id} style={styles.rankCard}>
              <View style={styles.rankRow}>
                <Text style={styles.rankMedal}>{MEDALS[idx] ?? `#${idx + 1}`}</Text>
                <Avatar name={e.nom} image={e.image} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rankNom, { color: colors.text.dark }]} numberOfLines={1}>
                    {e.nom}{e.utilisateur_id === user?.id ? ` ${t('maison.vous')}` : ''}
                  </Text>
                </View>
                <Text style={[styles.rankPoints, { color: colors.candy.pinkDark }]}>{e.points} pts</Text>
              </View>
            </CandyCard>
          ))
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
                      <View key={b.code} style={[styles.badgeChip, { backgroundColor: colors.candy.cream, borderColor: colors.border }]}>
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
  segmentedWrap: { paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  container: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing['4xl'] },
  rankCard: { marginBottom: spacing.sm },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rankMedal: { fontSize: 22, width: 32, textAlign: 'center' },
  rankNom: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  rankPoints: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.black },
  badgeCard: { marginBottom: spacing.sm },
  badgeChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  badgeChip: { borderRadius: borderRadius.pill, borderWidth: 1.5, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  badgeChipText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  noBadge: { fontSize: typography.fontSize.sm, marginTop: spacing.sm },
});
