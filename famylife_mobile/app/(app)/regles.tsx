// app/(app)/regles.tsx — Règles de la maison, votées (ANNEXE V4)
// Liste des règles adoptées / en vote (avec résultats) ; la gestion peut
// proposer une règle (option "soumettre au vote"), adopter ou rejeter.
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
import { ArrowLeft, Plus, Check, XCircle, Trash2 } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { useMaison } from '../src/contexts/MaisonContext';
import { useT } from '../src/i18n';
import { useTheme } from '../src/contexts/ThemeContext';
import regleService, { Regle } from '../src/services/regleService';
import { Badge, BottomSheet, CandyButton, CandyCard, CandyInput, EmptyState, Toggle, VisitorBanner } from '../components/ui';
import { typography, spacing, borderRadius, shadows } from '../theme/designTokens';

export default function ReglesScreen() {
  const { colors } = useTheme();
  const { t } = useT();
  const { maisonActive, isGestion, isVisiteur } = useMaison();

  const [regles, setRegles] = useState<Regle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [titre, setTitre] = useState('');
  const [contenu, setContenu] = useState('');
  const [soumettreAuVote, setSoumettreAuVote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!maisonActive) {
      setRegles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await regleService.list(maisonActive.id);
      setRegles(res.data ?? []);
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

  const openCreate = () => {
    setTitre('');
    setContenu('');
    setSoumettreAuVote(false);
    setError('');
    setModalVisible(true);
  };

  const handleCreate = async () => {
    if (!maisonActive) return;
    if (!titre.trim() || !contenu.trim()) {
      setError(t('regles.titreContenuObligatoires'));
      return;
    }
    setSaving(true);
    setError('');
    const res = await regleService.create(maisonActive.id, {
      titre: titre.trim(),
      contenu: contenu.trim(),
      soumettre_au_vote: soumettreAuVote,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setModalVisible(false);
    load();
  };

  const handleAdopter = async (r: Regle) => {
    setBusyId(r.id);
    const res = await regleService.adopter(r.id);
    setBusyId(null);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    load();
  };

  const handleRejeter = async (r: Regle) => {
    setBusyId(r.id);
    const res = await regleService.rejeter(r.id);
    setBusyId(null);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    load();
  };

  const handleDelete = (r: Regle) => {
    Alert.alert(t('regles.supprimerConfirmTitre'), r.titre, [
      { text: t('common.annuler'), style: 'cancel' },
      {
        text: t('common.supprimer'),
        style: 'destructive',
        onPress: async () => {
          await regleService.remove(r.id);
          load();
        },
      },
    ]);
  };

  const adoptees = regles.filter((r) => r.statut === 'adoptee').sort((a, b) => a.ordre - b.ordre);
  const enVote = regles.filter((r) => r.statut === 'proposee');
  const rejetees = regles.filter((r) => r.statut === 'rejetee');

  const renderRegle = (r: Regle, showGestionActions: boolean) => (
    <CandyCard key={r.id} style={styles.card}>
      <View style={styles.cardTopRow}>
        <Text style={[styles.cardTitle, { color: colors.text.dark }]} numberOfLines={2}>
          {r.titre}
        </Text>
        <Badge
          label={
            r.statut === 'adoptee' ? t('regles.statutAdoptee') : r.statut === 'proposee' ? t('regles.statutProposee') : t('regles.statutRejetee')
          }
          variant={r.statut === 'adoptee' ? 'green' : r.statut === 'proposee' ? 'orange' : 'neutral'}
        />
      </View>
      <Text style={[styles.cardContenu, { color: colors.text.body }]}>{r.contenu}</Text>

      {r.vote_id && r.options && r.options.length > 0 ? (
        <View style={styles.voteResults}>
          {r.options.map((opt) => (
            <View key={opt.id} style={styles.voteRow}>
              <Text style={[styles.voteOptionText, { color: colors.text.body }]} numberOfLines={1}>
                {opt.texte}
              </Text>
              <Text style={[styles.voteCountText, { color: colors.text.dark }]}>
                {opt.nb_voix} {t('votes.voix')}
              </Text>
            </View>
          ))}
          {typeof r.total_voix === 'number' ? (
            <Text style={[styles.voteTotal, { color: colors.text.muted }]}>
              {r.total_voix} {t('votes.auTotal')}
            </Text>
          ) : null}
        </View>
      ) : null}

      {showGestionActions && r.statut === 'proposee' ? (
        <View style={styles.gestionButtonsRow}>
          <CandyButton
            label={t('regles.adopter')}
            onPress={() => handleAdopter(r)}
            variant="green"
            size="sm"
            loading={busyId === r.id}
            icon={<Check size={16} color={colors.candy.white} />}
            style={{ flex: 1 }}
          />
          <CandyButton
            label={t('regles.rejeter')}
            onPress={() => handleRejeter(r)}
            variant="danger"
            size="sm"
            loading={busyId === r.id}
            icon={<XCircle size={16} color={colors.candy.white} />}
            style={{ flex: 1 }}
          />
        </View>
      ) : null}

      {showGestionActions ? (
        <Pressable onPress={() => handleDelete(r)} hitSlop={8} style={styles.deleteRow}>
          <Trash2 size={14} color={colors.candy.red} />
          <Text style={[styles.deleteText, { color: colors.candy.red }]}>{t('common.supprimer')}</Text>
        </Pressable>
      ) : null}
    </CandyCard>
  );

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>{t('regles.titre')}</Text>
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
        ) : regles.length === 0 ? (
          <EmptyState emoji="📜" title={t('regles.aucuneRegle')} message={isGestion ? t('regles.proposerRegle') : undefined} />
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: colors.text.dark }]}>{t('regles.adoptees')}</Text>
            {adoptees.length === 0 ? (
              <CandyCard style={{ marginBottom: spacing.lg }}>
                <Text style={[styles.emptyInlineText, { color: colors.text.body }]}>{t('regles.aucuneRegle')}</Text>
              </CandyCard>
            ) : (
              adoptees.map((r) => renderRegle(r, isGestion))
            )}

            <Text style={[styles.sectionLabel, { color: colors.text.dark, marginTop: spacing.lg }]}>{t('regles.enVote')}</Text>
            {enVote.length === 0 ? (
              <CandyCard style={{ marginBottom: spacing.lg }}>
                <Text style={[styles.emptyInlineText, { color: colors.text.body }]}>{t('common.aucunResultat')}</Text>
              </CandyCard>
            ) : (
              enVote.map((r) => renderRegle(r, isGestion))
            )}

            {isGestion && rejetees.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.text.dark, marginTop: spacing.lg }]}>
                  {t('regles.statutRejetee')}
                </Text>
                {rejetees.map((r) => renderRegle(r, isGestion))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={t('regles.proposerRegle')}
        emoji="📜"
        footer={<CandyButton label={t('regles.proposer')} onPress={handleCreate} loading={saving} variant="purple" />}
      >
        <CandyInput label={t('regles.titreChamp')} placeholder={t('regles.titrePlaceholder')} value={titre} onChangeText={setTitre} />
        <CandyInput
          label={t('regles.contenu')}
          placeholder={t('regles.contenuPlaceholder')}
          value={contenu}
          onChangeText={setContenu}
          multiline
        />

        <View style={styles.toggleRow}>
          <Text style={[styles.label, { color: colors.text.dark }]}>{t('regles.soumettreAuVote')}</Text>
          <Toggle value={soumettreAuVote} onValueChange={setSoumettreAuVote} />
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
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.extrabold },
  addButton: { width: 40, height: 40, borderRadius: borderRadius.pill, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing['4xl'] },
  sectionLabel: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold, marginBottom: spacing.sm },
  emptyInlineText: { fontWeight: typography.fontWeight.medium, textAlign: 'center' },
  card: { marginBottom: spacing.sm },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  cardContenu: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, marginTop: spacing.xs },
  voteResults: { marginTop: spacing.sm, gap: 4 },
  voteRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  voteOptionText: { flex: 1, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  voteCountText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.extrabold },
  voteTotal: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: 2 },
  gestionButtonsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  deleteText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  label: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  error: { fontWeight: typography.fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
});
