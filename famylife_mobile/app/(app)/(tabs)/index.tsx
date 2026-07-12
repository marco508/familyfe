// app/(app)/(tabs)/index.tsx
// Dashboard : maison active + sélecteur, résumé des activités du jour,
// prochains événements, votes ouverts.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarDays, ListChecks, BarChart3, ChevronRight, PartyPopper } from 'lucide-react-native';
import { useMaison } from '../../src/contexts/MaisonContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { useNotifications } from '../../src/contexts/NotificationContext';
import activiteService, { Activite } from '../../src/services/activiteService';
import evenementService, { Evenement } from '../../src/services/evenementService';
import voteService, { Vote } from '../../src/services/voteService';
import maisonService, { Anniversaire } from '../../src/services/maisonService';
import { CandyCard, SectionTitle, Badge, EmptyState, NotificationBell, Avatar, VisitorBanner } from '../../components/ui';
import { typography, spacing, borderRadius } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';
import { logementIcon, logementLabel } from '../../src/utils/logement';

function isSameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

export default function DashboardScreen() {
  const { colors, gradients } = useTheme();
  const { t, lang } = useT();
  const STATUT_LABEL: Record<string, string> = {
    a_faire: t('statut.aFaire'),
    en_cours: t('statut.enCours'),
    termine: t('statut.termine'),
  };
  const { user } = useAuth();
  const { maisons, maisonActive, selectMaison, loading: maisonLoading, isVisiteur } = useMaison();
  const { unreadCount, refresh: refreshNotifCount } = useNotifications();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [anniversaires, setAnniversaires] = useState<Anniversaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!maisonActive) {
      setActivites([]);
      setEvenements([]);
      setVotes([]);
      setAnniversaires([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [actRes, evtRes, voteRes, anniRes] = await Promise.all([
        activiteService.list(maisonActive.id),
        evenementService.list(maisonActive.id),
        voteService.list(maisonActive.id),
        maisonService.anniversaires(maisonActive.id),
      ]);
      setActivites(actRes.data ?? []);
      setEvenements(evtRes.data ?? []);
      setVotes(voteRes.data ?? []);
      setAnniversaires(anniRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [maisonActive]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      refreshNotifCount();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const today = new Date();
  const activitesDuJour = activites.filter(
    (a) => a.statut !== 'termine' && a.date_echeance && isSameDay(a.date_echeance, today)
  );
  const prochainEvenements = evenements
    .filter((e) => new Date(e.date_debut).getTime() >= today.getTime() - 1000 * 60 * 60 * 6)
    .slice(0, 3);
  const votesOuverts = votes.filter((v) => v.statut === 'ouvert').slice(0, 3);
  const anniversairesAujourdhui = anniversaires.filter((a) => a.aujourdhui);
  const anniversairesAVenir = anniversaires.filter((a) => !a.aujourdhui).slice(0, 4);

  if (maisonLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary.main} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.greeting, { color: colors.text.dark }]}>
          {t('accueil.salut')} {user?.nom?.split(' ')[0] || ''} 👋
        </Text>
        <NotificationBell count={unreadCount} onPress={() => router.push('/(app)/notifications')} />
      </View>

      {isVisiteur ? <VisitorBanner /> : null}

      {anniversairesAujourdhui.length > 0 ? (
        <LinearGradient colors={gradients.candyYellow} style={styles.birthdayBanner}>
          <PartyPopper size={26} color={colors.candy.white} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.birthdayBannerTitle, { color: colors.candy.white }]}>
              🎂 {t('accueil.joyeuxAnniversaire')} {anniversairesAujourdhui.map((a) => a.nom).join(', ')} !
            </Text>
            <Text style={styles.birthdayBannerSubtitle}>{t('accueil.grandJour')}</Text>
          </View>
        </LinearGradient>
      ) : null}

      {maisons.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.maisonSelector} contentContainerStyle={{ gap: spacing.sm }}>
          {maisons.map((m) => {
            const active = maisonActive?.id === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => selectMaison(m)}
                style={[
                  styles.maisonChip,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  active && { backgroundColor: colors.primary.main, borderColor: colors.primary.main },
                ]}
              >
                <Text style={styles.maisonChipEmoji}>{logementIcon(m.type_logement)}</Text>
                <Text style={[styles.maisonChipText, { color: active ? colors.candy.white : colors.text.body }]}>
                  {m.nom}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {maisonActive ? (
        <CandyCard style={styles.maisonCard}>
          <View style={styles.maisonHeader}>
            <Text style={styles.maisonEmoji}>{maisonActive.emoji}</Text>
            <View style={{ flex: 1 }}>
              <View style={styles.maisonNomRow}>
                <Text style={[styles.maisonNom, { color: colors.text.dark }]}>{maisonActive.nom}</Text>
                <View style={[styles.logementChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={styles.logementChipIcon}>{logementIcon(maisonActive.type_logement)}</Text>
                  <Text style={[styles.logementChipText, { color: colors.text.body }]}>
                    {logementLabel(t, maisonActive.type_logement)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.maisonMeta, { color: colors.text.body }]}>
                {maisonActive.nb_membres} {maisonActive.nb_membres > 1 ? t('accueil.membres') : t('accueil.membre')}
              </Text>
            </View>
            {maisonActive.role === 'chef' ? <Badge label={t('common.chef')} variant="yellow" /> : null}
          </View>
        </CandyCard>
      ) : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
      ) : (
        <>
          <SectionTitle
            title={t('accueil.aujourdhui')}
            emoji="✅"
            right={
              <Pressable onPress={() => router.push('/(app)/(tabs)/activites')} hitSlop={8}>
                <ChevronRight size={20} color={colors.text.muted} />
              </Pressable>
            }
          />
          {activitesDuJour.length === 0 ? (
            <CandyCard style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: colors.text.body }]}>{t('accueil.aucuneActivite')}</Text>
            </CandyCard>
          ) : (
            activitesDuJour.map((a) => (
              <Pressable key={a.id} onPress={() => router.push(`/(app)/activites/${a.id}`)}>
                <CandyCard style={styles.itemCard}>
                  <View style={styles.itemRow}>
                    <ListChecks size={18} color={colors.candy.orangeDark} />
                    <Text style={[styles.itemTitle, { color: colors.text.dark }]} numberOfLines={1}>{a.titre}</Text>
                    <Badge label={STATUT_LABEL[a.statut]} variant={a.statut === 'en_cours' ? 'blue' : 'orange'} />
                  </View>
                </CandyCard>
              </Pressable>
            ))
          )}

          <SectionTitle
            title={t('accueil.prochainsEvenements')}
            emoji="📅"
            right={
              <Pressable onPress={() => router.push('/(app)/(tabs)/agenda')} hitSlop={8}>
                <ChevronRight size={20} color={colors.text.muted} />
              </Pressable>
            }
            style={{ marginTop: spacing.lg }}
          />
          {prochainEvenements.length === 0 ? (
            <CandyCard style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: colors.text.body }]}>{t('accueil.rienPrevu')}</Text>
            </CandyCard>
          ) : (
            prochainEvenements.map((e) => (
              <CandyCard key={e.id} style={styles.itemCard}>
                <View style={styles.itemRow}>
                  <CalendarDays size={18} color={colors.candy.purpleDark} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: colors.text.dark }]} numberOfLines={1}>{e.titre}</Text>
                    <Text style={[styles.itemMeta, { color: colors.text.muted }]}>
                      {new Date(e.date_debut).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR', { day: '2-digit', month: 'short', hour: e.toute_la_journee ? undefined : '2-digit', minute: e.toute_la_journee ? undefined : '2-digit' })}
                    </Text>
                  </View>
                </View>
              </CandyCard>
            ))
          )}

          <SectionTitle
            title={t('accueil.votesOuverts')}
            emoji="🗳️"
            right={
              <Pressable onPress={() => router.push('/(app)/(tabs)/votes')} hitSlop={8}>
                <ChevronRight size={20} color={colors.text.muted} />
              </Pressable>
            }
            style={{ marginTop: spacing.lg }}
          />
          {votesOuverts.length === 0 ? (
            <CandyCard style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: colors.text.body }]}>{t('accueil.aucunVote')}</Text>
            </CandyCard>
          ) : (
            votesOuverts.map((v) => (
              <Pressable key={v.id} onPress={() => router.push(`/(app)/votes/${v.id}`)}>
                <CandyCard style={styles.itemCard}>
                  <View style={styles.itemRow}>
                    <BarChart3 size={18} color={colors.candy.blueDark} />
                    <Text style={[styles.itemTitle, { color: colors.text.dark }]} numberOfLines={1}>{v.question}</Text>
                    <Text style={[styles.itemMeta, { color: colors.text.muted }]}>
                      {v.total_voix} {v.total_voix > 1 ? t('accueil.votes') : t('accueil.vote')}
                    </Text>
                  </View>
                </CandyCard>
              </Pressable>
            ))
          )}

          {anniversairesAVenir.length > 0 ? (
            <>
              <SectionTitle title={t('accueil.anniversairesAVenir')} emoji="🎈" style={{ marginTop: spacing.lg }} />
              {anniversairesAVenir.map((a) => (
                <CandyCard key={a.id} style={styles.itemCard}>
                  <View style={styles.itemRow}>
                    <Avatar name={a.nom} image={a.image} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemTitle, { color: colors.text.dark }]} numberOfLines={1}>{a.nom}</Text>
                      <Text style={[styles.itemMeta, { color: colors.text.muted }]}>
                        {a.jours_restants === 1
                          ? `${t('accueil.dans')} 1 ${t('accueil.jour')}`
                          : `${t('accueil.dans')} ${a.jours_restants} ${t('accueil.jours')}`}
                        {' · '}
                        {a.age_a_venir} {t('accueil.ans')}
                      </Text>
                    </View>
                  </View>
                </CandyCard>
              ))}
            </>
          ) : null}
        </>
      )}

      {!maisonActive && !loading ? (
        <EmptyState emoji="🏠" title={t('accueil.aucuneMaison')} message={t('accueil.creerRejoindre')} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.xl, paddingTop: spacing['2xl'], paddingBottom: 140 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  greeting: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.black,
  },
  birthdayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: borderRadius.card,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  birthdayBannerTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.extrabold,
  },
  birthdayBannerSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    marginTop: 2,
  },
  maisonSelector: { marginBottom: spacing.md, maxHeight: 46 },
  maisonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
  },
  maisonChipEmoji: { fontSize: 16 },
  maisonChipText: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm },
  maisonCard: { marginBottom: spacing.lg },
  maisonHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  maisonEmoji: { fontSize: 36 },
  maisonNomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  maisonNom: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.extrabold },
  maisonMeta: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },
  logementChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
  },
  logementChipIcon: { fontSize: 12 },
  logementChipText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  emptyCard: { marginBottom: spacing.md, alignItems: 'center' },
  emptyText: { fontWeight: typography.fontWeight.medium },
  itemCard: { marginBottom: spacing.sm, paddingVertical: spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemTitle: { flex: 1, fontWeight: typography.fontWeight.bold },
  itemMeta: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium },
});
