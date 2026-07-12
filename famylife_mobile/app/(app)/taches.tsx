// app/(app)/taches.tsx — Tâches domestiques (ANNEXE V4)
// Distinct des Activités (sociales) : corvées assignées (fixe ou rotation),
// fréquence/routine, gage, validées en cochant une case par le titulaire ou
// la gestion. Tâches du jour en tête avec le nom du titulaire.
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
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, X, Gift, Pencil, Trash2 } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { useMaison } from '../src/contexts/MaisonContext';
import { useAuth } from '../src/contexts/AuthContext';
import { useT } from '../src/i18n';
import { useTheme } from '../src/contexts/ThemeContext';
import tacheService, { AssignationTache, FrequenceTache, Tache } from '../src/services/tacheService';
import pieceService, { Piece } from '../src/services/pieceService';
import {
  Avatar,
  Badge,
  CandyButton,
  CandyCard,
  CandyInput,
  Checkbox,
  EmptyState,
  Segmented,
  Stepper,
  Toggle,
  VisitorBanner,
} from '../components/ui';
import { typography, spacing, borderRadius, shadows } from '../theme/designTokens';

const FREQUENCE_VARIANT: Record<FrequenceTache, 'neutral' | 'blue' | 'purple' | 'orange'> = {
  ponctuel: 'neutral',
  quotidien: 'blue',
  hebdo: 'purple',
  mensuel: 'orange',
};

function isSameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

