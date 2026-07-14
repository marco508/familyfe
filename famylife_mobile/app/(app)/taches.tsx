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
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, Gift, Pencil, Trash2 } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { useMaison } from '../src/contexts/MaisonContext';
import { useAuth } from '../src/contexts/AuthContext';
import { useT } from '../src/i18n';
import { useTheme } from '../src/contexts/ThemeContext';
import tacheService, { AssignationTache, FrequenceTache, GageEffet, GageEffetType, Tache } from '../src/services/tacheService';
import pieceService, { Piece } from '../src/services/pieceService';
import statsService from '../src/services/statsService';
import {
  Avatar,
  Badge,
  BottomSheet,
  CandyButton,
  CandyCard,
  CandyInput,
  Celebration,
  Checkbox,
  EmptyState,
  Segmented,
  Stepper,
  Toggle,
  VisitorBanner,
} from '../components/ui';
import GageEffetsEditor from '../components/GageEffetsEditor';
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

  // ANNEXE V6 — boucle magique : série (streak) + célébration à la validation.
  const [streak, setStreak] = useState(0);
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const [celebrationPoints, setCelebrationPoints] = useState(0);

  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [pieceIds, setPieceIds] = useState<number[]>([]);
  const [frequence, setFrequence] = useState<FrequenceTache>('ponctuel');
  const [assignation, setAssignation] = useState<AssignationTache>('fixe');
  const [assigneId, setAssigneId] = useState<number | null>(null);
  const [rotationOrdre, setRotationOrdre] = useState<number[]>([]);
  const [rotationConditions, setRotationConditions] = useState('');
  const [echeanceDate, setEcheanceDate] = useState('');
  const [echeanceHeure, setEcheanceHeure] = useState('');
  // Seuil par jour de semaine (0=lundi … 6=dimanche), alternative à une date.
  const [echeanceJour, setEcheanceJour] = useState<number | null>(null);

  const [gageActif, setGageActif] = useState(false);
  const [penalite, setPenalite] = useState('');
  const [recompense, setRecompense] = useState('');
  const [pointsPenalite, setPointsPenalite] = useState(5);
  const [pointsRecompense, setPointsRecompense] = useState(5);
  // Gage « corvée » : nombre de semaines imposées au 1er oubli (rotation).
  const [gageSemaines, setGageSemaines] = useState(2);
  // Effets de gage paramétrables (appliqués auto à l'oubli / à la réussite).
  const [effetsEchec, setEffetsEchec] = useState<GageEffet[]>([]);
  const [effetsReussite, setEffetsReussite] = useState<GageEffet[]>([]);
  const [draftCible, setDraftCible] = useState<'echec' | 'reussite' | null>(null);
  const [draftType, setDraftType] = useState<GageEffetType>('points');
  const [draftValeur, setDraftValeur] = useState('5');
  const [draftTitre, setDraftTitre] = useState('');
  const [draftJours, setDraftJours] = useState('7');
  const [draftMontant, setDraftMontant] = useState('5');
  const [draftTexte, setDraftTexte] = useState('');

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

  const loadStreak = useCallback(async () => {
    if (!maisonActive) {
      setStreak(0);
      return;
    }
    const res = await statsService.streak(maisonActive.id);
    setStreak(res.data?.streak ?? 0);
  }, [maisonActive]);

  useFocusEffect(
    useCallback(() => {
      load();
      loadStreak();
    }, [load, loadStreak])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const resetForm = () => {
    setTitre('');
    setDescription('');
    setPieceIds([]);
    setFrequence('ponctuel');
    setAssignation('fixe');
    setAssigneId(null);
    setRotationOrdre([]);
    setRotationConditions('');
    setEcheanceDate('');
    setEcheanceHeure('');
    setEcheanceJour(null);
    setGageActif(false);
    setPenalite('');
    setRecompense('');
    setPointsPenalite(5);
    setPointsRecompense(5);
    setGageSemaines(2);
    setEffetsEchec([]);
    setEffetsReussite([]);
    setDraftCible(null);
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
    // Multi-pièces : reprend la liste, avec repli sur l'ancien champ unique.
    setPieceIds(
      tache.pieces && tache.pieces.length > 0
        ? tache.pieces.map((p) => p.id)
        : tache.piece_id != null
        ? [tache.piece_id]
        : []
    );
    setFrequence(tache.frequence);
    setAssignation(tache.assignation);
    setAssigneId(tache.assigne_id);
    setRotationOrdre(tache.rotation_ordre || []);
    setRotationConditions(tache.rotation_conditions || '');
    setEcheanceDate(tache.echeance_date || '');
    setEcheanceHeure(tache.echeance_heure || '');
    setEcheanceJour(tache.echeance_jour_semaine ?? null);
    setGageActif(tache.gage_actif);
    setPenalite(tache.penalite || '');
    setRecompense(tache.recompense || '');
    setPointsPenalite(tache.points_penalite ?? 5);
    setPointsRecompense(tache.points_recompense ?? 5);
    setGageSemaines(tache.gage_semaines ?? 2);
    setEffetsEchec(tache.gage_effets_echec ?? []);
    setEffetsReussite(tache.gage_effets_reussite ?? []);
    setDraftCible(null);
    setError('');
    setModalVisible(true);
  };

  const toggleRotationMembre = (id: number) => {
    setRotationOrdre((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const togglePiece = (id: number) => {
    setPieceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Jours de la semaine pour le sélecteur de « jour-seuil » (0=lundi).
  const JOURS_SEMAINE = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  // ─── Constructeur de gage paramétrable (effets) ───────────────────────────
  const effetLabel = (e: GageEffet) =>
    e.type === 'points'
      ? `${(e.valeur ?? 0) > 0 ? '+' : ''}${e.valeur} pts`
      : e.type === 'tache'
      ? `${t('gage.typeTache')} : ${e.titre}`
      : e.type === 'amende'
      ? `${t('gage.typeAmende')} : ${e.montant} €`
      : `${t('gage.typeNote')} : ${e.texte}`;

  const addEffet = () => {
    let effet: GageEffet | null = null;
    if (draftType === 'points') {
      const v = parseInt(draftValeur, 10);
      if (!v) return;
      effet = { type: 'points', valeur: v };
    } else if (draftType === 'tache') {
      if (!draftTitre.trim()) return;
      effet = { type: 'tache', titre: draftTitre.trim(), jours: parseInt(draftJours, 10) || 0 };
    } else if (draftType === 'amende') {
      const m = parseFloat(draftMontant.replace(',', '.'));
      if (!m || m <= 0) return;
      effet = { type: 'amende', montant: Math.round(m * 100) / 100 };
    } else {
      if (!draftTexte.trim()) return;
      effet = { type: 'note', texte: draftTexte.trim() };
    }
    const setter = draftCible === 'echec' ? setEffetsEchec : setEffetsReussite;
    setter((prev) => [...prev, effet as GageEffet]);
    setDraftCible(null);
    setDraftTitre('');
    setDraftTexte('');
    setDraftValeur('5');
    setDraftJours('7');
    setDraftMontant('5');
  };

  const removeEffet = (cible: 'echec' | 'reussite', idx: number) => {
    const setter = cible === 'echec' ? setEffetsEchec : setEffetsReussite;
    setter((prev) => prev.filter((_, i) => i !== idx));
  };

  const renderEffetsSection = (cible: 'echec' | 'reussite', effets: GageEffet[]) => (
    <View style={{ marginTop: spacing.md }}>
      <Text style={[styles.label, { color: colors.text.dark }]}>
        {cible === 'echec' ? 'Si oubliée (gage)' : 'Si réussie (récompense)'}
      </Text>
      <View style={styles.chipsRow}>
        {effets.map((e, i) => (
          <Pressable
            key={i}
            onPress={() => removeEffet(cible, i)}
            style={[styles.chip, { backgroundColor: colors.primary.subtle, borderColor: colors.primary.main }]}
          >
            <Text style={[styles.chipText, { color: colors.primary.main }]}>{effetLabel(e)}  ✕</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => setDraftCible(cible)}
          style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={[styles.chipText, { color: colors.text.body }]}>+ effet</Text>
        </Pressable>
      </View>
      {draftCible === cible ? (
        <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
          <Segmented
            value={draftType}
            onChange={setDraftType}
            options={[
              { value: 'points', label: 'Points' },
              { value: 'tache', label: 'Tâche' },
              { value: 'amende', label: 'Amende' },
              { value: 'note', label: 'Note' },
            ]}
          />
          {draftType === 'points' ? (
            <CandyInput
              label="Points (négatif = pénalité)"
              value={draftValeur}
              onChangeText={setDraftValeur}
              keyboardType="numbers-and-punctuation"
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
          {draftType === 'tache' ? (
            <>
              <CandyInput
                label="Intitulé de la corvée"
                placeholder="Faire la vaisselle"
                value={draftTitre}
                onChangeText={setDraftTitre}
                style={{ marginTop: spacing.sm }}
              />
              <CandyInput label="À faire sous (jours)" value={draftJours} onChangeText={setDraftJours} keyboardType="number-pad" />
            </>
          ) : null}
          {draftType === 'amende' ? (
            <CandyInput
              label="Montant de l'amende (€) — versé à la cagnotte"
              value={draftMontant}
              onChangeText={setDraftMontant}
              keyboardType="decimal-pad"
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
          {draftType === 'note' ? (
            <CandyInput
              label="Message"
              placeholder="Bonnet ridicule toute la journée"
              value={draftTexte}
              onChangeText={setDraftTexte}
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
          <View style={styles.stepperRow}>
            <CandyButton label={t('common.ajouter')} onPress={addEffet} variant="pink" style={{ flex: 1 }} />
            <CandyButton label={t('common.annuler')} onPress={() => setDraftCible(null)} variant="ghost" style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}
    </View>
  );

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
      piece_ids: pieceIds,
      frequence,
      assignation,
      assigne_id: assignation === 'fixe' ? assigneId : undefined,
      rotation_ordre: assignation === 'rotation' ? rotationOrdre : undefined,
      rotation_conditions: assignation === 'rotation' ? rotationConditions.trim() || undefined : undefined,
      echeance_date: echeanceDate.trim() || undefined,
      echeance_heure: echeanceHeure.trim() || undefined,
      echeance_jour_semaine: echeanceJour,
      gage_actif: gageActif,
      penalite: gageActif ? penalite.trim() || undefined : undefined,
      recompense: gageActif ? recompense.trim() || undefined : undefined,
      points_penalite: gageActif ? pointsPenalite : undefined,
      points_recompense: gageActif ? pointsRecompense : undefined,
      gage_semaines: gageActif ? gageSemaines : undefined,
      gage_effets_echec: gageActif ? effetsEchec : undefined,
      gage_effets_reussite: gageActif ? effetsReussite : undefined,
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
    // ANNEXE V6 — boucle magique : célébration à chaque validation réussie.
    // Points = récompense du gage si actif, sinon un petit +1 symbolique.
    const gagnes = tache.gage_actif && tache.points_recompense ? tache.points_recompense : 1;
    setCelebrationPoints(gagnes);
    setCelebrationVisible(true);
    load();
    loadStreak();
  };

  const peutValider = (tache: Tache) => isGestion || (!!user && tache.titulaire?.id === user.id);

  const today = new Date();
  const tachesDuJour = taches.filter(
    (tc) => tc.frequence === 'quotidien' || (tc.echeance_date && isSameDay(tc.echeance_date, today))
  );
  const autresTaches = taches.filter((tc) => !tachesDuJour.includes(tc));

  // Corvées en cours : tâches dont le titulaire purge un gage (semaines dues).
  const tachesEnGage = taches
    .filter((tc) => (tc.gage_semaines_restantes ?? 0) > 0)
    .sort((a, b) => b.gage_semaines_restantes - a.gage_semaines_restantes);
  const totalSemaines = tachesEnGage.reduce((n, tc) => n + tc.gage_semaines_restantes, 0);

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
          {(tache.pieces ?? []).map((p) => (
            <Badge key={p.id} label={`🚪 ${p.nom}`} variant="neutral" />
          ))}
          {tache.gage_actif ? <Badge label={tache.recompense ? `🎁 ${tache.recompense}` : '🎁'} variant="yellow" /> : null}
          {tache.gage_actif && tache.penalite ? <Badge label={`⚠️ ${tache.penalite}`} variant="orange" /> : null}
          {tache.gage_semaines_restantes > 0 ? (
            <Badge label={`⛓️ ${tache.gage_semaines_restantes} ${t('gage.semCorvee')}`} variant="pink" />
          ) : null}
          {(tache.gage_effets_echec ?? []).slice(0, 3).map((e, i) => (
            <Badge key={`ge-${i}`} label={effetLabel(e)} variant="orange" />
          ))}
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
        <View style={styles.headerTitleRow}>
          <Text style={[styles.headerTitle, { color: colors.text.dark }]} numberOfLines={1}>{t('taches.titre')}</Text>
          {streak > 0 ? <Badge label={`🔥 ${streak} ${t('streak.jourAbrev')}`} variant="orange" /> : null}
        </View>
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
            {tachesEnGage.length > 0 ? (
              <View style={{ marginBottom: spacing.lg }}>
                <Text style={[styles.sectionLabel, { color: colors.text.dark }]}>
                  ⛓️ {t('gage.corveesEnCours')} ({totalSemaines} sem.)
                </Text>
                {tachesEnGage.map((tc) => (
                  <CandyCard key={`gage-${tc.id}`} style={styles.gageItem}>
                    <Avatar name={tc.titulaire?.nom} image={tc.titulaire?.image ?? null} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.gageTitulaire, { color: colors.text.dark }]} numberOfLines={1}>
                        {tc.titulaire ? tc.titulaire.nom : t('taches.personne')}
                      </Text>
                      <Text style={[styles.cardMeta, { color: colors.text.body }]} numberOfLines={1}>
                        {tc.titre}
                      </Text>
                    </View>
                    <Badge label={`${tc.gage_semaines_restantes} sem.`} variant="pink" />
                  </CandyCard>
                ))}
              </View>
            ) : null}

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

      <Celebration
        visible={celebrationVisible}
        points={celebrationPoints}
        emoji="✅"
        onDone={() => setCelebrationVisible(false)}
      />

      <BottomSheet
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={editing ? t('taches.modifierTache') : t('taches.nouvelleTache')}
        emoji="🧹"
        footer={
          <View>
            <CandyButton
              label={editing ? t('common.enregistrer') : t('taches.creerTache')}
              onPress={handleSave}
              loading={saving}
              variant="pink"
            />
            {editing ? (
              <CandyButton
                label={t('common.supprimer')}
                onPress={() => handleDelete(editing)}
                variant="ghost"
                style={{ marginTop: spacing.sm }}
              />
            ) : null}
          </View>
        }
      >
        <CandyInput label={t('taches.titreChamp')} placeholder={t('taches.titrePlaceholder')} value={titre} onChangeText={setTitre} />
              <CandyInput
                label={t('taches.descriptionOptionnelle')}
                value={description}
                onChangeText={setDescription}
                multiline
              />

              <Text style={[styles.label, { color: colors.text.dark }]}>
                {t('taches.pieceOptionnelle')} {pieceIds.length > 0 ? `(${pieceIds.length})` : ''}
              </Text>
              {pieces.length === 0 ? (
                <Text style={[styles.helperText, { color: colors.text.body }]}>Aucune pièce dans le logement pour l’instant.</Text>
              ) : (
                <View style={styles.chipsRow}>
                  {pieces.map((p) => {
                    const active = pieceIds.includes(p.id);
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => togglePiece(p.id)}
                        style={[
                          styles.chip,
                          { backgroundColor: colors.card, borderColor: colors.border },
                          active && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: active ? colors.primary.main : colors.text.body }]}>
                          {active ? '✓ ' : ''}{p.nom}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

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

              <Text style={[styles.label, { color: colors.text.dark, marginTop: spacing.md }]}>
                Ou avant un jour (récurrent)
              </Text>
              <Text style={[styles.helperText, { color: colors.text.body }]}>
                L’échéance se cale sur ce jour chaque période (ex. « avant mercredi »).
              </Text>
              <View style={styles.chipsRow}>
                {JOURS_SEMAINE.map((label, idx) => {
                  const active = echeanceJour === idx;
                  return (
                    <Pressable
                      key={label}
                      onPress={() => setEcheanceJour(active ? null : idx)}
                      style={[
                        styles.chip,
                        { backgroundColor: colors.card, borderColor: colors.border },
                        active && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: active ? colors.primary.main : colors.text.body }]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

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

              <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
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
                    {assignation === 'rotation' ? (
                      <View style={{ marginTop: spacing.md }}>
                        <Stepper
                          label={t('gage.semainesCorvee')}
                          value={gageSemaines}
                          onValueChange={setGageSemaines}
                          min={1}
                          max={12}
                        />
                        <Text style={[styles.helperText, { color: colors.text.body, marginTop: spacing.sm }]}>
                          {t('gage.semainesCorveeAide')}
                        </Text>
                      </View>
                    ) : null}

                    <GageEffetsEditor
                      effetsEchec={effetsEchec}
                      effetsReussite={effetsReussite}
                      onChangeEchec={setEffetsEchec}
                      onChangeReussite={setEffetsReussite}
                    />
                  </>
                ) : null}
              </View>

        {error ? <Text style={[styles.error, { color: colors.candy.red }]}>{error}</Text> : null}
      </BottomSheet>
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
  headerTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
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
  gageItem: { marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  gageTitulaire: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.extrabold },
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
