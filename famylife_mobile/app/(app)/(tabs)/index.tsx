// app/(app)/(tabs)/index.tsx
// Accueil (V5) : en-tête léger, carte maison + mes points, bande d'indicateurs,
// accès rapide, liste « aujourd'hui » unifiée (corvées en retard + tâches +
// activités), puis « à venir » condensé (événements, votes, anniversaires).
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CalendarDays,
  ListChecks,
  BarChart3,
  ChevronRight,
  PartyPopper,
  AlertTriangle,
  Star,
  ShoppingCart,
  Wallet,
  UtensilsCrossed,
  MessageCircle,
  Gift,
  Flame,
  Trophy,
  Users,
  Cake,
} from 'lucide-react-native';
import { useMaison } from '../../src/contexts/MaisonContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { useNotifications } from '../../src/contexts/NotificationContext';
import activiteService, { Activite } from '../../src/services/activiteService';
import evenementService, { Evenement } from '../../src/services/evenementService';
import voteService, { Vote } from '../../src/services/voteService';
import tacheService, { Tache } from '../../src/services/tacheService';
import maisonService, { Anniversaire } from '../../src/services/maisonService';
import { CandyCard, Badge, EmptyState, NotificationBell, Avatar, VisitorBanner } from '../../components/ui';
import { typography, spacing, borderRadius } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';
import { logementIcon, logementLabel } from '../../src/utils/logement';

function isSameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

