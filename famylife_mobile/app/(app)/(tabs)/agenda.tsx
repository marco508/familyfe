// app/(app)/(tabs)/agenda.tsx
// ANNEXE V7 — Agenda unifié : fusion de l'ancien onglet "Activités" et de
// l'ancien onglet "Agenda". Les deux sections étaient quasi-synonymes ("une
// activité datée" vs "un événement") : personne ne devinait la différence,
// c'était la confusion n°1 des retours utilisateurs.
//
// Principe : UNE seule liste de "choses datées" par jour (événements +
// activités mélangés, triés par heure) présentées de façon identique, et UN
// seul flux de création. Les écrans de détail restent séparés —
// `(app)/evenements/[id]` et `(app)/activites/[id]` — car les liens et
// notifications pointent dessus.
//
// ANNEXE V11 — fusion activité → événement. « Pourquoi séparer événement et
// activité ? c'est la même chose » : les deux sont des moments datés et
// partagés. On ne crée donc plus QUE des événements (qui portent déjà le RSVP
// « qui vient ? », un lieu, une plage horaire, une récurrence). Les activités
// existantes NE sont PAS migrées : on continue de les LIRE et de les afficher
// dans l'agenda (données réelles), mais plus rien n'en crée et on n'affiche
// plus la distinction de type. L'origine de chaque item reste connue en interne
// (champ `kind`) uniquement pour router vers le bon écran de détail.
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  MapPin,
  Clock,
  Repeat,
  Lock,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useMaison } from '../../src/contexts/MaisonContext';
import { useNotifications } from '../../src/contexts/NotificationContext';
import evenementService, { Evenement } from '../../src/services/evenementService';
import activiteService, { Activite, StatutActivite } from '../../src/services/activiteService';
import tacheService, { GageEffet, Tache } from '../../src/services/tacheService';
import maisonService, { Anniversaire } from '../../src/services/maisonService';
import { planifierRappelEvenement } from '../../src/services/reminderService';
import { syncEvenement } from '../../src/services/calendarSync';
import {
  BottomSheet,
  CandyButton,
  CandyCard,
  CandyInput,
  SectionTitle,
  Badge,
  Avatar,
  EmptyState,
  Fab,
  HelpButton,
  NotificationBell,
  Repliable,
  VisitorBanner,
} from '../../components/ui';
import { typography, spacing, borderRadius } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';

const JOURS_SEMAINE_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const JOURS_SEMAINE_EN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MOIS_LABEL_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const MOIS_LABEL_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const COULEURS = ['#6B4460', '#EC5F4E', '#3E9A9E', '#6FA36A', '#DDA24C', '#DB8A57'];

// La barre d'onglets flotte au-dessus du contenu (voir (tabs)/_layout.tsx) :
// le FAB doit être posé au-dessus d'elle. Même marge que les sections du hub.
const TAB_BAR_INSET = 140;

const STATUT_ORDER: StatutActivite[] = ['a_faire', 'en_cours', 'termine'];
const STATUT_VARIANT: Record<StatutActivite, 'orange' | 'blue' | 'green'> = {
  a_faire: 'orange',
  en_cours: 'blue',
  termine: 'green',
};

// Élément unifié de la liste : un événement ou une activité (héritée), ramené à
// une même forme (titre + moment) pour être trié et rendu à l'identique. Le
// champ `kind` n'est jamais affiché : il ne sert qu'à router vers le bon écran
// de détail (événements/[id] vs activites/[id] pour le legacy).
type AgendaItem =
  | { kind: 'evenement'; key: string; minutes: number; evenement: Evenement }
  | { kind: 'activite'; key: string; minutes: number; hebdo: boolean; activite: Activite };

// Filtre du calendrier : n'afficher qu'un seul type (ou tout).
type CalFilterKey = 'all' | 'tache' | 'evenement' | 'activite' | 'anniversaire';
const CAL_FILTERS: { key: CalFilterKey; emoji: string }[] = [
  { key: 'all', emoji: '' },
  { key: 'tache', emoji: '🧹' },
  { key: 'evenement', emoji: '🎈' },
  { key: 'activite', emoji: '👥' },
  { key: 'anniversaire', emoji: '🎂' },
];

