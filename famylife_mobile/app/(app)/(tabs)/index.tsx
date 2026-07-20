// app/(app)/(tabs)/index.tsx
// Accueil (V5) : en-tête léger, carte maison + mes points, bande d'indicateurs,
// accès rapide, puis « à venir » condensé (événements, votes, anniversaires).
//
// ANNEXE V10 — la confusion tâches / activités.
// Retour utilisateur, mot pour mot : « les tâches sont les tâches ménagères et
// les activités sont les trucs qu'on peut faire ensemble style un restau
// ensemble un jour, un picnic, un barbecue ».
//
// Cet écran fusionnait « corvées en retard + tâches + activités » dans UNE
// liste : un barbecue s'affichait juste sous « sortir les poubelles ». Deux
// natures opposées se retrouvaient à égalité, dans le même ton, dans la même
// carte — l'app enseignait elle-même la confusion.
//
// Désormais DEUX sections, et le ton suit la nature :
//   · « Corvées du jour »       → un DEVOIR. Le ménage, réparti entre nous.
//     (les corvées en retard y restent en tête, marquées en rouge : c'est le
//      même travail, simplement déjà dû.) Vide = une récompense méritée.
//   · « Ce qu'on fait ensemble » → une ENVIE. Un resto, un pique-nique.
//     Vide = une invitation à proposer quelque chose, jamais un reproche.
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
  Vote as VoteIcon,
  Scale,
  Flame,
  Trophy,
  Users,
  Cake,
} from 'lucide-react-native';
import { useMaison } from '../../src/contexts/MaisonContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { useNotifications } from '../../src/contexts/NotificationContext';
import evenementService, { Evenement } from '../../src/services/evenementService';
import voteService, { Vote } from '../../src/services/voteService';
import tacheService, { Tache } from '../../src/services/tacheService';
import maisonService, { Anniversaire } from '../../src/services/maisonService';
import statsService, { BilanSemaine, Equite } from '../../src/services/statsService';
import { CandyCard, Badge, EmptyState, NotificationBell, Avatar, AvatarStack, ProgressRing, VisitorBanner } from '../../components/ui';
import { typography, spacing, borderRadius } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';
import { logementIcon, logementLabel } from '../../src/utils/logement';
import { tacheEmoji } from '../../src/utils/tacheVisuel';

function isSameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

