// app/(app)/activites/[id].tsx
// Détail d'une activité : édition (titre, description, échéance/heure,
// assignés, statut, gage, rotation) et suppression (chef ou créateur).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  Trash2,
  Gift,
  Repeat,
  Check,
  X as XIcon,
  ArrowRightCircle,
  ListChecks,
  Plus,
  ImagePlus,
  MessageSquare,
  Send,
} from 'lucide-react-native';
import ScreenBackground from '../../components/ScreenBackground';
import { useMaison } from '../../src/contexts/MaisonContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { useT } from '../../src/i18n';
import activiteService, { Activite, Recurrence, StatutActivite, SousTache, Visibilite } from '../../src/services/activiteService';
import { planifierRappelActivite } from '../../src/services/reminderService';
import chatService, { Commentaire } from '../../src/services/chatService';
import apiClient from '../../src/services/apiClient';
import { Avatar, Badge, CandyButton, CandyCard, CandyInput, Checkbox, Segmented, Toggle, Stepper } from '../../components/ui';
import { typography, spacing, borderRadius } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';

const RECURRENCES: { value: Recurrence; labelKey: string }[] = [
  { value: 'aucune', labelKey: 'activite.aucune' },
  { value: 'quotidien', labelKey: 'activite.quotidien' },
  { value: 'hebdo', labelKey: 'activite.hebdo' },
  { value: 'mensuel', labelKey: 'activite.mensuel' },
];