function gageEffetBadge(e: GageEffet): string {
  if (e.type === 'points') return `${(e.valeur ?? 0) > 0 ? '+' : ''}${e.valeur} pts`;
  if (e.type === 'tache') return '+ tâche';
  if (e.type === 'amende') return `${e.montant} €`;
  return 'note';
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// 0 = lundi … 6 = dimanche (convention `echeance_jour_semaine` côté API).
function jourSemaineLundi(d: Date) {
  return (d.getDay() + 6) % 7;
}
function minutesFromHeure(heure: string | null): number {
  if (!heure) return -1; // sans heure → en tête de journée
  const [h, m] = heure.split(':').map((x) => parseInt(x, 10));
  if (isNaN(h)) return -1;
  return h * 60 + (isNaN(m) ? 0 : m);
}

export default function AgendaScreen() {
  const { colors, gradients } = useTheme();
  const { t, lang } = useT();
  const JOURS_SEMAINE = lang === 'en' ? JOURS_SEMAINE_EN : JOURS_SEMAINE_FR;
  const MOIS_LABEL = lang === 'en' ? MOIS_LABEL_EN : MOIS_LABEL_FR;
  const locale = lang === 'en' ? 'en-US' : 'fr-FR';
  const { maisonActive, isVisiteur } = useMaison();
  const { unreadCount, refresh: refreshNotifCount } = useNotifications();

  const STATUT_LABEL: Record<StatutActivite, string> = {
    a_faire: t('statut.aFaire'),
    en_cours: t('statut.enCours'),
    termine: t('statut.termine'),
  };

  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [taches, setTaches] = useState<Tache[]>([]);
  const [anniversaires, setAnniversaires] = useState<Anniversaire[]>([]);
  const [filter, setFilter] = useState<CalFilterKey>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // --- Formulaire de création : uniquement un ÉVÉNEMENT ---------------------
  // (« qui vient ? » se gère APRÈS, via le RSVP sur l'écran de détail.)
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [heure, setHeure] = useState('18:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [touteLaJournee, setTouteLaJournee] = useState(false);
  const [lieu, setLieu] = useState('');
  const [couleur, setCouleur] = useState(COULEURS[0]);

  const load = useCallback(async () => {
    if (!maisonActive) {
      setEvenements([]);
      setActivites([]);
      setTaches([]);
      setAnniversaires([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const debut = startOfMonth(currentMonth).toISOString();
      const fin = endOfMonth(currentMonth).toISOString();
      // Les événements sont bornés au mois affiché ; les activités n'ont pas de
      // filtre de période côté API, on les charge toutes et on trie ici.
      const [resEv, resAc, resTa, resAn] = await Promise.all([
        evenementService.list(maisonActive.id, debut, fin),
        activiteService.list(maisonActive.id),
        tacheService.list(maisonActive.id),
        maisonService.anniversaires(maisonActive.id),
      ]);
      setEvenements(resEv.data ?? []);
      setActivites(resAc.data ?? []);
      setTaches(resTa.data ?? []);
      setAnniversaires(resAn.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [maisonActive, currentMonth]);

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

  const evenementsByDay = useMemo(() => {
    const map: Record<string, Evenement[]> = {};
    evenements.forEach((e) => {
      const key = toDateKey(new Date(e.date_debut));
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [evenements]);

  // Activités posées sur une date précise (AAAA-MM-JJ).
  const activitesDatees = useMemo(
    () => activites.filter((a) => !!a.date_echeance),
    [activites]
  );
  // Activités « chaque <jour de semaine> » : elles réapparaissent sur chaque
  // occurrence du jour. Une fois terminées, on cesse de les afficher pour ne
  // pas polluer tout le calendrier.
  const activitesHebdo = useMemo(
    () => activites.filter((a) => !a.date_echeance && a.echeance_jour_semaine !== null && a.statut !== 'termine'),
    [activites]
  );
  // Activités sans aucune date : elles existent en base (créées avant la
  // fusion) et ne peuvent pas apparaître dans le calendrier — on les liste à
  // part plutôt que de les rendre invisibles.
  const activitesSansDate = useMemo(
    () => activites.filter((a) => !a.date_echeance && a.echeance_jour_semaine === null),
    [activites]
  );

  const itemsForDay = useCallback(
    (day: Date): AgendaItem[] => {
      const key = toDateKey(day);
      const dow = jourSemaineLundi(day);
      const items: AgendaItem[] = [];

      (evenementsByDay[key] ?? []).forEach((e) => {
        items.push({
          kind: 'evenement',
          key: `e-${e.id}`,
          minutes: e.toute_la_journee ? -1 : new Date(e.date_debut).getHours() * 60 + new Date(e.date_debut).getMinutes(),
          evenement: e,
        });
      });
      activitesDatees
        .filter((a) => (a.date_echeance ?? '').slice(0, 10) === key)
        .forEach((a) => {
          items.push({ kind: 'activite', key: `a-${a.id}`, minutes: minutesFromHeure(a.heure_echeance), hebdo: false, activite: a });
        });
      activitesHebdo
        .filter((a) => a.echeance_jour_semaine === dow)
        .forEach((a) => {
          items.push({ kind: 'activite', key: `a-${a.id}`, minutes: minutesFromHeure(a.heure_echeance), hebdo: true, activite: a });
        });

      return items.sort((x, y) => x.minutes - y.minutes);
    },
    [evenementsByDay, activitesDatees, activitesHebdo]
  );

  // ── Marqueurs de calendrier : on distingue les TYPES (anniversaire,
  //    événement, activité, corvée) au lieu d'un point neutre, pour qu'on sache
  //    d'un coup d'œil ce qui se passe ce jour-là. ────────────────────────────
  const tachesForDay = useCallback(
    (day: Date): Tache[] => {
      const key = toDateKey(day);
      const dow = jourSemaineLundi(day);
      // Corvées DATÉES (échéance précise) ou HEBDOMADAIRES (jour de semaine).
      // On n'inclut pas les corvées quotidiennes : elles marqueraient tous les
      // jours et noieraient l'information.
      return taches.filter(
        (tc) =>
          (!!tc.echeance_date && tc.echeance_date.slice(0, 10) === key) ||
          (tc.echeance_jour_semaine != null && tc.echeance_jour_semaine === dow)
      );
    },
    [taches]
  );

  const anniversairesForDay = useCallback(
    (day: Date): Anniversaire[] => {
      const mm = day.getMonth() + 1;
      const dd = day.getDate();
      return anniversaires.filter((a) => {
        const p = (a.date_naissance || '').split('-');
        return Number(p[1]) === mm && Number(p[2]) === dd;
      });
    },
    [anniversaires]
  );

  // Emojis de type présents ce jour-là (dédupliqués, max 3), par priorité.
  const dayMarkers = useCallback(
    (day: Date): string[] => {
      const voit = (k: CalFilterKey) => filter === 'all' || filter === k;
      const m: string[] = [];
      if (voit('anniversaire') && anniversairesForDay(day).length) m.push('🎂');
      const its = itemsForDay(day);
      if (voit('evenement') && its.some((i) => i.kind === 'evenement')) m.push('🎈');
      if (voit('activite') && its.some((i) => i.kind === 'activite')) m.push('👥');
      if (voit('tache') && tachesForDay(day).length) m.push('🧹');
      return m.slice(0, 3);
    },
    [anniversairesForDay, itemsForDay, tachesForDay, filter]
  );

  const grid = useMemo(() => {
    const first = startOfMonth(currentMonth);
    const startOffset = jourSemaineLundi(first); // lundi = 0
    const daysInMonth = endOfMonth(currentMonth).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [currentMonth]);

  const goPrevMonth = () => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const goNextMonth = () => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const selectedDayItems = itemsForDay(selectedDay);
  const selectedBirthdays = anniversairesForDay(selectedDay);
  const selectedTasks = tachesForDay(selectedDay);

  // Application du filtre à la liste du jour sélectionné.
  const filtreVoit = (k: CalFilterKey) => filter === 'all' || filter === k;
  const filterLabel = (k: CalFilterKey) =>
    k === 'all'
      ? t('agenda.filtreTout', 'Tout')
      : k === 'tache'
        ? t('agenda.legTache', 'corvées')
        : k === 'evenement'
          ? t('agenda.legEvent', 'événements')
          : k === 'activite'
            ? t('agenda.legActivite', 'activités')
            : t('agenda.legAnniv', 'anniv.');
  const visBirthdays = filtreVoit('anniversaire') ? selectedBirthdays : [];
  const visDayItems = selectedDayItems.filter((i) =>
    i.kind === 'evenement' ? filtreVoit('evenement') : filtreVoit('activite')
  );
  const visTasks = filtreVoit('tache') ? selectedTasks : [];

  const resetForm = () => {
    setTitre('');
    setDescription('');
    setHeure('18:00');
    setTouteLaJournee(false);
    setLieu('');
    setCouleur(COULEURS[0]);
    setError('');
  };

  const openModal = () => {
    resetForm();
    setModalVisible(true);
  };

  // Divulgation progressive : lieu / couleur / description sont repliés. Si un
  // de ces champs porte déjà une valeur (pré-remplissage, reprise d'une saisie
  // en cours), on ouvre le bloc pour ne pas cacher un réglage actif.
  const optionsAvancees =
    description.trim() !== '' || lieu.trim() !== '' || couleur !== COULEURS[0];

  const createEvenement = async () => {
    if (!maisonActive) return;
    let dateDebut: Date;
    if (touteLaJournee) {
      dateDebut = new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate(), 0, 0, 0);
    } else {
      const [h, m] = heure.split(':').map((x) => parseInt(x, 10));
      dateDebut = new Date(
        selectedDay.getFullYear(),
        selectedDay.getMonth(),
        selectedDay.getDate(),
        isNaN(h) ? 0 : h,
        isNaN(m) ? 0 : m
      );
    }
    const res = await evenementService.create(maisonActive.id, {
      titre: titre.trim(),
      description: description.trim() || undefined,
      date_debut: dateDebut.toISOString(),
      toute_la_journee: touteLaJournee,
      lieu: lieu.trim() || undefined,
      couleur,
    });
    if (res.error) return res.error;
    if (res.data) {
      planifierRappelEvenement(res.data).catch(() => {});
      // Ajoute l'événement au calendrier natif du tel (silencieux dans Expo Go).
      syncEvenement(res.data).catch(() => {});
    }
    return null;
  };

  const handleCreate = async () => {
    if (!maisonActive) return;
    if (!titre.trim()) {
      setError(t('activite.titreObligatoire'));
      return;
    }
    setSaving(true);
    setError('');
    const err = await createEvenement();
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    setModalVisible(false);
    resetForm();
    load();
    refreshNotifCount();
  };

  const cycleStatut = async (activite: Activite) => {
    const idx = STATUT_ORDER.indexOf(activite.statut);
    const next = STATUT_ORDER[(idx + 1) % STATUT_ORDER.length];
    setActivites((prev) => prev.map((a) => (a.id === activite.id ? { ...a, statut: next } : a)));
    const res = await activiteService.updateStatut(activite.id, next);
    if (res.data) {
      setActivites((prev) => prev.map((a) => (a.id === activite.id ? res.data! : a)));
    }
  };

  // --- Rendu d'une carte de la liste unifiée ------------------------------
  const renderEvenement = (e: Evenement) => (
    <CandyCard key={`e-${e.id}`} style={[styles.itemCard, { borderLeftColor: e.couleur, borderLeftWidth: 5 }]}>
      <Pressable onPress={() => router.push(`/(app)/evenements/${e.id}`)}>
        <View style={styles.itemHeaderRow}>
          <Text style={[styles.itemTitle, { color: colors.text.dark }]} numberOfLines={2}>
            {e.titre}
          </Text>
        </View>
        <View style={styles.itemMetaRow}>
          <Clock size={14} color={colors.text.muted} />
          <Text style={[styles.itemMeta, { color: colors.text.body }]}>
            {e.toute_la_journee
              ? t('agenda.touteLaJournee')
              : new Date(e.date_debut).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        {e.lieu ? (
          <View style={styles.itemMetaRow}>
            <MapPin size={14} color={colors.text.muted} />
            <Text style={[styles.itemMeta, { color: colors.text.body }]}>{e.lieu}</Text>
          </View>
        ) : null}
      </Pressable>
    </CandyCard>
  );

  const renderActivite = (a: Activite, estHebdo: boolean) => (
    <CandyCard
      key={`a-${a.id}`}
      style={[styles.itemCard, { borderLeftColor: colors.secondary.main, borderLeftWidth: 5 }]}
    >
      <Pressable onPress={() => router.push(`/(app)/activites/${a.id}`)}>
        <View style={styles.itemHeaderRow}>
          <Text style={[styles.itemTitle, { color: colors.text.dark }]} numberOfLines={2}>
            {a.titre}
          </Text>
        </View>

        {a.heure_echeance || estHebdo ? (
          <View style={styles.itemMetaRow}>
            {estHebdo ? <Repeat size={14} color={colors.text.muted} /> : <Clock size={14} color={colors.text.muted} />}
            <Text style={[styles.itemMeta, { color: colors.text.body }]}>
              {estHebdo ? t('agenda.chaqueSemaine') : ''}
              {estHebdo && a.heure_echeance ? ' · ' : ''}
              {a.heure_echeance ?? ''}
            </Text>
          </View>
        ) : null}

        {a.gage_actif ? (
          <View style={styles.badgesRow}>
            {a.recompense ? <Badge label={`🎁 ${a.recompense}`} variant="yellow" /> : null}
            {a.penalite ? <Badge label={`⚠️ ${a.penalite}`} variant="orange" /> : null}
            {(a.gage_effets_echec ?? []).slice(0, 2).map((eff, i) => (
              <Badge key={`ge-${i}`} label={gageEffetBadge(eff)} variant="orange" />
            ))}
          </View>
        ) : null}
        {a.visibilite === 'participants' ? (
          <Badge
            label={t('activite.visibiliteParticipants')}
            variant="neutral"
            icon={<Lock size={11} color={colors.text.body} />}
            style={{ marginTop: spacing.xs }}
          />
        ) : null}
      </Pressable>

      <View style={styles.cardFooter}>
        <View style={styles.avatarStack}>
          {a.assignes.slice(0, 4).map((m, idx) => (
            <View
              key={m.id}
              style={[styles.avatarStackItem, { borderColor: colors.card, marginLeft: idx === 0 ? 0 : -10 }]}
            >
              <Avatar name={m.nom} image={m.image} size={28} />
            </View>
          ))}
        </View>
        <Pressable onPress={() => cycleStatut(a)}>
          <Badge label={STATUT_LABEL[a.statut]} variant={STATUT_VARIANT[a.statut]} />
        </Pressable>
      </View>
    </CandyCard>
  );

  const renderItem = (item: AgendaItem) =>
    item.kind === 'evenement' ? renderEvenement(item.evenement) : renderActivite(item.activite, item.hebdo);

  const renderAnniversaire = (a: Anniversaire) => (
    <CandyCard key={`b-${a.id}`} style={[styles.itemCard, { borderLeftColor: colors.candy.pink, borderLeftWidth: 5 }]}>
      <View style={styles.itemHeaderRow}>
        <Text style={[styles.itemTitle, { color: colors.text.dark }]} numberOfLines={1}>🎂 {a.nom}</Text>
      </View>
      <View style={styles.itemMetaRow}>
        <Text style={[styles.itemMeta, { color: colors.text.body }]}>
          {a.aujourdhui ? t('maison.cestAujourdhui', "C'est aujourd'hui ! 🎉") : `${a.age_a_venir} ${t('accueil.ans', 'ans')}`}
        </Text>
      </View>
    </CandyCard>
  );

  const renderTacheAgenda = (tc: Tache) => (
    <CandyCard key={`t-${tc.id}`} style={[styles.itemCard, { borderLeftColor: colors.primary.main, borderLeftWidth: 5 }]}>
      <Pressable onPress={() => router.push('/(app)/(tabs)/taches')}>
        <View style={styles.itemHeaderRow}>
          <Text style={[styles.itemTitle, { color: colors.text.dark }]} numberOfLines={2}>🧹 {tc.titre}</Text>
        </View>
        <View style={styles.itemMetaRow}>
          <Text style={[styles.itemMeta, { color: colors.text.body }]} numberOfLines={1}>
            {tc.titulaire ? tc.titulaire.nom : t('taches.personne')}
          </Text>
        </View>
      </Pressable>
    </CandyCard>
  );

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
      >
        <SectionTitle
          title={t('nav.agenda')}
          right={
            <View style={styles.headerActions}>
              <HelpButton />
              <NotificationBell count={unreadCount} onPress={() => { refreshNotifCount(); router.push('/(app)/notifications'); }} />
            </View>
          }
        />

        {isVisiteur ? <VisitorBanner /> : null}

        <CandyCard style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <Pressable onPress={goPrevMonth} hitSlop={10} style={[styles.monthNavButton, { backgroundColor: colors.surface }]}>
              <ChevronLeft size={20} color={colors.text.dark} />
            </Pressable>
            <Text style={[styles.monthLabel, { color: colors.text.dark }]}>
              {MOIS_LABEL[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </Text>
            <Pressable onPress={goNextMonth} hitSlop={10} style={[styles.monthNavButton, { backgroundColor: colors.surface }]}>
              <ChevronRight size={20} color={colors.text.dark} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {JOURS_SEMAINE.map((j, idx) => (
              <Text key={`${j}-${idx}`} style={[styles.weekDayLabel, { color: colors.text.muted }]}>
                {j}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {grid.map((day, idx) => {
              if (!day) return <View key={idx} style={styles.dayCell} />;
              const markers = dayMarkers(day);
              const isSelected = isSameDay(day, selectedDay);
              const isToday = isSameDay(day, new Date());
              return (
                <Pressable key={idx} style={styles.dayCell} onPress={() => setSelectedDay(day)}>
                  {isSelected ? (
                    <LinearGradient colors={gradients.tabBubble} style={styles.daySelected}>
                      <Text style={[styles.dayNumberSelected, { color: colors.candy.white }]}>{day.getDate()}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.dayNumberWrap, isToday && { backgroundColor: colors.primary.subtle }]}>
                      <Text style={[styles.dayNumber, { color: isToday ? colors.primary.main : colors.text.dark }, isToday && styles.dayNumberToday]}>
                        {day.getDate()}
                      </Text>
                    </View>
                  )}
                  {/* Marqueurs par TYPE (🎂 anniv · 🎈 événement · 👥 activité ·
                      🧹 corvée) : on voit d'un coup d'œil ce qu'il y a ce jour-là. */}
                  <View style={styles.markersRow}>
                    {markers.map((emoji, i) => (
                      <Text key={i} style={styles.markerEmoji}>{emoji}</Text>
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </CandyCard>

        {/* Filtre : n'afficher qu'un type (corvées, événements, activités,
            anniversaires) — ou tout. Agit sur les marqueurs ET la liste. */}
        <View style={styles.filterRow}>
          {CAL_FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[
                  styles.filterChip,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  active && { backgroundColor: colors.secondary.main, borderColor: colors.secondary.main },
                ]}
              >
                <Text style={[styles.filterChipText, { color: active ? colors.candy.white : colors.text.body }]}>
                  {f.emoji ? `${f.emoji} ` : ''}{filterLabel(f.key)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SectionTitle
          title={selectedDay.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          size="md"
          style={{ marginTop: spacing.lg }}
        />

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary.main} />
        ) : visBirthdays.length === 0 && visDayItems.length === 0 && visTasks.length === 0 ? (
          <EmptyState emoji="🌤️" title={t('agenda.rienPrevu')} message={t('agenda.ajouterQuelqueChose')} />
        ) : (
          <>
            {visBirthdays.map(renderAnniversaire)}
            {visDayItems.map(renderItem)}
            {visTasks.map(renderTacheAgenda)}
          </>
        )}

        {/* Activités héritées sans aucune date : sinon elles disparaîtraient de
            l'app avec la fusion. */}
        {!loading && activitesSansDate.length > 0 ? (
          <>
            <SectionTitle title={t('agenda.sansDate')} size="md" style={{ marginTop: spacing.xl }} />
            {activitesSansDate.map((a) => renderActivite(a, false))}
          </>
        ) : null}
      </ScrollView>

      {!isVisiteur ? (
        <Fab
          icon={<Plus size={24} color={colors.candy.white} />}
          onPress={openModal}
          style={[styles.fab, { bottom: TAB_BAR_INSET - spacing.xl }]}
        />
      ) : null}

      <BottomSheet
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={t('agenda.nouveau')}
        emoji="🎈"
        footer={
          <CandyButton
            label={t('agenda.ajouterAgenda')}
            onPress={handleCreate}
            loading={saving}
            variant="purple"
          />
        }
      >
        <Text style={[styles.modalDate, { color: colors.text.body }]}>
          {selectedDay.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>

        {/* Un seul concept : un événement (anniversaire, sortie, rendez-vous…).
            « Qui vient ? » se règle APRÈS, via le RSVP de l'écran de détail. */}
        <Text style={[styles.helperText, { color: colors.text.muted }]}>
          {t('agenda.aideEvenement')}
        </Text>

        <CandyInput
          label={t('common.titre')}
          placeholder={t('agenda.titrePlaceholder')}
          value={titre}
          onChangeText={setTitre}
        />
        <Pressable style={styles.toggleRowInline} onPress={() => setTouteLaJournee((v) => !v)}>
          <View
            style={[
              styles.checkbox,
              { borderColor: colors.border },
              touteLaJournee && { backgroundColor: colors.secondary.main, borderColor: colors.secondary.main },
            ]}
          />
          <Text style={[styles.toggleLabel, { color: colors.text.dark }]}>{t('agenda.touteLaJournee')}</Text>
        </Pressable>

        {!touteLaJournee ? (
          <CandyInput label={t('agenda.heureLabel')} placeholder="18:00" value={heure} onChangeText={setHeure} />
        ) : null}

        {/* Réglage fin replié : lieu, couleur, description. */}
        <Repliable titre={t('common.plusOptions')} ouvertParDefaut={optionsAvancees}>
          <CandyInput label={t('agenda.lieuOptionnel')} placeholder={t('agenda.lieuPlaceholder')} value={lieu} onChangeText={setLieu} />

          <CandyInput
            label={t('activite.descriptionOptionnelle')}
            placeholder={t('activite.descriptionPlaceholder')}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <Text style={[styles.label, { color: colors.text.dark }]}>{t('agenda.couleur')}</Text>
          <View style={styles.chipsRow}>
            {COULEURS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCouleur(c)}
                style={[styles.colorChip, { backgroundColor: c }, couleur === c && { borderColor: colors.text.dark }]}
              />
            ))}
          </View>
        </Repliable>

        {error ? <Text style={[styles.error, { color: colors.candy.red }]}>{error}</Text> : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.xl, paddingTop: spacing['2xl'], paddingBottom: 140 },
  // Aide + cloche côte à côte, dans l'emplacement « right » du SectionTitle.
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fab: { position: 'absolute', right: spacing.xl },
  calendarCard: { marginBottom: spacing.lg },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  monthNavButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.extrabold, textTransform: 'capitalize' },
  weekRow: { flexDirection: 'row', marginBottom: spacing.xs },
  weekDayLabel: { flex: 1, textAlign: 'center', fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: spacing.xs, gap: 2 },
  dayNumberWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.pill },
  dayNumber: { fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.sm },
  dayNumberToday: { fontWeight: typography.fontWeight.extrabold },
  daySelected: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.pill },
  dayNumberSelected: { fontWeight: typography.fontWeight.extrabold, fontSize: typography.fontSize.sm },
  dotsRow: { flexDirection: 'row', gap: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  markersRow: { flexDirection: 'row', gap: 1, height: 14, alignItems: 'center', justifyContent: 'center' },
  markerEmoji: { fontSize: 10, lineHeight: 13 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: spacing.md,
    rowGap: 2,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legendItem: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: borderRadius.pill, borderWidth: 1.5 },
  filterChipText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  itemCard: { marginBottom: spacing.sm },
  itemHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  itemTitle: { flex: 1, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold, marginBottom: spacing.xs },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  itemMeta: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatarStackItem: { borderWidth: 2, borderRadius: 999 },
  modalDate: { fontWeight: typography.fontWeight.bold, marginBottom: spacing.lg, textTransform: 'capitalize' },
  label: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
  toggleRowInline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  toggleLabel: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.md },
  checkbox: { width: 22, height: 22, borderRadius: borderRadius.sm, borderWidth: 2 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  colorChip: { width: 32, height: 32, borderRadius: borderRadius.pill, borderWidth: 3, borderColor: 'transparent' },
  helperText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginBottom: spacing.md },
  error: { fontWeight: typography.fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
});
