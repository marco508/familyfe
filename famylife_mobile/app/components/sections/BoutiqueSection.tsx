// components/sections/BoutiqueSection.tsx
// ANNEXE V7 — Corps de l'ancien écran `(app)/boutique.tsx`, extrait pour être
// rendu comme segment du hub Équité. Ne rend ni fond ni en-tête : le solde de
// points et les sous-onglets restent internes, l'action "créer" passe en FAB.
// Boutique de récompenses + échanges (ANNEXE V3).
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Plus, Gift, Pencil, Check, XCircle } from 'lucide-react-native';
import { useMaison } from '../../src/contexts/MaisonContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';
import boutiqueService, { Echange, Recompense } from '../../src/services/boutiqueService';
import { Avatar, Badge, BottomSheet, CandyButton, CandyCard, CandyInput, EmptyState, Fab, Segmented, Stepper, Toggle, VisitorBanner } from '../ui';
import { typography, spacing } from '../../theme/designTokens';

type SousOnglet = 'boutique' | 'echanges' | 'gestion';

const STATUT_VARIANT: Record<string, 'orange' | 'green' | 'neutral'> = {
  demande: 'orange',
  valide: 'green',
  refuse: 'neutral',
};

interface Props {
  bottomInset?: number;
}

export default function BoutiqueSection({ bottomInset = spacing['4xl'] }: Props) {
  const { maisonActive, membres, isGestion, isVisiteur } = useMaison();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t, lang } = useT();

  const [sousOnglet, setSousOnglet] = useState<SousOnglet>('boutique');
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
      setError(t('activite.titreObligatoire'));
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

  const sousOngletOptions = [
    { value: 'boutique' as SousOnglet, label: t('boutique.titre') },
    { value: 'echanges' as SousOnglet, label: t('boutique.mesEchanges') },
    ...(isGestion ? [{ value: 'gestion' as SousOnglet, label: t('boutique.gestion') }] : []),
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
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
      >
        {/* Solde de points : il était dans l'en-tête de l'ancien écran, il vit
            désormais dans le segment (l'en-tête appartient au hub). */}
        <View style={styles.soldeRow}>
          <Badge label={`${mesPoints} pts`} variant="yellow" />
        </View>

        <View style={styles.sousOngletWrap}>
          <Segmented value={sousOnglet} onChange={setSousOnglet} options={sousOngletOptions} />
        </View>

        {isVisiteur ? <VisitorBanner /> : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
        ) : sousOnglet === 'boutique' ? (
          recompenses.filter((r) => r.actif).length === 0 ? (
            <EmptyState
              emoji="🎁"
              title={t('boutique.aucuneRecompense')}
              message={isGestion ? t('boutique.creerBouton') : undefined}
            />
          ) : (
            recompenses.filter((r) => r.actif).map((r) => renderRecompenseCard(r, false))
          )
        ) : sousOnglet === 'echanges' ? (
          mesEchanges.length === 0 ? (
            <EmptyState emoji="🧾" title={t('boutique.aucunEchange')} />
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
                <Text style={[styles.cardDesc, { color: colors.text.body }]}>
                  {e.cout} pts · {new Date(e.date_creation).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR')}
                </Text>
              </CandyCard>
            ))
          )
        ) : (
          // Gestion
          <>
            <Text style={[styles.sectionLabel, { color: colors.text.dark }]}>{t('boutique.titre')}</Text>
            {recompenses.length === 0 ? (
              <EmptyState
                emoji="🎁"
                title={t('boutique.aucuneRecompense')}
                message={t('boutique.creerBouton')}
              />
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

      {/* Un chef doit TOUJOURS pouvoir créer une récompense, quel que soit le
          sous-onglet affiché : le formulaire ne dépend pas de l'onglet. */}
      {isGestion ? (
        <Fab
          icon={<Plus size={24} color={colors.candy.white} />}
          onPress={openCreate}
          style={[styles.fab, { bottom: bottomInset - spacing.xl }]}
        />
      ) : null}

      <BottomSheet
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={editing ? t('common.modifier') : t('boutique.nouvelleRecompense')}
        emoji="🎁"
        footer={
          <View>
            <CandyButton label={t('common.enregistrer')} onPress={handleSave} loading={saving} variant="purple" />
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
        <CandyInput label={t('common.titre')} value={nom} onChangeText={setNom} />
        <Stepper label={t('boutique.cout')} value={cout} onValueChange={setCout} min={1} max={1000} suffix="pts" />
        <CandyInput label={t('boutique.description')} value={description} onChangeText={setDescription} multiline />
        <View style={styles.toggleRow}>
          <Text style={[styles.label, { color: colors.text.dark }]}>{t('boutique.active')}</Text>
          <Toggle value={actif} onValueChange={setActif} />
        </View>

        {error ? <Text style={[styles.error, { color: colors.candy.red }]}>{error}</Text> : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  fab: { position: 'absolute', right: spacing.xl },
  soldeRow: { alignItems: 'flex-end', marginBottom: spacing.sm },
  sousOngletWrap: { marginBottom: spacing.lg },
  card: { marginBottom: spacing.sm },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  cardDesc: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: spacing.xs },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  editText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  sectionLabel: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold, marginBottom: spacing.sm },
  membreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gestionButtonsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  label: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  error: { fontWeight: typography.fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
});
