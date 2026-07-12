// app/(app)/boutique.tsx — Boutique de récompenses + échanges (ANNEXE V3)
// Cartes de récompenses (nom, coût), échange (désactivé si points
// insuffisants), "Mes échanges" (statut), et pour chef/co-chef : gestion
// (créer/éditer une récompense) + validation/refus des échanges.
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, X, Gift, Pencil, Check, XCircle } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { useMaison } from '../src/contexts/MaisonContext';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';
import boutiqueService, { Echange, Recompense } from '../src/services/boutiqueService';
import { Avatar, Badge, CandyButton, CandyCard, CandyInput, EmptyState, Segmented, Stepper, Toggle, VisitorBanner } from '../components/ui';
import { typography, spacing, borderRadius } from '../theme/designTokens';

type Tab = 'boutique' | 'echanges' | 'gestion';

const STATUT_VARIANT: Record<string, 'orange' | 'green' | 'neutral'> = {
  demande: 'orange',
  valide: 'green',
  refuse: 'neutral',
};

export default function BoutiqueScreen() {
  const { maisonActive, membres, isGestion, isVisiteur } = useMaison();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t, lang } = useT();

  const [tab, setTab] = useState<Tab>('boutique');
  const [recompenses, setRecompenses] = useState<Recompense[]>([]);
  const [echanges, setEchanges] = useState<Echange[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Recompense | null>(null);
  const [nom, setNom] = useState('');
  const [cout, setCout] = useState(10);
  const [description, setDescription] = useState('');
  const [actif, setActif] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [exchangingId, setExchangingId] = useState<number | null>(null);

  const mesPoints = membres.find((m) => m.id === user?.id)?.points ?? 0;

  const load = useCallback(async () => {
    if (!maisonActive) {
      setRecompenses([]);
      setEchanges([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [recRes, echRes] = await Promise.all([
        boutiqueService.list(maisonActive.id),
        boutiqueService.listEchanges(maisonActive.id),
      ]);
      setRecompenses(recRes.data ?? []);
      setEchanges(echRes.data ?? []);
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

  const nomFor = (uid: number) => membres.find((m) => m.id === uid)?.nom ?? `#${uid}`;
  const imageFor = (uid: number) => membres.find((m) => m.id === uid)?.image ?? null;

  const openCreate = () => {
    setEditing(null);
    setNom('');
    setCout(10);
    setDescription('');
    setActif(true);
    setError('');
    setModalVisible(true);
  };

  const openEdit = (r: Recompense) => {
    setEditing(r);
    setNom(r.nom);
    setCout(r.cout_points);
    setDescription(r.description ?? '');
    setActif(r.actif);
    setError('');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!maisonActive || !nom.trim()) {
      setError(t('courses.nom'));
      return;
    }
    setSaving(true);
    setError('');
    const res = editing
      ? await boutiqueService.update(editing.id, { nom: nom.trim(), cout_points: cout, description: description.trim() || undefined, actif })
      : await boutiqueService.create(maisonActive.id, { nom: nom.trim(), cout_points: cout, description: description.trim() || undefined, actif });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setModalVisible(false);
    load();
  };

  const handleDelete = (r: Recompense) => {
    Alert.alert(t('common.supprimer') + ' ?', r.nom, [
      { text: t('common.annuler'), style: 'cancel' },
      {
        text: t('common.supprimer'),
        style: 'destructive',
        onPress: async () => {
          setModalVisible(false);
          await boutiqueService.remove(r.id);
          load();
        },
      },
    ]);
  };

  const handleEchanger = async (r: Recompense) => {
    if (!maisonActive) return;
    setExchangingId(r.id);
    const res = await boutiqueService.echanger(r.id);
    setExchangingId(null);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    Alert.alert(t('boutique.echanger'), '✅');
    load();
  };

  const handleValider = async (e: Echange) => {
    await boutiqueService.validerEchange(e.id);
    load();
  };

  const handleRefuser = async (e: Echange) => {
    await boutiqueService.refuserEchange(e.id);
    load();
  };

  const mesEchanges = echanges.filter((e) => e.utilisateur_id === user?.id);
  const echangesEnAttente = echanges.filter((e) => e.statut === 'demande');

  const tabOptions = [
    { value: 'boutique' as Tab, label: t('boutique.titre') },
    { value: 'echanges' as Tab, label: t('boutique.mesEchanges') },
    ...(isGestion ? [{ value: 'gestion' as Tab, label: t('boutique.gestion') }] : []),
  ];

  const renderRecompenseCard = (r: Recompense, gestion: boolean) => {
    const disabled = mesPoints < r.cout_points || !r.actif;
    return (
      <CandyCard key={r.id} style={styles.card}>
        <View style={styles.cardTopRow}>
          <Text style={[styles.cardTitle, { color: colors.text.dark }]} numberOfLines={2}>
            {r.nom}
          </Text>
          <Badge label={`${r.cout_points} pts`} variant="yellow" />
        </View>
        {r.description ? <Text style={[styles.cardDesc, { color: colors.text.body }]}>{r.description}</Text> : null}
        {!r.actif ? <Badge label={t('boutique.inactif')} variant="neutral" style={{ marginTop: spacing.xs }} /> : null}
        {gestion ? (
          <Pressable onPress={() => openEdit(r)} style={styles.editRow}>
            <Pencil size={14} color={colors.primary.main} />
            <Text style={[styles.editText, { color: colors.primary.main }]}>{t('common.modifier')}</Text>
          </Pressable>
        ) : !isVisiteur ? (
          <CandyButton
            label={disabled && mesPoints < r.cout_points ? t('boutique.pointsInsuffisants') : t('boutique.echanger')}
            onPress={() => handleEchanger(r)}
            disabled={disabled}
            loading={exchangingId === r.id}
            variant="purple"
            size="sm"
            icon={<Gift size={16} color={colors.candy.white} />}
            style={{ marginTop: spacing.sm }}
          />
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
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>🎁 {t('boutique.titre')}</Text>
        {tab === 'gestion' ? (
          <Pressable onPress={openCreate} hitSlop={10}>
            <Plus size={22} color={colors.primary.main} />
          </Pressable>
        ) : (
          <Badge label={`${mesPoints} pts`} variant="yellow" />
        )}
      </View>

      <View style={styles.segmentedWrap}>
        <Segmented value={tab} onChange={setTab} options={tabOptions} />
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
      >
        {isVisiteur ? <VisitorBanner /> : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
        ) : tab === 'boutique' ? (
          recompenses.filter((r) => r.actif).length === 0 ? (
            <EmptyState emoji="🎁" title={t('common.aucunResultat')} />
          ) : (
            recompenses.filter((r) => r.actif).map((r) => renderRecompenseCard(r, false))
          )
        ) : tab === 'echanges' ? (
          mesEchanges.length === 0 ? (
            <EmptyState emoji="🧾" title={t('common.aucunResultat')} />
          ) : (
            mesEchanges.map((e) => (
              <CandyCard key={e.id} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <Text style={[styles.cardTitle, { color: colors.text.dark }]} numberOfLines={1}>
                    {e.recompense_nom ?? `#${e.recompense_id}`}
                  </Text>
                  <Badge
                    label={e.statut === 'demande' ? t('boutique.statutDemande') : e.statut === 'valide' ? t('boutique.statutValide') : t('boutique.statutRefuse')}
                    variant={STATUT_VARIANT[e.statut]}
                  />
                </View>
                <Text style={[styles.cardDesc, { color: colors.text.body }]}>{e.cout} pts · {new Date(e.date_creation).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR')}</Text>
              </CandyCard>
            ))
          )
        ) : (
          // Gestion
          <>
            <Text style={[styles.sectionLabel, { color: colors.text.dark }]}>{t('boutique.titre')}</Text>
            {recompenses.length === 0 ? (
              <EmptyState emoji="🎁" title={t('common.aucunResultat')} />
            ) : (
              recompenses.map((r) => renderRecompenseCard(r, true))
            )}

            <Text style={[styles.sectionLabel, { color: colors.text.dark, marginTop: spacing.lg }]}>
              {t('boutique.mesEchanges')} ({echangesEnAttente.length})
            </Text>
            {echangesEnAttente.length === 0 ? (
              <CandyCard style={styles.card}>
                <Text style={[styles.cardDesc, { color: colors.text.body }]}>{t('common.aucunResultat')}</Text>
              </CandyCard>
            ) : (
              echangesEnAttente.map((e) => (
                <CandyCard key={e.id} style={styles.card}>
                  <View style={styles.membreRow}>
                    <Avatar name={nomFor(e.utilisateur_id)} image={imageFor(e.utilisateur_id)} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: colors.text.dark }]} numberOfLines={1}>
                        {e.recompense_nom ?? `#${e.recompense_id}`}
                      </Text>
                      <Text style={[styles.cardDesc, { color: colors.text.body }]}>{nomFor(e.utilisateur_id)} · {e.cout} pts</Text>
                    </View>
                  </View>
                  <View style={styles.gestionButtonsRow}>
                    <CandyButton label={t('common.valider')} onPress={() => handleValider(e)} variant="green" size="sm" icon={<Check size={16} color={colors.candy.white} />} style={{ flex: 1 }} />
                    <CandyButton label={t('common.refuser')} onPress={() => handleRefuser(e)} variant="danger" size="sm" icon={<XCircle size={16} color={colors.candy.white} />} style={{ flex: 1 }} />
                  </View>
                </CandyCard>
              ))
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text.dark }]}>
                  {editing ? t('common.modifier') : t('boutique.echanger')} 🎁
                </Text>
                <Pressable onPress={() => setModalVisible(false)} hitSlop={10}>
                  <X size={22} color={colors.text.dark} />
                </Pressable>
              </View>

              <CandyInput label={t('courses.nom')} value={nom} onChangeText={setNom} />
              <Stepper label={t('boutique.cout')} value={cout} onValueChange={setCout} min={1} max={1000} suffix="pts" />
              <CandyInput label={t('boutique.description')} value={description} onChangeText={setDescription} multiline />
              <View style={styles.toggleRow}>
                <Text style={[styles.label, { color: colors.text.dark }]}>{t('boutique.active')}</Text>
                <Toggle value={actif} onValueChange={setActif} />
              </View>

              {error ? <Text style={[styles.error, { color: colors.candy.red }]}>{error}</Text> : null}

              <CandyButton label={t('common.enregistrer')} onPress={handleSave} loading={saving} variant="purple" />
              {editing ? (
                <CandyButton
                  label={t('common.supprimer')}
                  onPress={() => handleDelete(editing)}
                  variant="ghost"
                  style={{ marginTop: spacing.sm }}
                />
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
  segmentedWrap: { paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  container: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing['4xl'] },
  card: { marginBottom: spacing.sm },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  cardDesc: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: spacing.xs },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  editText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  sectionLabel: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold, marginBottom: spacing.sm },
  membreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gestionButtonsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  modalTitle: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.black },
  label: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  error: { fontWeight: typography.fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
});