export default function ActiviteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const activiteId = Number(id);
  const { membres, isChef } = useMaison();
  const { user } = useAuth();
  const { t } = useT();
  const { colors } = useTheme();
  const STATUTS: { value: StatutActivite; label: string; variant: 'orange' | 'blue' | 'green' }[] = [
    { value: 'a_faire', label: t('statut.aFaire'), variant: 'orange' },
    { value: 'en_cours', label: t('statut.enCours'), variant: 'blue' },
    { value: 'termine', label: t('statut.termine'), variant: 'green' },
  ];

  const [activite, setActivite] = useState<Activite | null>(null);
  const [loading, setLoading] = useState(true);
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [dateEcheance, setDateEcheance] = useState('');
  const [heureEcheance, setHeureEcheance] = useState('');
  const [rappel, setRappel] = useState(true);
  const [statut, setStatut] = useState<StatutActivite>('a_faire');
  const [assignes, setAssignes] = useState<number[]>([]);

  const [gageActif, setGageActif] = useState(false);
  const [penalite, setPenalite] = useState('');
  const [recompense, setRecompense] = useState('');
  const [pointsPenalite, setPointsPenalite] = useState(5);
  const [pointsRecompense, setPointsRecompense] = useState(5);

  const [rotationActive, setRotationActive] = useState(false);
  const [rotationOrdre, setRotationOrdre] = useState<number[]>([]);
  const [rotationDelaiJours, setRotationDelaiJours] = useState(1);

  // ANNEXE V4 — visibilité (toute la maison / participants) + participants.
  const [visibilite, setVisibilite] = useState<Visibilite>('maison');
  const [participants, setParticipants] = useState<number[]>([]);

  // ANNEXE V3 — récurrence, sous-tâches, photo preuve, commentaires.
  const [recurrence, setRecurrence] = useState<Recurrence>('aucune');
  const [sousTaches, setSousTaches] = useState<SousTache[]>([]);
  const [newSousTache, setNewSousTache] = useState('');
  const [addingSousTache, setAddingSousTache] = useState(false);
  const [uploadingPreuve, setUploadingPreuve] = useState(false);
  const [commentaires, setCommentaires] = useState<Commentaire[]>([]);
  const [loadingCommentaires, setLoadingCommentaires] = useState(false);
  const [newCommentaire, setNewCommentaire] = useState('');
  const [sendingCommentaire, setSendingCommentaire] = useState(false);

  const [saving, setSaving] = useState(false);
  const [resolvingGage, setResolvingGage] = useState(false);
  const [advancingRotation, setAdvancingRotation] = useState(false);
  const [error, setError] = useState('');

  const applyActivite = (data: Activite) => {
    setActivite(data);
    setTitre(data.titre);
    setDescription(data.description || '');
    setDateEcheance(data.date_echeance || '');
    setHeureEcheance(data.heure_echeance || '');
    setRappel(data.rappel);
    setStatut(data.statut);
    setAssignes(data.assignes.map((a) => a.id));
    setGageActif(data.gage_actif);
    setPenalite(data.penalite || '');
    setRecompense(data.recompense || '');
    setPointsPenalite(data.points_penalite ?? 5);
    setPointsRecompense(data.points_recompense ?? 5);
    setRotationActive(data.rotation_active);
    setRotationOrdre(data.rotation_ordre || []);
    setRotationDelaiJours(data.rotation_delai_jours || 1);
    setRecurrence(data.recurrence || 'aucune');
    setSousTaches(data.sous_taches || []);
    setVisibilite(data.visibilite || 'maison');
    setParticipants((data.participants || []).map((p) => p.id));
  };

  const loadCommentaires = useCallback(async () => {
    if (!activiteId) return;
    setLoadingCommentaires(true);
    const res = await chatService.listCommentaires(activiteId);
    setCommentaires(res.data ?? []);
    setLoadingCommentaires(false);
  }, [activiteId]);

  const load = useCallback(async () => {
    if (!activiteId) return;
    setLoading(true);
    const res = await activiteService.get(activiteId);
    if (res.data) {
      applyActivite(res.data);
    }
    setLoading(false);
    loadCommentaires();
  }, [activiteId, loadCommentaires]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activiteId]);

  const toggleAssigne = (mid: number) => {
    setAssignes((prev) => (prev.includes(mid) ? prev.filter((x) => x !== mid) : [...prev, mid]));
  };

  const toggleRotationMembre = (mid: number) => {
    setRotationOrdre((prev) => (prev.includes(mid) ? prev.filter((x) => x !== mid) : [...prev, mid]));
  };

  const toggleParticipant = (mid: number) => {
    setParticipants((prev) => (prev.includes(mid) ? prev.filter((x) => x !== mid) : [...prev, mid]));
  };

  const peutGererGage = !!activite && !!user && (isChef || activite.createur_id === user.id);
  const peutAvancerRotation =
    !!activite && !!user && (isChef || activite.createur_id === user.id || activite.rotation_titulaire?.id === user.id);

  const handleSave = async () => {
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
    const res = await activiteService.update(activiteId, {
      titre: titre.trim(),
      description: description.trim() || undefined,
      date_echeance: dateEcheance.trim() || undefined,
      heure_echeance: heureEcheance.trim() || undefined,
      rappel,
      statut,
      assignes,
      gage_actif: gageActif,
      penalite: gageActif ? penalite.trim() || undefined : undefined,
      recompense: gageActif ? recompense.trim() || undefined : undefined,
      points_penalite: gageActif ? pointsPenalite : undefined,
      points_recompense: gageActif ? pointsRecompense : undefined,
      rotation_active: rotationActive,
      rotation_ordre: rotationActive ? rotationOrdre : undefined,
      rotation_delai_jours: rotationActive ? rotationDelaiJours : undefined,
      recurrence,
      visibilite,
      participants: visibilite === 'participants' ? participants : undefined,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.data) {
      applyActivite(res.data);
      planifierRappelActivite(res.data).catch(() => {});
    }
    Alert.alert(t('activite.enregistreTitre'), t('activite.miseAJour'));
  };

  const handleResoudreGage = (resultat: 'reussi' | 'echoue') => {
    Alert.alert(
      resultat === 'reussi' ? t('activite.confirmerGageReussi') : t('activite.confirmerGageEchoue'),
      resultat === 'reussi' ? t('activite.gageReussiMessage') : t('activite.gageEchoueMessage'),
      [
        { text: t('common.annuler'), style: 'cancel' },
        {
          text: t('common.confirmer'),
          onPress: async () => {
            setResolvingGage(true);
            const res = await activiteService.resoudreGage(activiteId, resultat);
            setResolvingGage(false);
            if (res.error) {
              Alert.alert(t('common.erreur'), res.error);
              return;
            }
            if (res.data) applyActivite(res.data);
          },
        },
      ]
    );
  };

  const handleRotationSuivant = async () => {
    setAdvancingRotation(true);
    const res = await activiteService.rotationSuivant(activiteId);
    setAdvancingRotation(false);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    if (res.data) applyActivite(res.data);
  };

  const handleDelete = () => {
    Alert.alert(t('activite.supprimerConfirmTitre'), t('common.actionIrreversible'), [
      { text: t('common.annuler'), style: 'cancel' },
      {
        text: t('common.supprimer'),
        style: 'destructive',
        onPress: async () => {
          const res = await activiteService.remove(activiteId);
          if (res.error) {
            Alert.alert(t('common.erreur'), res.error);
            return;
          }
          router.back();
        },
      },
    ]);
  };

  // ---- Sous-tâches (checklist) ----
  const handleAddSousTache = async () => {
    if (!newSousTache.trim()) return;
    setAddingSousTache(true);
    const res = await activiteService.createSousTache(activiteId, newSousTache.trim());
    setAddingSousTache(false);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    if (res.data) {
      setSousTaches((prev) => [...prev, res.data as SousTache]);
      setNewSousTache('');
    }
  };

  const handleToggleSousTache = async (st: SousTache) => {
    setSousTaches((prev) => prev.map((x) => (x.id === st.id ? { ...x, fait: !x.fait } : x)));
    const res = await activiteService.updateSousTache(st.id, { fait: !st.fait });
    if (res.data) {
      setSousTaches((prev) => prev.map((x) => (x.id === st.id ? (res.data as SousTache) : x)));
    }
  };

  const handleRemoveSousTache = async (st: SousTache) => {
    setSousTaches((prev) => prev.filter((x) => x.id !== st.id));
    await activiteService.removeSousTache(st.id);
  };

  // ---- Photo preuve ----
  const handlePickPreuve = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('maison.permissionRefusee'), t('activite.permissionPreuveMessage'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setUploadingPreuve(true);
    const res = await activiteService.uploadPreuve(activiteId, result.assets[0].uri);
    setUploadingPreuve(false);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    if (res.data && activite) {
      setActivite({ ...activite, preuve_url: res.data.preuve_url });
    }
  };

  // ---- Commentaires ----
  const handleAddCommentaire = async () => {
    if (!newCommentaire.trim()) return;
    setSendingCommentaire(true);
    const res = await chatService.ajouterCommentaire(activiteId, newCommentaire.trim());
    setSendingCommentaire(false);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    if (res.data) {
      setCommentaires((prev) => [...prev, res.data as Commentaire]);
      setNewCommentaire('');
    }
  };

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>{t('activite.detailTitre')}</Text>
        <Pressable onPress={handleDelete} hitSlop={10}>
          <Trash2 size={20} color={colors.candy.red} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing['2xl'] }} color={colors.primary.main} />
      ) : !activite ? (
        <Text style={[styles.notFound, { color: colors.text.body }]}>{t('activite.introuvable')}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {/* Gage : résolution */}
          {activite.gage_actif ? (
            <CandyCard style={styles.gageCard}>
              <View style={styles.sectionCardTitleRow}>
                <Gift size={16} color={colors.candy.orangeDark} />
                <Text style={[styles.sectionCardTitle, { color: colors.text.dark }]}>{t('activite.gage')}</Text>
              </View>
              {activite.recompense ? (
                <Text style={[styles.gageText, { color: colors.text.body }]}>
                  {t('activite.recompenseLigne')} {activite.recompense} ({activite.points_recompense} pts)
                </Text>
              ) : null}
              {activite.penalite ? (
                <Text style={[styles.gageText, { color: colors.text.body }]}>
                  {t('activite.penaliteLigne')} {activite.penalite} ({activite.points_penalite} pts)
                </Text>
              ) : null}

              {activite.gage_resultat !== 'en_attente' ? (
                <Badge
                  label={activite.gage_resultat === 'reussi' ? t('activite.gageReussiBadge') : t('activite.gageEchoueBadge')}
                  variant={activite.gage_resultat === 'reussi' ? 'green' : 'orange'}
                  style={{ marginTop: spacing.sm }}
                />
              ) : peutGererGage ? (
                <View style={styles.gageButtonsRow}>
                  <CandyButton
                    label={t('activite.boutonReussi')}
                    onPress={() => handleResoudreGage('reussi')}
                    variant="green"
                    size="sm"
                    loading={resolvingGage}
                    icon={<Check size={16} color={colors.candy.white} />}
                    style={{ flex: 1 }}
                  />
                  <CandyButton
                    label={t('activite.boutonEchoue')}
                    onPress={() => handleResoudreGage('echoue')}
                    variant="danger"
                    size="sm"
                    loading={resolvingGage}
                    icon={<XIcon size={16} color={colors.candy.white} />}
                    style={{ flex: 1 }}
                  />
                </View>
              ) : (
                <Badge label={t('activite.enAttenteResolution')} variant="neutral" style={{ marginTop: spacing.sm }} />
              )}
            </CandyCard>
          ) : null}

          {/* Rotation : titulaire courant */}
          {activite.rotation_active ? (
            <CandyCard style={styles.gageCard}>
              <View style={styles.sectionCardTitleRow}>
                <Repeat size={16} color={colors.secondary.main} />
                <Text style={[styles.sectionCardTitle, { color: colors.text.dark }]}>{t('activite.rotation')}</Text>
              </View>
              {activite.rotation_titulaire ? (
                <View style={styles.titulaireRow}>
                  <Avatar name={activite.rotation_titulaire.nom} image={activite.rotation_titulaire.image} size={32} />
                  <Text style={[styles.gageText, { color: colors.text.body }]}>
                    {t('activite.tourDe')} {activite.rotation_titulaire.nom} 🔄
                  </Text>
                </View>
              ) : (
                <Text style={[styles.gageText, { color: colors.text.body }]}>{t('activite.aucunTitulaire')}</Text>
              )}
              <Text style={[styles.helperText, { color: colors.text.body }]}>
                {t('activite.delaiAvantRelais')} {activite.rotation_delai_jours} {t('activite.jourAbrev')}
              </Text>
              {peutAvancerRotation ? (
                <CandyButton
                  label={t('activite.tourSuivant')}
                  onPress={handleRotationSuivant}
                  variant="purple"
                  size="sm"
                  loading={advancingRotation}
                  icon={<ArrowRightCircle size={16} color={colors.candy.white} />}
                  style={{ marginTop: spacing.sm }}
                />
              ) : null}
            </CandyCard>
          ) : null}

          <CandyCard style={{ marginBottom: spacing.lg }}>
            {activite.createur ? (
              <View style={styles.createurRow}>
                <Avatar name={activite.createur.nom} image={activite.createur.image} size={24} />
                <Text style={[styles.createurText, { color: colors.text.body }]}>
                  {t('activite.creeePar')} {activite.createur.nom}
                </Text>
              </View>
            ) : null}

            <CandyInput label={t('common.titre')} value={titre} onChangeText={setTitre} />
            <CandyInput label={t('boutique.description')} value={description} onChangeText={setDescription} multiline />
            <CandyInput label={t('activite.echeanceFormat')} value={dateEcheance} onChangeText={setDateEcheance} placeholder="2026-07-15" />
            <CandyInput label={t('activite.heureFormat')} value={heureEcheance} onChangeText={setHeureEcheance} placeholder="18:30" />

            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, { color: colors.text.dark }]}>{t('activite.rappel')}</Text>
              <Toggle value={rappel} onValueChange={setRappel} />
            </View>

            <Text style={[styles.label, { color: colors.text.dark }]}>{t('activite.statutLabel')}</Text>
            <View style={styles.statutRow}>
              {STATUTS.map((s) => (
                <Pressable key={s.value} onPress={() => setStatut(s.value)}>
                  <Badge label={s.label} variant={statut === s.value ? s.variant : 'neutral'} />
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.text.dark }]}>{t('activite.assigneA')}</Text>
            <View style={styles.membresList}>
              {membres.map((m) => {
                const active = assignes.includes(m.id);
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => toggleAssigne(m.id)}
                    style={[
                      styles.membreChip,
                      { backgroundColor: colors.candy.cream, borderColor: colors.border },
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
                        { backgroundColor: colors.candy.cream, borderColor: colors.border },
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
                  <CandyInput label={t('activite.recompenseSiReussiCourt')} placeholder={t('activite.recompensePlaceholder')} value={recompense} onChangeText={setRecompense} />
                  <CandyInput label={t('activite.penaliteSiEchoueCourt')} placeholder={t('activite.penalitePlaceholder')} value={penalite} onChangeText={setPenalite} />
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
                            { backgroundColor: colors.candy.cream, borderColor: colors.border },
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

            {/* ANNEXE V3 — récurrence */}
            <View style={[styles.sectionCard, { backgroundColor: colors.candy.cream }]}>
              <View style={styles.sectionCardTitleRow}>
                <Repeat size={16} color={colors.candy.blueDark} />
                <Text style={[styles.sectionCardTitle, { color: colors.text.dark }]}>{t('activite.recurrence')}</Text>
              </View>
              <View style={{ marginTop: spacing.sm }}>
                <Segmented
                  value={recurrence}
                  onChange={setRecurrence}
                  options={RECURRENCES.map((r) => ({ value: r.value, label: t(r.labelKey) }))}
                />
              </View>
            </View>

            {error ? <Text style={[styles.error, { color: colors.candy.red }]}>{error}</Text> : null}

            <CandyButton label={t('common.enregistrer')} onPress={handleSave} loading={saving} variant="pink" />
          </CandyCard>

          {/* ANNEXE V3 — sous-tâches (checklist) */}
          <CandyCard style={styles.gageCard}>
            <View style={styles.sectionCardTitleRow}>
              <ListChecks size={16} color={colors.candy.greenDark} />
              <Text style={[styles.sectionCardTitle, { color: colors.text.dark }]}>{t('activite.sousTaches')}</Text>
            </View>
            {sousTaches.map((st) => (
              <View key={st.id} style={styles.sousTacheRow}>
                <Checkbox checked={st.fait} onToggle={() => handleToggleSousTache(st)} size={22} />
                <Text
                  style={[styles.sousTacheText, { color: st.fait ? colors.text.muted : colors.text.dark }, st.fait && { textDecorationLine: 'line-through' }]}
                  numberOfLines={2}
                >
                  {st.titre}
                </Text>
                <Pressable onPress={() => handleRemoveSousTache(st)} hitSlop={8}>
                  <Trash2 size={16} color={colors.candy.red} />
                </Pressable>
              </View>
            ))}
            <View style={styles.addSousTacheRow}>
              <View style={{ flex: 1 }}>
                <CandyInput
                  placeholder={t('activite.ajouterSousTache')}
                  value={newSousTache}
                  onChangeText={setNewSousTache}
                  style={{ marginBottom: 0 }}
                />
              </View>
              <Pressable
                onPress={handleAddSousTache}
                disabled={addingSousTache || !newSousTache.trim()}
                style={[styles.addSousTacheButton, { backgroundColor: colors.primary.main }]}
              >
                {addingSousTache ? <ActivityIndicator size="small" color={colors.candy.white} /> : <Plus size={18} color={colors.candy.white} />}
              </Pressable>
            </View>
          </CandyCard>

          {/* ANNEXE V3 — photo preuve */}
          <CandyCard style={styles.gageCard}>
            <View style={styles.sectionCardTitleRow}>
              <ImagePlus size={16} color={colors.candy.purpleDark} />
              <Text style={[styles.sectionCardTitle, { color: colors.text.dark }]}>{t('activite.preuve')}</Text>
            </View>
            {activite.preuve_url ? (
              <Image
                source={{ uri: apiClient.resolveMediaUrl(activite.preuve_url) || activite.preuve_url }}
                style={styles.preuveImage}
                contentFit="cover"
              />
            ) : null}
            <CandyButton
              label={t('activite.ajouterPreuve')}
              onPress={handlePickPreuve}
              loading={uploadingPreuve}
              variant="purple"
              size="sm"
              icon={<ImagePlus size={16} color={colors.candy.white} />}
              style={{ marginTop: spacing.sm }}
            />
          </CandyCard>

          {/* ANNEXE V3 — commentaires */}
          <CandyCard style={styles.gageCard}>
            <View style={styles.sectionCardTitleRow}>
              <MessageSquare size={16} color={colors.secondary.main} />
              <Text style={[styles.sectionCardTitle, { color: colors.text.dark }]}>{t('activite.commentaires')}</Text>
            </View>
            {loadingCommentaires ? (
              <ActivityIndicator style={{ marginTop: spacing.sm }} color={colors.primary.main} />
            ) : commentaires.length === 0 ? (
              <Text style={[styles.helperText, { color: colors.text.body }]}>{t('common.aucunResultat')}</Text>
            ) : (
              commentaires.map((c) => (
                <View key={c.id} style={styles.commentaireRow}>
                  <Avatar name={c.auteur?.nom} image={c.auteur?.image} size={26} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.commentaireAuteur, { color: colors.text.dark }]}>{c.auteur?.nom ?? '?'}</Text>
                    <Text style={[styles.commentaireTexte, { color: colors.text.body }]}>{c.contenu}</Text>
                  </View>
                </View>
              ))
            )}
            <View style={styles.addSousTacheRow}>
              <View style={{ flex: 1 }}>
                <CandyInput
                  placeholder={t('chat.placeholder')}
                  value={newCommentaire}
                  onChangeText={setNewCommentaire}
                  style={{ marginBottom: 0 }}
                />
              </View>
              <Pressable
                onPress={handleAddCommentaire}
                disabled={sendingCommentaire || !newCommentaire.trim()}
                style={[styles.addSousTacheButton, { backgroundColor: colors.primary.main }]}
              >
                {sendingCommentaire ? <ActivityIndicator size="small" color={colors.candy.white} /> : <Send size={16} color={colors.candy.white} />}
              </Pressable>
            </View>
          </CandyCard>
        </ScrollView>
      )}
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
  notFound: { textAlign: 'center', marginTop: spacing['2xl'] },
  createurRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  createurText: { fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.sm },
  label: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  toggleLabel: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.md },
  statutRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
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
  helperText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: spacing.xs, marginBottom: spacing.sm },
  error: { fontWeight: typography.fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
  gageCard: { marginBottom: spacing.lg },
  gageText: { fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.sm, marginTop: spacing.xs },
  gageButtonsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  titulaireRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  sousTacheRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  sousTacheText: { flex: 1, fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.sm },
  addSousTacheRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  addSousTacheButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preuveImage: { width: '100%', height: 180, borderRadius: borderRadius.lg, marginTop: spacing.sm },
  commentaireRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md },
  commentaireAuteur: { fontWeight: typography.fontWeight.extrabold, fontSize: typography.fontSize.xs },
  commentaireTexte: { fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.sm, marginTop: 2 },
});