export default function DashboardScreen() {
  const { colors, gradients } = useTheme();
  const { t, lang } = useT();
  const locale = lang === 'en' ? 'en-US' : 'fr-FR';
  const { user } = useAuth();
  const { maisons, maisonActive, membres, selectMaison, loading: maisonLoading, isVisiteur, isModuleActif } =
    useMaison();
  const { unreadCount, refresh: refreshNotifCount } = useNotifications();
  const [taches, setTaches] = useState<Tache[]>([]);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [anniversaires, setAnniversaires] = useState<Anniversaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ANNEXE V6 — boucle magique : bilan de la semaine + série (streak) perso.
  const [bilan, setBilan] = useState<BilanSemaine | null>(null);
  const [streak, setStreak] = useState(0);
  // ANNEXE V9 — l'équité n'a plus d'onglet (elle se consulte une fois par
  // semaine, pas dix fois par jour). Son signal remonte ici, dans la carte
  // bilan : c'est là qu'il est vu, et il y devient actionnable.
  const [equite, setEquite] = useState<Equite | null>(null);

  const loadData = useCallback(async () => {
    if (!maisonActive) {
      setTaches([]);
      setEvenements([]);
      setVotes([]);
      setAnniversaires([]);
      setBilan(null);
      setStreak(0);
      setEquite(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [tacheRes, evtRes, voteRes, anniRes, bilanRes, streakRes, equiteRes] = await Promise.all([
        tacheService.list(maisonActive.id),
        evenementService.list(maisonActive.id),
        voteService.list(maisonActive.id),
        maisonService.anniversaires(maisonActive.id),
        statsService.bilanSemaine(maisonActive.id),
        statsService.streak(maisonActive.id),
        statsService.equite(maisonActive.id, 'semaine'),
      ]);
      setTaches(tacheRes.data ?? []);
      setEvenements(evtRes.data ?? []);
      setVotes(voteRes.data ?? []);
      setAnniversaires(anniRes.data ?? []);
      setBilan(bilanRes.data ?? null);
      setStreak(streakRes.data?.streak ?? 0);
      setEquite(equiteRes.data ?? null);
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
  const startOfTomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  // ANNEXE V11 — fusion activité → événement. « Ce qu'on fait ensemble
  // aujourd'hui » lit désormais les ÉVÉNEMENTS du jour (un resto, un
  // pique-nique, un anniversaire…) : ce sont eux qui portent les moments
  // partagés. On ne lit plus les activités ici.
  const evenementsDuJour = evenements.filter((e) => isSameDay(e.date_debut, today));
  // Les CORVÉES du jour : le ménage. Rien à voir avec ci-dessus.
  const tachesDuJour = taches.filter(
    (tc) =>
      tc.statut !== 'fait' &&
      !tc.fait_aujourdhui &&
      (tc.frequence === 'quotidien' || (tc.echeance_date && isSameDay(tc.echeance_date, today)))
  );
  const corvees = taches
    .filter((tc) => (tc.gage_semaines_restantes ?? 0) > 0)
    .sort((a, b) => b.gage_semaines_restantes - a.gage_semaines_restantes);
  // « À venir » = strictement APRÈS aujourd'hui, pour ne jamais répéter dans
  // deux sections un événement déjà listé dans « Ce qu'on fait ensemble ».
  const prochainEvenements = evenements
    .filter((e) => new Date(e.date_debut).getTime() >= startOfTomorrow.getTime())
    .slice(0, 3);
  // ANNEXE V8 — un vote appartient au module "decisions". Éteint, il ne doit
  // remonter ni dans les indicateurs ni dans « À venir » (la liste « À venir »
  // renvoie sur `/(app)/votes/[id]`, un écran qu'on ne met plus en avant).
  const votesOuverts = isModuleActif('decisions') ? votes.filter((v) => v.statut === 'ouvert') : [];
  const anniversairesAujourdhui = anniversaires.filter((a) => a.aujourdhui);
  const anniversairesAVenir = anniversaires.filter((a) => !a.aujourdhui).slice(0, 3);

  const mesPoints = membres.find((m) => m.id === user?.id)?.points ?? 0;
  // ANNEXE V12 — « moins de texte, plus de visuel » : ma part des tâches de la
  // semaine, affichée en anneau plutôt qu'en phrase. Dérivée du bilan (aucune
  // dépendance à l'équité), donc toujours disponible quand la carte s'affiche.
  const maPart =
    bilan && bilan.total_taches > 0
      ? Math.round(((bilan.par_membre.find((m) => m.utilisateur_id === user?.id)?.taches ?? 0) / bilan.total_taches) * 100)
      : 0;
  // ANNEXE V10 — on ne compte plus « corvées + activités » ensemble : additionner
  // un barbecue et une poubelle ne veut rien dire. Cet indicateur mène à l'onglet
  // Tâches : il ne compte donc QUE des corvées.
  const aucuneCorvee = corvees.length === 0 && tachesDuJour.length === 0;

  const dateLabel = today.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  // ANNEXE V7 — l'accès rapide suit la nouvelle architecture : il pointe sur les
  // destinations canoniques et non plus sur des écrans fusionnés (Menu,
  // Boutique, Défis, Classement sont désormais des segments ; Chat sort des
  // mises en avant). 8 tuiles qui criaient toutes pareil → 5 raccourcis utiles.
  //
  // ANNEXE V8 — découverte progressive : un raccourci vers un module éteint
  // serait une promesse creuse. Tâches et Équité restent toujours là (cœur de
  // l'app, jamais désactivables) : l'accès rapide n'est donc jamais vide.
  const QUICK_ACTIONS: { label: string; Icon: any; route: string }[] = [
    { label: t('taches.titre'), Icon: ListChecks, route: '/(app)/(tabs)/taches' },
    ...(isModuleActif('courses')
      ? [{ label: t('coursesRepas.titre'), Icon: ShoppingCart, route: '/(app)/courses' }]
      : []),
    ...(isModuleActif('depenses')
      ? [{ label: t('depenses.titre'), Icon: Wallet, route: '/(app)/depenses' }]
      : []),
    ...(isModuleActif('decisions')
      ? [{ label: t('decisions.titre'), Icon: VoteIcon, route: '/(app)/decisions' }]
      : []),
    // V9 — plus de raccourci « Équité » ici : la carte « Bilan de la semaine »
    // juste en dessous y mène déjà, et de façon bien plus parlante qu'une tuile.
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

  // `subtitle` porte le TON de la section (devoir vs envie) : c'est là que se
  // joue la distinction, plus encore que dans le titre.
  const SectionHeader = ({ Icon, title, subtitle, route, style }: any) => (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionHeaderLeft}>
        <Icon size={16} color={colors.text.muted} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: colors.text.dark }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.sectionSubtitle, { color: colors.text.muted }]}>{subtitle}</Text>
          ) : null}
        </View>
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
          <View style={styles.greetingRow}>
            <Text style={[styles.greeting, { color: colors.text.dark }]} numberOfLines={1}>
              {t('accueil.salut')} {user?.nom?.split(' ')[0] || ''}
            </Text>
            {streak > 0 ? (
              <View style={[styles.streakChip, { backgroundColor: colors.primary.subtle }]}>
                <Flame size={13} color={colors.candy.orangeDark} />
                <Text style={[styles.streakChipText, { color: colors.candy.orangeDark }]}>{streak}</Text>
              </View>
            ) : null}
          </View>
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
                {logementLabel(t, maisonActive.type_logement)}
              </Text>
              {membres.length > 0 ? (
                <View style={styles.membresStack}>
                  <AvatarStack people={membres} size={28} max={5} />
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.pointsRow}>
            <Pressable onPress={() => router.push('/(app)/(tabs)/equite')} style={[styles.pointsChip, { backgroundColor: colors.primary.subtle }]}>
              <Star size={14} color={colors.primary.main} />
              <Text style={[styles.pointsChipText, { color: colors.primary.main }]}>
                {mesPoints} pts · {t('classement.titre')}
              </Text>
              <ChevronRight size={14} color={colors.primary.main} />
            </Pressable>
          </View>
        </CandyCard>
      ) : null}

      {/* ANNEXE V6 — boucle magique : carte visuelle « Bilan de la semaine ». */}
      {maisonActive && !loading && bilan && bilan.total_taches > 0 ? (
        <Pressable onPress={() => router.push('/(app)/(tabs)/equite')}>
          <LinearGradient colors={gradients.candyYellow} style={styles.bilanCard}>
            <View style={styles.bilanHeaderRow}>
              <Trophy size={20} color={colors.candy.white} />
              <Text style={[styles.bilanTitle, { color: colors.candy.white }]}>{t('bilan.titre')}</Text>
              {bilan.par_membre.length > 0 ? (
                <View style={{ marginLeft: 'auto' }}>
                  <AvatarStack people={bilan.par_membre} size={26} max={4} ringColor="rgba(255,255,255,0.55)" />
                </View>
              ) : null}
            </View>
            <View style={styles.bilanStatsRow}>
              <ProgressRing
                percent={maPart}
                size={78}
                strokeWidth={9}
                colors={['#FFFFFF', '#FFE9C7']}
                trackColor="rgba(255,255,255,0.28)"
              >
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.bilanRingPct}>{maPart}%</Text>
                  <Text style={styles.bilanRingLabel}>{t('bilan.taPart')}</Text>
                </View>
              </ProgressRing>
              <View style={styles.bilanStat}>
                <Text style={[styles.bilanStatValue, { color: colors.candy.white }]}>{bilan.total_taches}</Text>
                <Text style={styles.bilanStatLabel}>{t('bilan.taches')}</Text>
              </View>
              <View style={styles.bilanStatDivider} />
              <View style={styles.bilanStat}>
                <Text style={[styles.bilanStatValue, { color: colors.candy.white }]}>{bilan.points_semaine}</Text>
                <Text style={styles.bilanStatLabel}>{t('bilan.points')}</Text>
              </View>
            </View>
            {bilan.top ? (
              <View style={styles.bilanTopRow}>
                <Avatar name={bilan.top.nom} image={bilan.top.image} size={38} ringColor="rgba(255,255,255,0.7)" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bilanTopLabel}>🥇 {t('bilan.topLabel')}</Text>
                  <Text style={[styles.bilanTopNom, { color: colors.candy.white }]} numberOfLines={1}>{bilan.top.nom}</Text>
                </View>
              </View>
            ) : null}

            {/* ANNEXE V9 — le signal d'équité, là où il est réellement vu.
                On ne l'affiche QUE s'il y a un déséquilibre ET quelqu'un à
                proposer : une carte qui répète « tout va bien » chaque jour
                devient un meuble qu'on ne lit plus. Quand elle parle, elle dit
                quelque chose d'actionnable — qui prend la prochaine corvée. */}
            {equite?.desequilibre && equite.suggestion ? (
              <View style={styles.equiteRow}>
                <Scale size={15} color={colors.candy.white} />
                <Text style={[styles.equiteText, { color: colors.candy.white }]} numberOfLines={2}>
                  {t('bilan.equiteSuggestion').replace('{nom}', equite.suggestion.nom)}
                </Text>
              </View>
            ) : null}
          </LinearGradient>
        </Pressable>
      ) : null}

      {maisonActive && !loading ? (
        <>
          <View style={styles.kpiGrid}>
            <KpiCard Icon={ListChecks} value={tachesDuJour.length} label={t('accueil.corveesDuJour')} tint={colors.text.dark} route="/(app)/(tabs)/taches" />
            <KpiCard Icon={AlertTriangle} value={corvees.length} label={t('accueil.corveesEnRetard')} tint={colors.candy.red} route="/(app)/(tabs)/taches" />
            {/* ANNEXE V8 — module "decisions" éteint : afficher « 0 vote ouvert »
                et renvoyer vers un écran désactivé n'apprend rien. */}
            {isModuleActif('decisions') ? (
              <KpiCard Icon={BarChart3} value={votesOuverts.length} label={t('accueil.votesOuverts')} tint={colors.text.dark} route="/(app)/decisions" />
            ) : null}
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

          {/* ─── SECTION 1 — LES CORVÉES. Un devoir : on le nomme, on le
              répartit, on le coche. Ton neutre et factuel. ─────────────── */}
          <SectionHeader
            Icon={ListChecks}
            title={t('accueil.corveesDuJour')}
            subtitle={t('accueil.corveesSousTitre')}
            route="/(app)/(tabs)/taches"
          />
          {aucuneCorvee ? (
            <CandyCard style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: colors.text.body }]}>{t('accueil.aucuneCorvee')}</Text>
            </CandyCard>
          ) : (
            <>
              {/* Les corvées en retard (gage en cours) d'abord : c'est la même
                  nature — du ménage — simplement déjà dû. */}
              {corvees.map((tc) => (
                <Pressable key={`c-${tc.id}`} onPress={() => router.push('/(app)/(tabs)/taches')}>
                  <CandyCard style={styles.itemCard}>
                    <View style={styles.itemRow}>
                      <View style={[styles.homeTile, styles.homeTileGage]}>
                        <Text style={styles.homeTileEmoji}>{tacheEmoji(tc.titre)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemTitle, { color: colors.text.dark }]} numberOfLines={1}>{tc.titre}</Text>
                        <View style={styles.homeMetaRow}>
                          <Avatar name={tc.titulaire?.nom} image={tc.titulaire?.image ?? null} size={20} />
                          <Text style={[styles.itemMeta, { color: colors.candy.red }]} numberOfLines={1}>
                            {tc.titulaire ? tc.titulaire.nom : t('taches.personne')}
                          </Text>
                        </View>
                      </View>
                      <Badge label={`${tc.gage_semaines_restantes} sem.`} variant="pink" />
                    </View>
                  </CandyCard>
                </Pressable>
              ))}
              {tachesDuJour.map((tc) => (
                <Pressable key={`t-${tc.id}`} onPress={() => router.push('/(app)/(tabs)/taches')}>
                  <CandyCard style={styles.itemCard}>
                    <View style={styles.itemRow}>
                      <View style={[styles.homeTile, styles.homeTileTodo]}>
                        <Text style={styles.homeTileEmoji}>{tacheEmoji(tc.titre)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemTitle, { color: colors.text.dark }]} numberOfLines={1}>{tc.titre}</Text>
                        <View style={styles.homeMetaRow}>
                          <Avatar name={tc.titulaire?.nom} image={tc.titulaire?.image ?? null} size={20} />
                          <Text style={[styles.itemMeta, { color: colors.text.muted }]} numberOfLines={1}>
                            {tc.titulaire ? tc.titulaire.nom : t('taches.personne')}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </CandyCard>
                </Pressable>
              ))}
            </>
          )}

          {/* ─── SECTION 2 — CE QU'ON FAIT ENSEMBLE. Une envie : on la propose,
              on y participe. Vide, elle invite — elle ne réprimande pas.
              Elle mène à l'Agenda, où ces moments se créent et se datent. ── */}
          <SectionHeader
            Icon={PartyPopper}
            title={t('accueil.ensemble')}
            subtitle={t('accueil.ensembleSousTitre')}
            route="/(app)/(tabs)/agenda"
            style={{ marginTop: spacing.lg }}
          />
          {evenementsDuJour.length === 0 ? (
            <CandyCard style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: colors.text.body }]}>{t('accueil.aucunEnsemble')}</Text>
            </CandyCard>
          ) : (
            evenementsDuJour.map((e) => (
              <Pressable key={`ej-${e.id}`} onPress={() => router.push(`/(app)/evenements/${e.id}`)}>
                <CandyCard style={styles.itemCard}>
                  <View style={styles.itemRow}>
                    <Users size={18} color={colors.candy.orangeDark} />
                    <Text style={[styles.itemTitle, { color: colors.text.dark }]} numberOfLines={1}>{e.titre}</Text>
                    <Text style={[styles.aVenirMeta, { color: colors.text.muted }]}>
                      {e.toute_la_journee
                        ? t('agenda.touteLaJournee')
                        : new Date(e.date_debut).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </CandyCard>
              </Pressable>
            ))
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
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  greeting: { fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.black },
  streakChip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: borderRadius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  streakChipText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.black },
  dateText: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, marginTop: 2, textTransform: 'capitalize' },
  bilanCard: { borderRadius: borderRadius.card, padding: spacing.lg, marginBottom: spacing.lg },
  bilanHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  bilanTitle: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  bilanStatsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  bilanRingPct: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.black, color: '#FFFFFF' },
  bilanRingLabel: { fontSize: 9, fontWeight: typography.fontWeight.bold, color: 'rgba(255,255,255,0.9)', marginTop: -2 },
  bilanStat: { flex: 1, alignItems: 'center' },
  bilanStatDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.4)' },
  bilanStatValue: { fontSize: typography.fontSize['3xl'], fontWeight: typography.fontWeight.black },
  bilanStatLabel: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  bilanTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
  },
  bilanTopLabel: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold, color: 'rgba(255,255,255,0.85)' },
  bilanTopNom: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  // V9 — ligne d'équité dans la carte bilan (séparée par un filet discret).
  equiteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.35)',
  },
  equiteText: { flex: 1, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
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
  membresStack: { marginTop: spacing.sm },
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
  sectionHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sectionTitle: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  // Le sous-titre porte le ton de la section (devoir / envie) : discret mais lu.
  sectionSubtitle: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: 1 },
  emptyCard: { marginBottom: spacing.md, alignItems: 'center' },
  emptyText: { fontWeight: typography.fontWeight.medium },
  itemCard: { marginBottom: spacing.sm, paddingVertical: spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  homeTile: { width: 44, height: 44, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center' },
  homeTileEmoji: { fontSize: 22 },
  homeTileTodo: { backgroundColor: 'rgba(219,138,87,0.16)' },
  homeTileGage: { backgroundColor: 'rgba(214,64,44,0.14)' },
  homeMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  itemTitle: { flex: 1, fontWeight: typography.fontWeight.bold },
  itemMeta: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: 2 },
  aVenirRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  aVenirText: { flex: 1, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold },
  aVenirMeta: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium },
});