export default function DashboardScreen() {
  const { colors, gradients } = useTheme();
  const { t, lang } = useT();
  const locale = lang === 'en' ? 'en-US' : 'fr-FR';
  const STATUT_LABEL: Record<string, string> = {
    a_faire: t('statut.aFaire'),
    en_cours: t('statut.enCours'),
    termine: t('statut.termine'),
  };
  const { user } = useAuth();
  const { maisons, maisonActive, membres, selectMaison, loading: maisonLoading, isVisiteur } = useMaison();
  const { unreadCount, refresh: refreshNotifCount } = useNotifications();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [taches, setTaches] = useState<Tache[]>([]);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [anniversaires, setAnniversaires] = useState<Anniversaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!maisonActive) {
      setActivites([]);
      setTaches([]);
      setEvenements([]);
      setVotes([]);
      setAnniversaires([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [actRes, tacheRes, evtRes, voteRes, anniRes] = await Promise.all([
        activiteService.list(maisonActive.id),
        tacheService.list(maisonActive.id),
        evenementService.list(maisonActive.id),
        voteService.list(maisonActive.id),
        maisonService.anniversaires(maisonActive.id),
      ]);
      setActivites(actRes.data ?? []);
      setTaches(tacheRes.data ?? []);
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
  const tachesDuJour = taches.filter(
    (tc) =>
      tc.statut !== 'fait' &&
      !tc.fait_aujourdhui &&
      (tc.frequence === 'quotidien' || (tc.echeance_date && isSameDay(tc.echeance_date, today)))
  );
  const corvees = taches
    .filter((tc) => (tc.gage_semaines_restantes ?? 0) > 0)
    .sort((a, b) => b.gage_semaines_restantes - a.gage_semaines_restantes);
  const prochainEvenements = evenements
    .filter((e) => new Date(e.date_debut).getTime() >= today.getTime() - 1000 * 60 * 60 * 6)
    .slice(0, 3);
  const votesOuverts = votes.filter((v) => v.statut === 'ouvert');
  const anniversairesAujourdhui = anniversaires.filter((a) => a.aujourdhui);
  const anniversairesAVenir = anniversaires.filter((a) => !a.aujourdhui).slice(0, 3);

  const mesPoints = membres.find((m) => m.id === user?.id)?.points ?? 0;
  const aFaireCount = activitesDuJour.length + tachesDuJour.length;
  const rienAujourdhui = corvees.length === 0 && aFaireCount === 0;

  const dateLabel = today.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  const QUICK_ACTIONS: { label: string; Icon: any; route: string }[] = [
    { label: t('taches.titre'), Icon: ListChecks, route: '/(app)/taches' },
    { label: t('courses.titre'), Icon: ShoppingCart, route: '/(app)/courses' },
    { label: t('depenses.titre'), Icon: Wallet, route: '/(app)/depenses' },
    { label: t('menu.titre'), Icon: UtensilsCrossed, route: '/(app)/menu' },
    { label: t('chat.titre'), Icon: MessageCircle, route: '/(app)/chat' },
    { label: t('boutique.titre'), Icon: Gift, route: '/(app)/boutique' },
    { label: t('defis.titre'), Icon: Flame, route: '/(app)/defis' },
    { label: t('classement.titre'), Icon: Trophy, route: '/(app)/classement' },
  ];

  const KpiCard = ({ Icon, value, label, tint, route }: any) => (
    <Pressable onPress={() => router.push(route)} style={[styles.kpiCard, { backgroundColor: colors.card }]}>
      <View style={styles.kpiTop}>
        <Icon size={16} color={tint} />
        <Text style={[styles.kpiValue, { color: tint }]}>{value}</Text>
      </View>
      <Text style={[styles.kpiLabel, { color: colors.text.body }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );

  const SectionHeader = ({ Icon, title, route }: any) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <Icon size={16} color={colors.text.muted} />
        <Text style={[styles.sectionTitle, { color: colors.text.dark }]}>{title}</Text>
      </View>
      {route ? (
        <Pressable onPress={() => router.push(route)} hitSlop={8}>
          <ChevronRight size={20} color={colors.text.muted} />
        </Pressable>
      ) : null}
    </View>
  );

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
        <View style={{ flex: 1 }}>
          <Text style={[styles.greeting, { color: colors.text.dark }]} numberOfLines={1}>
            {t('accueil.salut')} {user?.nom?.split(' ')[0] || ''}
          </Text>
          <Text style={[styles.dateText, { color: colors.text.muted }]}>{dateLabel}</Text>
        </View>
        <NotificationBell count={unreadCount} onPress={() => router.push('/(app)/notifications')} />
      </View>

      {isVisiteur ? <VisitorBanner /> : null}

      {anniversairesAujourdhui.length > 0 ? (
        <LinearGradient colors={gradients.candyYellow} style={styles.birthdayBanner}>
          <PartyPopper size={24} color={colors.candy.white} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.birthdayBannerTitle, { color: colors.candy.white }]}>
              {t('accueil.joyeuxAnniversaire')} {anniversairesAujourdhui.map((a) => a.nom).join(', ')} !
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
                <Text style={[styles.maisonChipText, { color: active ? colors.candy.white : colors.text.body }]}>{m.nom}</Text>
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
                <Text style={[styles.maisonNom, { color: colors.text.dark }]} numberOfLines={1}>{maisonActive.nom}</Text>
                {maisonActive.role === 'chef' ? <Badge label={t('common.chef')} variant="yellow" /> : null}
              </View>
              <Text style={[styles.maisonMeta, { color: colors.text.body }]}>
                {logementLabel(t, maisonActive.type_logement)} · {maisonActive.nb_membres}{' '}
                {maisonActive.nb_membres > 1 ? t('accueil.membres') : t('accueil.membre')}
              </Text>
            </View>
          </View>
          <View style={styles.pointsRow}>
            <Pressable onPress={() => router.push('/(app)/classement')} style={[styles.pointsChip, { backgroundColor: colors.primary.subtle }]}>
              <Star size={14} color={colors.primary.main} />
              <Text style={[styles.pointsChipText, { color: colors.primary.main }]}>
                {mesPoints} pts · {t('classement.titre')}
              </Text>
              <ChevronRight size={14} color={colors.primary.main} />
            </Pressable>
          </View>
        </CandyCard>
      ) : null}

      {maisonActive && !loading ? (
        <>
          <View style={styles.kpiGrid}>
            <KpiCard Icon={ListChecks} value={aFaireCount} label={t('accueil.aujourdhui')} tint={colors.text.dark} route="/(app)/taches" />
            <KpiCard Icon={AlertTriangle} value={corvees.length} label={t('accueil.corveesEnRetard')} tint={colors.candy.red} route="/(app)/taches" />
            <KpiCard Icon={BarChart3} value={votesOuverts.length} label={t('accueil.votesOuverts')} tint={colors.text.dark} route="/(app)/(tabs)/votes" />
            <KpiCard Icon={CalendarDays} value={prochainEvenements.length} label={t('accueil.prochainsEvenements')} tint={colors.text.dark} route="/(app)/(tabs)/agenda" />
          </View>

          <Text style={[styles.miniLabel, { color: colors.text.body }]}>{t('accueil.accesRapide')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xs }} style={{ marginBottom: spacing.lg }}>
            {QUICK_ACTIONS.map(({ label, Icon, route }) => (
              <Pressable key={route} onPress={() => router.push(route)} style={styles.quickTile}>
                <View style={[styles.quickIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Icon size={22} color={colors.primary.main} />
                </View>
                <Text style={[styles.quickLabel, { color: colors.text.body }]} numberOfLines={1}>{label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <SectionHeader Icon={ListChecks} title={t('accueil.aujourdhui')} route="/(app)/taches" />
          {rienAujourdhui ? (
            <CandyCard style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: colors.text.body }]}>{t('accueil.aucuneActivite')}</Text>
            </CandyCard>
          ) : (
            <>
              {corvees.map((tc) => (
                <Pressable key={`c-${tc.id}`} onPress={() => router.push('/(app)/taches')}>
                  <CandyCard style={styles.itemCard}>
                    <View style={styles.itemRow}>
                      <AlertTriangle size={18} color={colors.candy.red} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemTitle, { color: colors.text.dark }]} numberOfLines={1}>{tc.titre}</Text>
                        <Text style={[styles.itemMeta, { color: colors.candy.red }]} numberOfLines={1}>
                          {tc.titulaire ? tc.titulaire.nom : t('taches.personne')}
                        </Text>
                      </View>
                      <Badge label={`${tc.gage_semaines_restantes} sem.`} variant="pink" />
                    </View>
                  </CandyCard>
                </Pressable>
              ))}
              {tachesDuJour.map((tc) => (
                <Pressable key={`t-${tc.id}`} onPress={() => router.push('/(app)/taches')}>
                  <CandyCard style={styles.itemCard}>
                    <View style={styles.itemRow}>
                      <ListChecks size={18} color={colors.candy.blueDark} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemTitle, { color: colors.text.dark }]} numberOfLines={1}>{tc.titre}</Text>
                        <Text style={[styles.itemMeta, { color: colors.text.muted }]} numberOfLines={1}>
                          {tc.titulaire ? tc.titulaire.nom : t('taches.personne')}
                        </Text>
                      </View>
                    </View>
                  </CandyCard>
                </Pressable>
              ))}
              {activitesDuJour.map((a) => (
                <Pressable key={`a-${a.id}`} onPress={() => router.push(`/(app)/activites/${a.id}`)}>
                  <CandyCard style={styles.itemCard}>
                    <View style={styles.itemRow}>
                      <Users size={18} color={colors.candy.orangeDark} />
                      <Text style={[styles.itemTitle, { color: colors.text.dark }]} numberOfLines={1}>{a.titre}</Text>
                      <Badge label={STATUT_LABEL[a.statut]} variant={a.statut === 'en_cours' ? 'blue' : 'orange'} />
                    </View>
                  </CandyCard>
                </Pressable>
              ))}
            </>
          )}

          {(prochainEvenements.length > 0 || votesOuverts.length > 0 || anniversairesAVenir.length > 0) ? (
            <>
              <SectionHeader Icon={CalendarDays} title={t('accueil.aVenir')} />
              <CandyCard style={{ marginBottom: spacing.md }}>
                {prochainEvenements.map((e, i) => (
                  <Pressable key={`e-${e.id}`} onPress={() => router.push('/(app)/(tabs)/agenda')}>
                    <View style={[styles.aVenirRow, i > 0 && { borderTopWidth: 0.5, borderTopColor: colors.border }]}>
                      <CalendarDays size={17} color={colors.candy.purpleDark} />
                      <Text style={[styles.aVenirText, { color: colors.text.dark }]} numberOfLines={1}>{e.titre}</Text>
                      <Text style={[styles.aVenirMeta, { color: colors.text.muted }]}>
                        {new Date(e.date_debut).toLocaleString(locale, { day: '2-digit', month: 'short', hour: e.toute_la_journee ? undefined : '2-digit', minute: e.toute_la_journee ? undefined : '2-digit' })}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                {votesOuverts.slice(0, 2).map((v, i) => (
                  <Pressable key={`v-${v.id}`} onPress={() => router.push(`/(app)/votes/${v.id}`)}>
                    <View style={[styles.aVenirRow, (i > 0 || prochainEvenements.length > 0) && { borderTopWidth: 0.5, borderTopColor: colors.border }]}>
                      <BarChart3 size={17} color={colors.candy.blueDark} />
                      <Text style={[styles.aVenirText, { color: colors.text.dark }]} numberOfLines={1}>{v.question}</Text>
                      <Text style={[styles.aVenirMeta, { color: colors.text.muted }]}>
                        {v.total_voix} {v.total_voix > 1 ? t('accueil.votes') : t('accueil.vote')}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                {anniversairesAVenir.map((a, i) => (
                  <View key={`b-${a.id}`} style={[styles.aVenirRow, (i > 0 || prochainEvenements.length > 0 || votesOuverts.length > 0) && { borderTopWidth: 0.5, borderTopColor: colors.border }]}>
                    <Cake size={17} color={colors.candy.pinkDark} />
                    <Text style={[styles.aVenirText, { color: colors.text.dark }]} numberOfLines={1}>{a.nom}</Text>
                    <Text style={[styles.aVenirMeta, { color: colors.text.muted }]}>
                      {a.jours_restants === 1 ? `${t('accueil.dans')} 1 ${t('accueil.jour')}` : `${t('accueil.dans')} ${a.jours_restants} ${t('accueil.jours')}`}
                    </Text>
                  </View>
                ))}
              </CandyCard>
            </>
          ) : null}
        </>
      ) : null}

      {maisonActive && loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
      ) : null}

      {!maisonActive && !loading ? (
        <EmptyState emoji="🏠" title={t('accueil.aucuneMaison')} message={t('accueil.creerRejoindre')} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.xl, paddingTop: spacing['2xl'], paddingBottom: 140 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  greeting: { fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.black },
  dateText: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, marginTop: 2, textTransform: 'capitalize' },
  birthdayBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: borderRadius.card, padding: spacing.lg, marginBottom: spacing.lg },
  birthdayBannerTitle: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  birthdayBannerSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: 2 },
  maisonSelector: { marginBottom: spacing.md, maxHeight: 46 },
  maisonChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: borderRadius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1.5 },
  maisonChipEmoji: { fontSize: 16 },
  maisonChipText: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm },
  maisonCard: { marginBottom: spacing.lg },
  maisonHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  maisonEmoji: { fontSize: 34 },
  maisonNomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  maisonNom: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.extrabold },
  maisonMeta: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, marginTop: 2 },
  pointsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  pointsChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: borderRadius.pill, paddingVertical: spacing.sm },
  pointsChipText: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  kpiCard: { width: '47.5%', flexGrow: 1, borderRadius: borderRadius.lg, padding: spacing.md },
  kpiTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kpiValue: { fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.black },
  kpiLabel: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: 2 },
  miniLabel: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, marginBottom: spacing.sm },
  quickTile: { width: 66, alignItems: 'center' },
  quickIcon: { width: 56, height: 56, borderRadius: borderRadius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm, marginTop: spacing.xs },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sectionTitle: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  emptyCard: { marginBottom: spacing.md, alignItems: 'center' },
  emptyText: { fontWeight: typography.fontWeight.medium },
  itemCard: { marginBottom: spacing.sm, paddingVertical: spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemTitle: { flex: 1, fontWeight: typography.fontWeight.bold },
  itemMeta: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: 2 },
  aVenirRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  aVenirText: { flex: 1, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold },
  aVenirMeta: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium },
});
