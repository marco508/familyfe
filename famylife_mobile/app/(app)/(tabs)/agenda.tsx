// app/(app)/(tabs)/agenda.tsx
// Calendrier mensuel "maison" fait en RN pur (7 colonnes, navigation mois
// précédent/suivant, pastilles colorées sur les jours avec événements).
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, Plus, X, MapPin, Clock } from 'lucide-react-native';
import { useMaison } from '../../src/contexts/MaisonContext';
import { useNotifications } from '../../src/contexts/NotificationContext';
import evenementService, { Evenement } from '../../src/services/evenementService';
import { planifierRappelEvenement } from '../../src/services/reminderService';
import { CandyButton, CandyCard, CandyInput, SectionTitle, EmptyState, NotificationBell, VisitorBanner } from '../../components/ui';
import { typography, spacing, borderRadius } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';
import { LinearGradient } from 'expo-linear-gradient';

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
const COULEURS = ['#7B5CFF', '#FF4E9B', '#3AC8FF', '#3FD98B', '#FFD23F', '#FF8A3D'];

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

export default function AgendaScreen() {
  const { colors, gradients } = useTheme();
  const { t, lang } = useT();
  const JOURS_SEMAINE = lang === 'en' ? JOURS_SEMAINE_EN : JOURS_SEMAINE_FR;
  const MOIS_LABEL = lang === 'en' ? MOIS_LABEL_EN : MOIS_LABEL_FR;
  const locale = lang === 'en' ? 'en-US' : 'fr-FR';
  const { maisonActive, isVisiteur } = useMaison();
  const { unreadCount, refresh: refreshNotifCount } = useNotifications();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [heure, setHeure] = useState('18:00');
  const [touteLaJournee, setTouteLaJournee] = useState(false);
  const [lieu, setLieu] = useState('');
  const [couleur, setCouleur] = useState(COULEURS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!maisonActive) {
      setEvenements([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const debut = startOfMonth(currentMonth).toISOString();
      const fin = endOfMonth(currentMonth).toISOString();
      const res = await evenementService.list(maisonActive.id, debut, fin);
      setEvenements(res.data ?? []);
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

  const eventsByDay = useMemo(() => {
    const map: Record<string, Evenement[]> = {};
    evenements.forEach((e) => {
      const key = toDateKey(new Date(e.date_debut));
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [evenements]);

  const grid = useMemo(() => {
    const first = startOfMonth(currentMonth);
    const startOffset = (first.getDay() + 6) % 7; // lundi = 0
    const daysInMonth = endOfMonth(currentMonth).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [currentMonth]);

  const goPrevMonth = () => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const goNextMonth = () => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const selectedDayEvents = (eventsByDay[toDateKey(selectedDay)] ?? []).sort(
    (a, b) => new Date(a.date_debut).getTime() - new Date(b.date_debut).getTime()
  );

  const openModal = () => {
    setTitre('');
    setDescription('');
    setHeure('18:00');
    setTouteLaJournee(false);
    setLieu('');
    setCouleur(COULEURS[0]);
    setError('');
    setModalVisible(true);
  };

  const handleCreate = async () => {
    if (!maisonActive) return;
    if (!titre.trim()) {
      setError(t('activite.titreObligatoire'));
      return;
    }
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
    setSaving(true);
    setError('');
    const res = await evenementService.create(maisonActive.id, {
      titre: titre.trim(),
      description: description.trim() || undefined,
      date_debut: dateDebut.toISOString(),
      toute_la_journee: touteLaJournee,
      lieu: lieu.trim() || undefined,
      couleur,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setModalVisible(false);
    if (res.data) {
      planifierRappelEvenement(res.data).catch(() => {});
    }
    load();
    refreshNotifCount();
  };

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
      >
        <SectionTitle
          title={t('nav.agenda')}
          emoji="🗓️"
          right={
            <View style={styles.headerActionsRow}>
              <NotificationBell count={unreadCount} onPress={() => router.push('/(app)/notifications')} />
              {!isVisiteur ? (
                <Pressable onPress={openModal} style={[styles.addButton, { backgroundColor: colors.secondary.main }]}>
                  <Plus size={20} color={colors.candy.white} />
                </Pressable>
              ) : null}
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
              const key = toDateKey(day);
              const hasEvents = !!eventsByDay[key]?.length;
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
                  {hasEvents ? <View style={[styles.dot, { backgroundColor: colors.candy.pink }]} /> : null}
                </Pressable>
              );
            })}
          </View>
        </CandyCard>

        <SectionTitle
          title={selectedDay.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          size="md"
          style={{ marginTop: spacing.lg }}
        />

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary.main} />
        ) : selectedDayEvents.length === 0 ? (
          <EmptyState emoji="🌤️" title={t('agenda.rienPrevu')} message={t('agenda.ajouterEvenement')} />
        ) : (
          selectedDayEvents.map((e) => (
            <CandyCard key={e.id} style={[styles.eventCard, { borderLeftColor: e.couleur, borderLeftWidth: 5 }]}>
              <Text style={[styles.eventTitle, { color: colors.text.dark }]}>{e.titre}</Text>
              <View style={styles.eventMetaRow}>
                <Clock size={14} color={colors.text.muted} />
                <Text style={[styles.eventMeta, { color: colors.text.body }]}>
                  {e.toute_la_journee
                    ? t('agenda.touteLaJournee')
                    : new Date(e.date_debut).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              {e.lieu ? (
                <View style={styles.eventMetaRow}>
                  <MapPin size={14} color={colors.text.muted} />
                  <Text style={[styles.eventMeta, { color: colors.text.body }]}>{e.lieu}</Text>
                </View>
              ) : null}
            </CandyCard>
          ))
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.modalCard, { backgroundColor: colors.background }]}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text.dark }]}>{t('agenda.nouvelEvenement')}</Text>
                <Pressable onPress={() => setModalVisible(false)} hitSlop={10}>
                  <X size={22} color={colors.text.dark} />
                </Pressable>
              </View>
              <Text style={[styles.modalDate, { color: colors.text.body }]}>
                {selectedDay.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>

              <CandyInput label={t('common.titre')} placeholder={t('agenda.titrePlaceholder')} value={titre} onChangeText={setTitre} />
              <CandyInput label={t('agenda.lieuOptionnel')} placeholder={t('agenda.lieuPlaceholder')} value={lieu} onChangeText={setLieu} />
              <CandyInput
                label={t('activite.descriptionOptionnelle')}
                placeholder={t('activite.descriptionPlaceholder')}
                value={description}
                onChangeText={setDescription}
                multiline
              />

              <Pressable style={styles.toggleRow} onPress={() => setTouteLaJournee((v) => !v)}>
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

              <Text style={[styles.label, { color: colors.text.dark }]}>{t('agenda.couleur')}</Text>
              <View style={styles.chipsRow}>
                {COULEURS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setCouleur(c)}
                    style={[
                      styles.colorChip,
                      { backgroundColor: c },
                      couleur === c && { borderColor: colors.text.dark },
                    ]}
                  />
                ))}
              </View>

              {error ? <Text style={[styles.error, { color: colors.candy.red }]}>{error}</Text> : null}

              <CandyButton label={t('agenda.ajouterAgenda')} onPress={handleCreate} loading={saving} variant="purple" style={{ marginTop: spacing.md }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.xl, paddingTop: spacing['2xl'], paddingBottom: 140 },
  headerActionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  dot: { width: 5, height: 5, borderRadius: 3 },
  eventCard: { marginBottom: spacing.sm },
  eventTitle: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold, marginBottom: spacing.xs },
  eventMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  eventMeta: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalCard: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  modalTitle: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.black },
  modalDate: { fontWeight: typography.fontWeight.bold, marginBottom: spacing.lg, textTransform: 'capitalize' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  checkbox: { width: 22, height: 22, borderRadius: borderRadius.sm, borderWidth: 2 },
  toggleLabel: { fontWeight: typography.fontWeight.bold },
  label: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  colorChip: { width: 32, height: 32, borderRadius: borderRadius.pill, borderWidth: 3, borderColor: 'transparent' },
  error: { fontWeight: typography.fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
});
