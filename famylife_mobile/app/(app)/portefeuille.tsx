// app/(app)/portefeuille.tsx — Portefeuille immobilier (ANNEXE V4)
// Vue "patrimoine" : cartes des maisons dont l'appelant est chef (ou chef
// temporaire), avec type de logement, adresse résumée, pièces, membres, surface.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, MapPin, Users, DoorOpen, Ruler } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { useT } from '../src/i18n';
import { useTheme } from '../src/contexts/ThemeContext';
import portefeuilleService, { MaisonPortefeuille } from '../src/services/portefeuilleService';
import { CandyCard, EmptyState } from '../components/ui';
import { typography, spacing, borderRadius } from '../theme/designTokens';
import { logementIcon, logementLabel } from '../src/utils/logement';

export default function PortefeuilleScreen() {
  const { colors, gradients } = useTheme();
  const { t } = useT();

  const [maisons, setMaisons] = useState<MaisonPortefeuille[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await portefeuilleService.list();
      setMaisons(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const adresseResume = (m: MaisonPortefeuille) => {
    const parts = [m.ville, m.code_postal].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : t('logement.nonRenseigne');
  };

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>🏘️ {t('portefeuille.titre')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
      >
        <Text style={[styles.subtitle, { color: colors.text.body }]}>{t('portefeuille.sousTitre')}</Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
        ) : maisons.length === 0 ? (
          <EmptyState emoji="🏘️" title={t('portefeuille.aucuneMaison')} />
        ) : (
          maisons.map((m) => (
            <CandyCard key={m.id} style={styles.card} padded={false}>
              <LinearGradient colors={gradients.candyOrange} style={styles.cardHeader}>
                <Text style={styles.cardEmoji}>{m.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardNom} numberOfLines={1}>{m.nom}</Text>
                  <View style={styles.cardMetaRow}>
                    <MapPin size={14} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.cardMeta} numberOfLines={1}>{adresseResume(m)}</Text>
                  </View>
                </View>
                <View style={styles.logementBadge}>
                  <Text style={styles.logementBadgeIcon}>{logementIcon(m.type_logement)}</Text>
                  <Text style={styles.logementBadgeText}>{logementLabel(t, m.type_logement)}</Text>
                </View>
              </LinearGradient>
              <View style={styles.cardBody}>
                <View style={styles.statRow}>
                  <View style={styles.statItem}>
                    <DoorOpen size={16} color={colors.candy.purpleDark} />
                    <Text style={[styles.statText, { color: colors.text.dark }]}>
                      {m.nb_pieces} {t('portefeuille.pieces')}
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Users size={16} color={colors.candy.blueDark} />
                    <Text style={[styles.statText, { color: colors.text.dark }]}>
                      {m.nb_membres} {t('portefeuille.membres')}
                    </Text>
                  </View>
                  {m.surface ? (
                    <View style={styles.statItem}>
                      <Ruler size={16} color={colors.candy.greenDark} />
                      <Text style={[styles.statText, { color: colors.text.dark }]}>{m.surface} m²</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </CandyCard>
          ))
        )}
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
  container: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing['4xl'] },
  subtitle: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, marginBottom: spacing.lg },
  card: { marginBottom: spacing.md, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  cardEmoji: { fontSize: 32 },
  cardNom: { color: '#FFFFFF', fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.black },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cardMeta: { color: 'rgba(255,255,255,0.9)', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  logementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  logementBadgeIcon: { fontSize: 13 },
  logementBadgeText: { color: '#FFFFFF', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.extrabold },
  cardBody: { padding: spacing.lg },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.extrabold },
});