export default function TachesScreen() {
  const { colors } = useTheme();
  const { t } = useT();
  const { maisonActive, membres, isGestion, isVisiteur } = useMaison();
  const { user } = useAuth();

  const FREQUENCES: { value: FrequenceTache; label: string }[] = [
    { value: 'ponctuel', label: t('taches.ponctuel') },
    { value: 'quotidien', label: t('taches.quotidien') },
    { value: 'hebdo', label: t('taches.hebdo') },
    { value: 'mensuel', label: t('taches.mensuel') },
  ];
  const FREQUENCE_LABEL: Record<FrequenceTache, string> = {
    ponctuel: t('taches.ponctuel'),
    quotidien: t('taches.quotidien'),
    hebdo: t('taches.hebdo'),
    mensuel: t('taches.mensuel'),
  };

  const [taches, setTaches] = useState<Tache[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Tache | null>(null);
  const [validatingId, setValidatingId] = useState<number | null>(null);

  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [pieceId, setPieceId] = useState<number | null>(null);
  const [frequence, setFrequence] = useState<FrequenceTache>('ponctuel');
  const [assignation, setAssignation] = useState<AssignationTache>('fixe');
  const [assigneId, setAssigneId] = useState<number | null>(null);
  const [rotationOrdre, setRotationOrdre] = useState<number[]>([]);
  const [rotationConditions, setRotationConditions] = useState('');
  const [echeanceDate, setEcheanceDate] = useState('');
  const [echeanceHeure, setEcheanceHeure] = useState('');

  const [gageActif, setGageActif] = useState(false);
  const [penalite, setPenalite] = useState('');
  const [recompense, setRecompense] = useState('');
  const [pointsPenalite, setPointsPenalite] = useState(5);
  const [pointsRecompense, setPointsRecompense] = useState(5);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!maisonActive) {
      setTaches([]);
      setPieces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([tacheService.list(maisonActive.id), pieceService.list(maisonActive.id)]);
      setTaches(tRes.data ?? []);
      setPieces(pRes.data ?? []);
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
    setPieceId(null);
    setFrequence('ponctuel');
    setAssignation('fixe');
    setAssigneId(null);
    setRotationOrdre([]);
    setRotationConditions('');
    setEcheanceDate('');
    setEcheanceHeure('');
    setGageActif(false);
    setPenalite('');
    setRecompense('');
    setPointsPenalite(5);
    setPointsRecompense(5);
    setError('');
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setModalVisible(true);
  };

  const openEdit = (tache: Tache) => {
    setEditing(tache);
    setTitre(tache.titre);
    setDescription(tache.description || '');
    setPieceId(tache.piece_id);
    setFrequence(tache.frequence);
    setAssignation(tache.assignation);
    setAssigneId(tache.assigne_id);
    setRotationOrdre(tache.rotation_ordre || []);
    setRotationConditions(tache.rotation_conditions || '');
    setEcheanceDate(tache.echeance_date || '');
    setEcheanceHeure(tache.echeance_heure || '');
    setGageActif(tache.gage_actif);
    setPenalite(tache.penalite || '');
    setRecompense(tache.recompense || '');
    setPointsPenalite(tache.points_penalite ?? 5);
    setPointsRecompense(tache.points_recompense ?? 5);
    setError('');
    setModalVisible(true);
  };

  const toggleRotationMembre = (id: number) => {
    setRotationOrdre((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    if (!maisonActive) return;
    if (!titre.trim()) {
      setError(t('taches.titreObligatoire'));
      return;
    }
    if (assignation === 'fixe' && !assigneId) {
      setError(t('taches.assigneObligatoire'));
      return;
    }
    if (assignation === 'rotation' && rotationOrdre.length < 2) {
      setError(t('taches.rotationMinMembres'));
      return;
    }
    setSaving(true);
    setError('');
    const data = {
      titre: titre.trim(),
      description: description.trim() || undefined,
      piece_id: pieceId,
      frequence,
      assignation,
      assigne_id: assignation === 'fixe' ? assigneId : undefined,
      rotation_ordre: assignation === 'rotation' ? rotationOrdre : undefined,
      rotation_conditions: assignation === 'rotation' ? rotationConditions.trim() || undefined : undefined,
      echeance_date: echeanceDate.trim() || undefined,
      echeance_heure: echeanceHeure.trim() || undefined,
      gage_actif: gageActif,
      penalite: gageActif ? penalite.trim() || undefined : undefined,
      recompense: gageActif ? recompense.trim() || undefined : undefined,
      points_penalite: gageActif ? pointsPenalite : undefined,
      points_recompense: gageActif ? pointsRecompense : undefined,
    };
    const res = editing ? await tacheService.update(editing.id, data) : await tacheService.create(maisonActive.id, data);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setModalVisible(false);
    resetForm();
    load();
  };

  const handleDelete = (tache: Tache) => {
    Alert.alert(t('taches.supprimerConfirmTitre'), tache.titre, [
      { text: t('common.annuler'), style: 'cancel' },
      {
        text: t('common.supprimer'),
        style: 'destructive',
        onPress: async () => {
          setModalVisible(false);
          await tacheService.remove(tache.id);
          load();
        },
      },
    ]);
  };

  const handleValider = async (tache: Tache) => {
    setValidatingId(tache.id);
    const res = await tacheService.valider(tache.id);
    setValidatingId(null);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    load();
  };

  const peutValider = (tache: Tache) => isGestion || (!!user && tache.titulaire?.id === user.id);

  const today = new Date();
  const tachesDuJour = taches.filter(
    (tc) => tc.frequence === 'quotidien' || (tc.echeance_date && isSameDay(tc.echeance_date, today))
  );
  const autresTaches = taches.filter((tc) => !tachesDuJour.includes(tc));

  const renderTache = (tache: Tache) => {
    const canValidate = peutValider(tache);
    return (
      <CandyCard key={tache.id} style={styles.card}>
        <View style={styles.cardTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text.dark }]} numberOfLines={2}>
              {tache.titre}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.text.body }]} numberOfLines={1}>
              {tache.titulaire
                ? `${t('taches.aFaireParPrefix')} ${tache.titulaire.nom}`
                : t('taches.personne')}
            </Text>
          </View>
          <Checkbox
            checked={tache.fait_aujourdhui || tache.statut === 'fait'}
            onToggle={() => handleValider(tache)}
            disabled={!canValidate || tache.fait_aujourdhui || tache.statut === 'fait' || validatingId === tache.id}
          />
        </View>

        <View style={styles.badgesRow}>
          <Badge label={FREQUENCE_LABEL[tache.frequence]} variant={FREQUENCE_VARIANT[tache.frequence]} />
          {tache.assignation === 'rotation' ? <Badge label="🔄" variant="purple" /> : null}
          {tache.gage_actif ? <Badge label={tache.recompense ? `🎁 ${tache.recompense}` : '🎁'} variant="yellow" /> : null}
          {tache.gage_actif && tache.penalite ? <Badge label={`⚠️ ${tache.penalite}`} variant="orange" /> : null}
        </View>

        {isGestion ? (
          <View style={styles.gestionRow}>
            <Pressable onPress={() => openEdit(tache)} hitSlop={8} style={styles.gestionButton}>
              <Pencil size={14} color={colors.primary.main} />
              <Text style={[styles.gestionButtonText, { color: colors.primary.main }]}>{t('common.modifier')}</Text>
            </Pressable>
            <Pressable onPress={() => handleDelete(tache)} hitSlop={8} style={styles.gestionButton}>
              <Trash2 size={14} color={colors.candy.red} />
              <Text style={[styles.gestionButtonText, { color: colors.candy.red }]}>{t('common.supprimer')}</Text>
            </Pressable>
          </View>
        ) : null}
      </CandyCard>
    );
  };

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>🧹 {t('taches.titre')}</Text>
        {isGestion ? (
          <Pressable onPress={openCreate} style={[styles.addButton, { backgroundColor: colors.primary.main }, shadows.candyPink]}>
            <Plus size={20} color={colors.candy.white} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
      >
        {isVisiteur ? <VisitorBanner /> : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
        ) : taches.length === 0 ? (
          <EmptyState emoji="🧹" title={t('taches.aucuneTache')} message={isGestion ? t('taches.ajouterBouton') : undefined} />
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: colors.text.dark }]}>{t('taches.duJour')}</Text>
            {tachesDuJour.length === 0 ? (
              <CandyCard style={{ marginBottom: spacing.lg }}>
                <Text style={[styles.emptyInlineText, { color: colors.text.body }]}>{t('taches.aucuneTache')}</Text>
              </CandyCard>
            ) : (
              tachesDuJour.map(renderTache)
            )}

            {autresTaches.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.text.dark, marginTop: spacing.lg }]}>
                  {t('taches.toutes')}
                </Text>
                {autresTaches.map(renderTache)}
              </>
            ) : null}
          </>
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
                <Text style={[styles.modalTitle, { color: colors.text.dark }]}>
                  {editing ? t('taches.modifierTache') : t('taches.nouvelleTache')}
                </Text>
                <Pressable onPress={() => setModalVisible(false)} hitSlop={10}>
                  <X size={22} color={colors.text.dark} />
                </Pressable>
              </View>

              <CandyInput label={t('taches.titreChamp')} placeholder={t('taches.titrePlaceholder')} value={titre} onChangeText={setTitre} />
              <CandyInput
                label={t('taches.descriptionOptionnelle')}
                value={description}
                onChangeText={setDescription}
                multiline
              />

              <Text style={[styles.label, { color: colors.text.dark }]}>{t('taches.pieceOptionnelle')}</Text>
              <View style={styles.chipsRow}>
                <Pressable
                  onPress={() => setPieceId(null)}
                  style={[
                    styles.chip,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    pieceId === null && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle },
                  ]}
                >
                  <Text style={[styles.chipText, { color: pieceId === null ? colors.primary.main : colors.text.body }]}>
                    {t('taches.aucunePiece')}
                  </Text>
                </Pressable>
                {pieces.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => setPieceId(p.id)}
                    style={[
                      styles.chip,
                      { backgroundColor: colors.card, borderColor: colors.border },
                      pieceId === p.id && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: pieceId === p.id ? colors.primary.main : colors.text.body }]}>
                      {p.nom}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.label, { color: colors.text.dark, marginTop: spacing.md }]}>{t('taches.frequence')}</Text>
              <Segmented value={frequence} onChange={setFrequence} options={FREQUENCES} />

              <CandyInput
                label={t('taches.echeanceOptionnelle')}
                placeholder="2026-07-15"
                value={echeanceDate}
                onChangeText={setEcheanceDate}
                style={{ marginTop: spacing.lg }}
              />
              <CandyInput
                label={t('taches.heureOptionnelle')}
                placeholder="18:30"
                value={echeanceHeure}
                onChangeText={setEcheanceHeure}
              />

              <Text style={[styles.label, { color: colors.text.dark }]}>{t('taches.assignation')}</Text>
              <Segmented
                value={assignation}
                onChange={setAssignation}
                options={[
                  { value: 'fixe', label: t('taches.fixe') },
                  { value: 'rotation', label: t('taches.rotation') },
                ]}
              />

              {assignation === 'fixe' ? (
                <View style={[styles.membresList, { marginTop: spacing.lg }]}>
                  {membres.map((m) => {
                    const active = assigneId === m.id;
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => setAssigneId(m.id)}
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
              ) : (
                <View style={{ marginTop: spacing.lg }}>
                  <Text style={[styles.helperText, { color: colors.text.body }]}>{t('taches.ordreRotation')}</Text>
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
                  <CandyInput
                    label={t('taches.conditionsRotation')}
                    placeholder={t('taches.conditionsPlaceholder')}
                    value={rotationConditions}
                    onChangeText={setRotationConditions}
                  />
                </View>
              )}

              <View style={[styles.sectionCard, { backgroundColor: colors.candy.cream }]}>
                <View style={styles.toggleRow}>
                  <View style={styles.sectionCardTitleRow}>
                    <Gift size={16} color={colors.candy.orangeDark} />
                    <Text style={[styles.sectionCardTitle, { color: colors.text.dark }]}>{t('taches.gage')}</Text>
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

              {error ? <Text style={[styles.error, { color: colors.candy.red }]}>{error}</Text> : null}

              <CandyButton label={editing ? t('common.enregistrer') : t('taches.creerTache')} onPress={handleSave} loading={saving} variant="pink" style={{ marginTop: spacing.md }} />
              {editing ? (
                <CandyButton label={t('common.supprimer')} onPress={() => handleDelete(editing)} variant="ghost" style={{ marginTop: spacing.sm }} />
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing['4xl'] },
  sectionLabel: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold, marginBottom: spacing.sm },
  emptyInlineText: { fontWeight: typography.fontWeight.medium, textAlign: 'center' },
  card: { marginBottom: spacing.md },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardTitle: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  cardMeta: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: 2 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  gestionRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  gestionButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gestionButtonText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  modalTitle: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.black },
  label: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.pill, borderWidth: 1.5 },
  chipText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
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
  sectionCard: { borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  sectionCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sectionCardTitle: { fontWeight: typography.fontWeight.extrabold, fontSize: typography.fontSize.md },
  stepperRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  helperText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginBottom: spacing.md },
  error: { fontWeight: typography.fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
});
