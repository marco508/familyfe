// app/(app)/depenses.tsx — Dépenses partagées + bilan (ANNEXE V3)
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
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Plus, Trash2, ArrowRight } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import ModuleInactif from '../components/ModuleInactif';
import { useMaison } from '../src/contexts/MaisonContext';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';
import depensesService, { BilanDepenses, Depense } from '../src/services/depensesService';
import { Avatar, BottomSheet, CandyButton, CandyCard, CandyInput, EmptyState, Fab, Repliable, Segmented, VisitorBanner } from '../components/ui';
import { typography, spacing, borderRadius } from '../theme/designTokens';

export default function DepensesScreen() {
  const { maisonActive, membres, isVisiteur, isModuleActif } = useMaison();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t, lang } = useT();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<'depenses' | 'bilan'>('depenses');
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [bilan, setBilan] = useState<BilanDepenses | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const [titre, setTitre] = useState('');
  const [montant, setMontant] = useState('');
  const [payePar, setPayePar] = useState<number | null>(null);
  const [participants, setParticipants] = useState<number[]>([]);
  const [categorie, setCategorie] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const nomFor = (uid: number) => membres.find((m) => m.id === uid)?.nom ?? `#${uid}`;
  const imageFor = (uid: number) => membres.find((m) => m.id === uid)?.image ?? null;

  const load = useCallback(async () => {
    if (!maisonActive) {
      setDepenses([]);
      setBilan(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [depRes, bilanRes] = await Promise.all([
        depensesService.list(maisonActive.id),
        depensesService.bilan(maisonActive.id),
      ]);
      setDepenses(depRes.data ?? []);
      setBilan(bilanRes.data ?? null);
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

  const openModal = () => {
    setTitre('');
    setMontant('');
    setPayePar(user?.id ?? null);
    setParticipants(membres.map((m) => m.id));
    setCategorie('');
    setError('');
    setModalVisible(true);
  };

  const toggleParticipant = (id: number) => {
    setParticipants((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreate = async () => {
    if (!maisonActive) return;
    const montantNum = parseFloat(montant.replace(',', '.'));
    if (!titre.trim() || isNaN(montantNum) || montantNum <= 0) {
      setError(t('depenses.titreMontantRequis'));
      return;
    }
    setSaving(true);
    setError('');
    const res = await depensesService.create(maisonActive.id, {
      titre: titre.trim(),
      montant: montantNum,
      paye_par: payePar ?? undefined,
      categorie: categorie.trim() || undefined,
      participants: participants.length ? participants : undefined,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setModalVisible(false);
    load();
  };

  const handleDelete = (d: Depense) => {
    Alert.alert(t('common.supprimer') + ' ?', d.titre, [
      { text: t('common.annuler'), style: 'cancel' },
      {
        text: t('common.supprimer'),
        style: 'destructive',
        onPress: async () => {
          await depensesService.remove(d.id);
          load();
        },
      },
    ]);
  };

  const totalDepenses = depenses.reduce((sum, d) => sum + d.montant, 0);
  const monSolde = bilan?.soldes.find((s) => s.utilisateur_id === user?.id)?.solde ?? 0;
  // Base des barres « qui a payé » : le plus gros payeur = barre pleine.
  const maxPaye = Math.max(1, ...(bilan?.soldes ?? []).map((s) => s.paye));

  // Divulgation progressive : catégorie + participants sont repliés. Le partage
  // décide QUI DOIT COMBIEN : on le résume donc dans l'en-tête du dépliant, et
  // on ouvre d'office dès que la sélection s'écarte du défaut (« tout le
  // monde ») ou qu'une catégorie est déjà saisie.
  const partageParDefaut =
    membres.length === 0 ||
    (participants.length === membres.length && membres.every((m) => participants.includes(m.id)));
  const resumeParticipants = partageParDefaut
    ? t('depenses.partageEntreTous')
    : `${t('depenses.partageEntre')} ${participants.length} ${
        participants.length > 1 ? t('depenses.participants2') : t('depenses.participant')
      }`;
  const optionsAvancees = categorie.trim() !== '' || !partageParDefaut;

  // ANNEXE V8 — la route reste vivante ; on explique au lieu de rediriger. Le
  // test est placé APRÈS tous les hooks (règle des hooks : un retour anticipé
  // au-dessus d'un `useState`/`useFocusEffect` changerait leur nombre entre
  // deux rendus quand le chef active le module).
  if (!isModuleActif('depenses')) return <ModuleInactif cle="depenses" />;

  return (
    <View style={styles.flex}>
      <ScreenBackground>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <ArrowLeft size={22} color={colors.text.dark} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text.dark }]}>{t('depenses.titre')}</Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={styles.segmentedWrap}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'depenses', label: t('depenses.titre') },
              { value: 'bilan', label: t('depenses.bilan') },
            ]}
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
        >
          {isVisiteur ? <VisitorBanner /> : null}

          {!loading && maisonActive ? (
            <CandyCard style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: colors.text.dark }]}>{totalDepenses.toFixed(2)} €</Text>
                  <Text style={[styles.summaryLabel, { color: colors.text.body }]}>Total</Text>
                </View>
                <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: monSolde >= 0 ? colors.candy.greenDark : colors.candy.red }]}>
                    {monSolde >= 0 ? '+' : ''}{monSolde.toFixed(2)} €
                  </Text>
                  <Text style={[styles.summaryLabel, { color: colors.text.body }]}>{t('depenses.monSolde')}</Text>
                </View>
                <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: colors.text.dark }]}>{depenses.length}</Text>
                  <Text style={[styles.summaryLabel, { color: colors.text.body }]}>{t('depenses.titre')}</Text>
                </View>
              </View>
            </CandyCard>
          ) : null}

          {loading ? (
            <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
          ) : tab === 'depenses' ? (
            depenses.length === 0 ? (
              <EmptyState
                emoji="💸"
                title={t('depenses.vide')}
                message={!isVisiteur ? t('depenses.videMessage') : undefined}
                action={
                  !isVisiteur ? (
                    <CandyButton label={t('depenses.ajouter')} onPress={openModal} variant="green" />
                  ) : undefined
                }
              />
            ) : (
              depenses.map((d) => (
                <CandyCard key={d.id} style={styles.card}>
                  <View style={styles.cardTopRow}>
                    <Text style={[styles.cardTitle, { color: colors.text.dark }]} numberOfLines={1}>
                      {d.titre}
                    </Text>
                    <Text style={[styles.cardMontant, { color: colors.candy.greenDark }]}>{d.montant.toFixed(2)} €</Text>
                  </View>
                  <View style={styles.cardMetaRow}>
                    <Avatar name={nomFor(d.paye_par)} image={imageFor(d.paye_par)} size={22} />
                    <Text style={[styles.cardMeta, { color: colors.text.body }]}>
                      {t('depenses.payePar')} {nomFor(d.paye_par)} · {new Date(d.date).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR')}
                    </Text>
                  </View>
                  <View style={styles.cardFooterRow}>
                    <Text style={[styles.cardMeta, { color: colors.text.muted }]} numberOfLines={1}>
                      {d.parts.length} {d.parts.length > 1 ? t('depenses.participants2') : t('depenses.participant')}
                      {d.categorie ? ` · ${d.categorie}` : ''}
                    </Text>
                    {d.paye_par === user?.id ? (
                      <Pressable onPress={() => handleDelete(d)} hitSlop={8}>
                        <Trash2 size={16} color={colors.candy.red} />
                      </Pressable>
                    ) : null}
                  </View>
                </CandyCard>
              ))
            )
          ) : bilan && bilan.reglements.length === 0 ? (
            <EmptyState emoji="🎉" title={t('depenses.aucuneDette')} />
          ) : (
            <>
              <Text style={[styles.sectionLabel, { color: colors.text.dark }]}>{t('depenses.quiDoitQui')}</Text>
              {(bilan?.reglements ?? []).map((r, idx) => (
                <CandyCard key={idx} style={styles.reglementCard}>
                  <View style={styles.debtRow}>
                    <View style={styles.debtParty}>
                      <Avatar name={r.de_nom} image={imageFor(r.de)} size={40} />
                      <Text style={[styles.debtNom, { color: colors.text.body }]} numberOfLines={1}>{r.de_nom}</Text>
                    </View>
                    <View style={styles.debtMid}>
                      <Text style={[styles.debtAmount, { color: colors.primary.dark }]}>{r.montant.toFixed(2)} €</Text>
                      <View style={styles.debtLine}>
                        <View style={[styles.debtLineFill, { backgroundColor: colors.primary.main }]} />
                        <ArrowRight size={16} color={colors.primary.main} />
                      </View>
                    </View>
                    <View style={styles.debtParty}>
                      <Avatar name={r.vers_nom} image={imageFor(r.vers)} size={40} />
                      <Text style={[styles.debtNom, { color: colors.text.body }]} numberOfLines={1}>{r.vers_nom}</Text>
                    </View>
                  </View>
                </CandyCard>
              ))}

              <Text style={[styles.sectionLabel, { color: colors.text.dark, marginTop: spacing.lg }]}>{t('depenses.soldes')}</Text>
              {(bilan?.soldes ?? []).map((s) => (
                <CandyCard key={s.utilisateur_id} style={styles.reglementCard}>
                  <View style={styles.soldeRow}>
                    <Avatar name={s.nom} image={imageFor(s.utilisateur_id)} size={30} />
                    <View style={styles.soldeMid}>
                      <View style={styles.soldeTopRow}>
                        <Text style={[styles.reglementNom, { color: colors.text.dark, flex: 1 }]} numberOfLines={1}>{s.nom}</Text>
                        <Text style={[styles.soldePaye, { color: colors.text.muted }]}>{s.paye.toFixed(2)} €</Text>
                      </View>
                      <View style={[styles.bar, { backgroundColor: colors.surface }]}>
                        <View style={[styles.barFill, { width: `${Math.round((s.paye / maxPaye) * 100)}%`, backgroundColor: colors.secondary.main }]} />
                      </View>
                    </View>
                    <Text style={[styles.reglementMontant, { color: s.solde >= 0 ? colors.candy.greenDark : colors.candy.red }]}>
                      {s.solde >= 0 ? '+' : ''}
                      {s.solde.toFixed(2)} €
                    </Text>
                  </View>
                </CandyCard>
              ))}
            </>
          )}
        </ScrollView>
      </ScreenBackground>

      {!isVisiteur ? (
        <Fab
          icon={<Plus size={24} color={colors.candy.white} />}
          onPress={openModal}
          style={[styles.fab, { bottom: insets.bottom + spacing.xl }]}
        />
      ) : null}

      <BottomSheet
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={t('depenses.nouvelle')}
        emoji="💸"
        footer={<CandyButton label={t('common.creer')} onPress={handleCreate} loading={saving} variant="green" />}
      >
        <CandyInput label={t('common.titre')} placeholder={t('depenses.titrePlaceholder')} value={titre} onChangeText={setTitre} />
        <CandyInput
          label={t('depenses.montant')}
          placeholder="45.90"
          value={montant}
          onChangeText={setMontant}
          keyboardType="decimal-pad"
        />
        <Text style={[styles.label, { color: colors.text.dark }]}>{t('depenses.payePar')}</Text>
        <View style={styles.chipsRow}>
          {membres.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => setPayePar(m.id)}
              style={[styles.membreChip, { borderColor: colors.border }, payePar === m.id && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle }]}
            >
              <Avatar name={m.nom} image={m.image} size={22} />
              <Text style={[styles.membreChipText, { color: payePar === m.id ? colors.primary.main : colors.text.body }]} numberOfLines={1}>
                {m.nom}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Le résumé du partage reste lisible même replié : sinon on pourrait
            valider un partage inattendu sans le savoir. */}
        <Repliable titre={t('common.plusOptions')} sousTitre={resumeParticipants} ouvertParDefaut={optionsAvancees}>
          <CandyInput label={t('courses.categorie')} placeholder={t('depenses.categoriePlaceholder')} value={categorie} onChangeText={setCategorie} />

          <Text style={[styles.label, { color: colors.text.dark }]}>{t('depenses.participants')}</Text>
          <View style={styles.chipsRow}>
            {membres.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => toggleParticipant(m.id)}
                style={[styles.membreChip, { borderColor: colors.border }, participants.includes(m.id) && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle }]}
              >
                <Avatar name={m.nom} image={m.image} size={22} />
                <Text style={[styles.membreChipText, { color: participants.includes(m.id) ? colors.primary.main : colors.text.body }]} numberOfLines={1}>
                  {m.nom}
                </Text>
              </Pressable>
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
  fab: { position: 'absolute', right: spacing.xl },
  summaryCard: { marginBottom: spacing.lg },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, height: 32 },
  summaryValue: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.black },
  summaryLabel: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: 2 },
  card: { marginBottom: spacing.sm },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { flex: 1, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  cardMontant: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.black },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  cardMeta: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium },
  cardFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  sectionLabel: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold, marginBottom: spacing.sm },
  reglementCard: { marginBottom: spacing.sm },
  reglementRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  soldeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  // Flux de dette : avatar → montant + flèche → avatar.
  debtRow: { flexDirection: 'row', alignItems: 'center' },
  debtParty: { width: 64, alignItems: 'center' },
  debtNom: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold, marginTop: 4 },
  debtMid: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.sm },
  debtAmount: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.black, marginBottom: 4 },
  debtLine: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center', gap: 2 },
  debtLineFill: { height: 2, flex: 1, maxWidth: 56, borderRadius: 2 },
  // Barre « qui a payé ».
  soldeMid: { flex: 1 },
  soldeTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 5 },
  soldePaye: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  bar: { height: 9, borderRadius: borderRadius.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: borderRadius.pill },
  reglementNom: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold },
  reglementMontant: { marginLeft: 'auto', fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.black },
  label: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
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
  error: { fontWeight: typography.fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
});
