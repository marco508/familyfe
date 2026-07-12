// app/(app)/(tabs)/activites.tsx
// Liste des activités de la maison active, filtres par statut, création via
// modal (planning date+heure, gage, rotation/relais), avatars des assignés.
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Plus, X, Gift, Repeat, Lock } from 'lucide-react-native';
import { useMaison } from '../../src/contexts/MaisonContext';
import { useNotifications } from '../../src/contexts/NotificationContext';
import activiteService, { Activite, StatutActivite, Visibilite } from '../../src/services/activiteService';
import { planifierRappelActivite } from '../../src/services/reminderService';
import {
  CandyButton,
  CandyCard,
  CandyInput,
  SectionTitle,
  Badge,
  Avatar,
  EmptyState,
  Toggle,
  Stepper,
  Segmented,
  NotificationBell,
  VisitorBanner,
} from '../../components/ui';
import { typography, spacing, borderRadius, shadows } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';

const STATUT_ORDER: StatutActivite[] = ['a_faire', 'en_cours', 'termine'];
const STATUT_VARIANT: Record<StatutActivite, 'orange' | 'blue' | 'green'> = {
  a_faire: 'orange',
  en_cours: 'blue',
  termine: 'green',
};

export default function ActivitesScreen() {
  const { colors } = useTheme();
  const { t } = useT();
  const STATUTS: { value: StatutActivite | 'toutes'; label: string }[] = [
    { value: 'toutes', label: t('activite.toutes') },
    { value: 'a_faire', label: t('statut.aFaire') },
    { value: 'en_cours', label: t('statut.enCours') },
    { value: 'termine', label: t('statut.termine') },
  ];
  const STATUT_LABEL: Record<StatutActivite, string> = {
    a_faire: t('statut.aFaire'),
    en_cours: t('statut.enCours'),
    termine: t('statut.termine'),
  };
  const { maisonActive, membres, isVisiteur } = useMaison();
  const { unreadCount, refresh: refreshNotifCount } = useNotifications();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [filtre, setFiltre] = useState<StatutActivite | 'toutes'>('toutes');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [dateEcheance, setDateEcheance] = useState('');
  const [heureEcheance, setHeureEcheance] = useState('');
  const [rappel, setRappel] = useState(true);
  const [assignes, setAssignes] = useState<number[]>([]);

  // ANNEXE V4 — visibilité (toute la maison / participants) + participants.
  const [visibilite, setVisibilite] = useState<Visibilite>('maison');
  const [participants, setParticipants] = useState<number[]>([]);

  const [gageActif, setGageActif] = useState(false);
  const [penalite, setPenalite] = useState('');
  const [recompense, setRecompense] = useState('');
  const [pointsPenalite, setPointsPenalite] = useState(5);
  const [pointsRecompense, setPointsRecompense] = useState(5);

  const [rotationActive, setRotationActive] = useState(false);
  const [rotationOrdre, setRotationOrdre] = useState<number[]>([]);
  const [rotationDelaiJours, setRotationDelaiJours] = useState(1);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!maisonActive) {
      setActivites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await activiteService.list(maisonActive.id);
      setActivites(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [maisonActive]);

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

  const resetForm = () => {
    setTitre('');
    setDescription('');
    setDateEcheance('');
    setHeureEcheance('');
    setRappel(true);
    setAssignes([]);
    setVisibilite('maison');
    setParticipants([]);
    setGageActif(false);
    setPenalite('');
    setRecompense('');
    setPointsPenalite(5);
    setPointsRecompense(5);
    setRotationActive(false);
    setRotationOrdre([]);
    setRotationDelaiJours(1);
    setError('');
  };

  const openModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const toggleAssigne = (id: number) => {
    setAssignes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleRotationMembre = (id: number) => {
    setRotationOrdre((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleParticipant = (id: number) => {
    setParticipants((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreate = async () => {
    if (!maisonActive) return;
    if (!titre.trim()) {
      setError(t('activite.titreObligatoire'));
      return;
    }
    if (rotationActive && rotationOrdre.length < 2) {
      setError(t('activite.rotationMinMembres'));
      return;
    }
    setSaving(true);
    setError('');
    const res = await activiteService.create(maisonActive.id, {
      titre: titre.trim(),
      description: description.trim() || undefined,
      date_echeance: dateEcheance.trim() || undefined,
      heure_echeance: heureEcheance.trim() || undefined,
      rappel,
      assignes: assignes.length ? assignes : undefined,
      gage_actif: gageActif,
      penalite: gageActif ? penalite.trim() || undefined : undefined,
      recompense: gageActif ? recompense.trim() || undefined : undefined,
      points_penalite: gageActif ? pointsPenalite : undefined,
      points_recompense: gageActif ? pointsRecompense : undefined,
      rotation_active: rotationActive,
      rotation_ordre: rotationActive ? rotationOrdre : undefined,
      rotation_delai_jours: rotationActive ? rotationDelaiJours : undefined,
      visibilite,
      participants: visibilite === 'participants' ? participants : undefined,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setModalVisible(false);
    resetForm();
    if (res.data) {
      planifierRappelActivite(res.data).catch(() => {});
    }
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

  const filtered = filtre === 'toutes' ? activites : activites.filter((a) => a.statut === filtre);

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
      >
        <SectionTitle
          title={t('activite.titre')}
          emoji="📋"
          right={
            <View style={styles.headerActionsRow}>
              <NotificationBell count={unreadCount} onPress={() => router.push('/(app)/notifications')} />
              {!isVisiteur ? (
                <Pressable onPress={openModal} style={[styles.addButton, { backgroundColor: colors.primary.main }, shadows.candyPink]}>
                  <Plus size={20} color={colors.candy.white} />
                </Pressable>
              ) : null}
            </View>
          }
        />

        {isVisiteur ? <VisitorBanner /> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={{ gap: spacing.sm }}>
          {STATUTS.map((s) => {
            const active = filtre === s.value;
            return (
              <Pressable
                key={s.value}
                onPress={() => setFiltre(s.value)}
                style={[
                  styles.filterChip,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  active && { backgroundColor: colors.primary.main, borderColor: colors.primary.main },
                ]}
              >
                <Text style={[styles.filterChipText, { color: active ? colors.candy.white : colors.text.body }]}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
        ) : filtered.length === 0 ? (
          <EmptyState emoji="🧺" title={t('activite.aucuneActivite')} message={t('activite.ajouterBouton')} />
        ) : (
          filtered.map((a) => (
            <CandyCard key={a.id} style={styles.card}>
              <Pressable onPress={() => router.push(`/(app)/activites/${a.id}`)}>
                <Text style={[styles.cardTitle, { color: colors.text.dark }]}>{a.titre}</Text>
                {a.date_echeance ? (
                  <Text style={[styles.cardMeta, { color: colors.text.body }]}>
                    📅 {a.date_echeance}{a.heure_echeance ? ` ${t('activite.a')} ${a.heure_echeance}` : ''}
                  </Text>
                ) : null}

                {a.gage_actif || (a.rotation_active && a.rotation_titulaire) ? (
                  <View style={styles.badgesRow}>
                    {a.gage_actif ? (
                      a.gage_resultat !== 'en_attente' ? (
                        <Badge
                          label={a.gage_resultat === 'reussi' ? t('activite.reussi') : t('activite.echoue')}
                          variant={a.gage_resultat === 'reussi' ? 'green' : 'orange'}
                        />
                      ) : (
                        <>
                          {a.recompense ? <Badge label={`🎁 ${a.recompense}`} variant="yellow" /> : null}
                          {a.penalite ? <Badge label={`⚠️ ${a.penalite}`} variant="orange" /> : null}
                        </>
                      )
                    ) : null}
                    {a.rotation_active && a.rotation_titulaire ? (
                      <Badge label={`🔄 ${a.rotation_titulaire.nom}`} variant="purple" />
                    ) : null}
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
                      style={[styles.avatarStackItem, { borderColor: colors.candy.white, marginLeft: idx === 0 ? 0 : -10 }]}
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
                <Text style={[styles.modalTitle, { color: colors.text.dark }]}>{t('activite.nouvelleActivite')}</Text>
                <Pressable onPress={() => setModalVisible(false)} hitSlop={10}>
                  <X size={22} color={colors.text.dark} />
                </Pressable>
              </View>

              <CandyInput label={t('activite.titreChamp')} placeholder={t('activite.titrePlaceholder')} value={titre} onChangeText={setTitre} />
              <CandyInput
                label={t('activite.descriptionOptionnelle')}
                placeholder={t('activite.descriptionPlaceholder')}
                value={description}
                onChangeText={setDescription}
                multiline
              />
              <CandyInput
                label={t('activite.echeanceOptionnelle')}
                placeholder={t('activite.echeancePlaceholder')}
                value={dateEcheance}
                onChangeText={setDateEcheance}
              />
              <CandyInput
                label={t('activite.heureOptionnelle')}
                placeholder={t('activite.heurePlaceholder')}
                value={heureEcheance}
                onChangeText={setHeureEcheance}
              />

              <View style={styles.toggleRow}>
                <Text style={[styles.toggleLabel, { color: colors.text.dark }]}>{t('activite.rappel')}</Text>
                <Toggle value={rappel} onValueChange={setRappel} />
              </View>

              <Text style={[styles.label, { color: colors.text.dark }]}>{t('activite.assignerA')}</Text>
              <View style={styles.membresList}>
                {membres.map((m) => {
                  const active = assignes.includes(m.id);
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => toggleAssigne(m.id)}
                      style={[
                        styles.membreChip,
                        { backgroundColor: colors.card, borderColor: colors.border },
                        active && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle },
                      ]}
                    >
                      <Avatar name={m.nom} image={m.image} size={24} />
                      <Text
                        style={[styles.membreChipText, { color: active ? colors.primary.main : colors.text.body }]}
                        numberOfLines={1}
                      >
                        {m.nom}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* ANNEXE V4 — visibilité (toute la maison / participants) */}
              <Text style={[styles.label, { color: colors.text.dark }]}>{t('activite.visibilite')}</Text>
              <Segmented
                value={visibilite}
                onChange={setVisibilite}
                options={[
                  { value: 'maison', label: t('activite.visibiliteMaison') },
                  { value: 'participants', label: t('activite.visibiliteParticipants') },
                ]}
              />
              {visibilite === 'participants' ? (
                <View style={[styles.membresList, { marginTop: spacing.lg }]}>
                  {membres.map((m) => {
                    const active = participants.includes(m.id);
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => toggleParticipant(m.id)}
                        style={[
                          styles.membreChip,
                          { backgroundColor: colors.card, borderColor: colors.border },
                          active && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle },
                        ]}
                      >
                        <Avatar name={m.nom} image={m.image} size={24} />
                        <Text
                          style={[styles.membreChipText, { color: active ? colors.primary.main : colors.text.body }]}
                          numberOfLines={1}
                        >
                          {m.nom}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              <View style={[styles.sectionCard, { backgroundColor: colors.candy.cream, marginTop: spacing.lg }]}>
                <View style={styles.toggleRow}>
                  <View style={styles.sectionCardTitleRow}>
                    <Gift size={16} color={colors.candy.orangeDark} />
                    <Text style={[styles.sectionCardTitle, { color: colors.text.dark }]}>{t('activite.gage')}</Text>
                  </View>
                  <Toggle value={gageActif} onValueChange={setGageActif} />
                </View>
                {gageActif ? (
                  <>
                    <CandyInput
                      label={t('activite.recompenseSiReussi')}
                      placeholder={t('activite.recompensePlaceholder')}
                      value={recompense}
                      onChangeText={setRecompense}
                    />
                    <CandyInput
                      label={t('activite.penaliteSiEchoue')}
                      placeholder={t('activite.penalitePlaceholder')}
                      value={penalite}
                      onChangeText={setPenalite}
                    />
                    <View style={styles.stepperRow}>
                      <Stepper label={t('activite.pointsRecompense')} value={pointsRecompense} onValueChange={setPointsRecompense} min={0} max={100} />
                      <Stepper label={t('activite.pointsPenalite')} value={pointsPenalite} onValueChange={setPointsPenalite} min={0} max={100} />
                    </View>
                  </>
                ) : null}
              </View>

              <View style={[styles.sectionCard, { backgroundColor: colors.candy.cream }]}>
                <View style={styles.toggleRow}>
                  <View style={styles.sectionCardTitleRow}>
                    <Repeat size={16} color={colors.secondary.main} />
                    <Text style={[styles.sectionCardTitle, { color: colors.text.dark }]}>{t('activite.rotation')}</Text>
                  </View>
                  <Toggle value={rotationActive} onValueChange={setRotationActive} />
                </View>
                {rotationActive ? (
                  <>
                    <Text style={[styles.helperText, { color: colors.text.body }]}>{t('activite.rotationAide')}</Text>
                    <View style={styles.membresList}>
                      {membres.map((m) => {
                        const order = rotationOrdre.indexOf(m.id);
                        const active = order >= 0;
                        return (
                          <Pressable
                            key={m.id}
                            onPress={() => toggleRotationMembre(m.id)}
                            style={[
                              styles.membreChip,
                              { backgroundColor: colors.card, borderColor: colors.border },
                              active && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle },
                            ]}
                          >
                            {active ? (
                              <Text style={[styles.orderBadge, { color: colors.candy.white, backgroundColor: colors.secondary.main }]}>
                                {order + 1}
                              </Text>
                            ) : null}
                            <Avatar name={m.nom} image={m.image} size={24} />
                            <Text
                              style={[styles.membreChipText, { color: active ? colors.primary.main : colors.text.body }]}
                              numberOfLines={1}
                            >
                              {m.nom}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Stepper label={t('activite.delaiJours')} value={rotationDelaiJours} onValueChange={setRotationDelaiJours} min={1} max={30} />
                  </>
                ) : null}
              </View>

              {error ? <Text style={[styles.error, { color: colors.candy.red }]}>{error}</Text> : null}

              <CandyButton label={t('activite.creerActivite')} onPress={handleCreate} loading={saving} variant="pink" style={{ marginTop: spacing.md }} />
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
  filters: { marginBottom: spacing.lg, maxHeight: 42 },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.pill,
    borderWidth: 1.5,
  },
  filterChipText: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm },
  card: { marginBottom: spacing.md },
  cardTitle: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.extrabold },
  cardMeta: { fontSize: typography.fontSize.sm, marginTop: 2, fontWeight: typography.fontWeight.medium },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatarStackItem: { borderWidth: 2, borderRadius: 999 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalCard: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    maxHeight: '88%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  modalTitle: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.black },
  label: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  toggleLabel: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.md },
  membresList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  membreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1.5,
    maxWidth: 150,
  },
  membreChipText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  orderBadge: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.black,
    width: 16,
    height: 16,
    borderRadius: 8,
    textAlign: 'center',
    lineHeight: 16,
    overflow: 'hidden',
  },
  sectionCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sectionCardTitle: { fontWeight: typography.fontWeight.extrabold, fontSize: typography.fontSize.md },
  stepperRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  helperText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginBottom: spacing.md },
  error: { fontWeight: typography.fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
});
