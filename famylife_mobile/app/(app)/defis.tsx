// app/(app)/defis.tsx — Défis de maison (ANNEXE V3)
// Liste des défis (titre, points, échéance), rejoindre, marquer terminé
// (gagne les points), création + clôture pour la gestion (chef/co-chef).
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
import { ArrowLeft, Plus, X, Lock, Trash2, Check } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { useMaison } from '../src/contexts/MaisonContext';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';
import defisService, { Defi } from '../src/services/defisService';
import { Avatar, Badge, CandyButton, CandyCard, CandyInput, EmptyState, Stepper, VisitorBanner } from '../components/ui';
import { typography, spacing, borderRadius } from '../theme/designTokens';

export default function DefisScreen() {
  const { maisonActive, isGestion, isVisiteur } = useMaison();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t } = useT();

  const [defis, setDefis] = useState<Defi[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [points, setPoints] = useState(10);
  const [dateFin, setDateFin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!maisonActive) {
      setDefis([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await defisService.list(maisonActive.id);
      setDefis(res.data ?? []);
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
    setDescription('');
    setPoints(10);
    setDateFin('');
    setError('');
    setModalVisible(true);
  };

  const handleCreate = async () => {
    if (!maisonActive || !titre.trim()) {
      setError(t('courses.nom'));
      return;
    }
    setSaving(true);
    setError('');
    const res = await defisService.create(maisonActive.id, {
      titre: titre.trim(),
      description: description.trim() || undefined,
      points,
      date_fin: dateFin.trim() || undefined,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setModalVisible(false);
    load();
  };

  const handleRejoindre = async (d: Defi) => {
    setBusyId(d.id);
    const res = await defisService.rejoindre(d.id);
    setBusyId(null);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    load();
  };

  const handleTerminer = async (d: Defi) => {
    setBusyId(d.id);
    const res = await defisService.terminer(d.id);
    setBusyId(null);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    Alert.alert(t('defis.marquerTermine'), `+${d.points} pts 🎉`);
    load();
  };

  const handleCloturer = (d: Defi) => {
    Alert.alert(t('common.cloturer') + ' ?', d.titre, [
      { text: t('common.annuler'), style: 'cancel' },
      {
        text: t('common.cloturer'),
        style: 'destructive',
        onPress: async () => {
          await defisService.cloturer(d.id);
          load();
        },
      },
    ]);
  };

  const handleDelete = (d: Defi) => {
    Alert.alert(t('common.supprimer') + ' ?', d.titre, [
      { text: t('common.annuler'), style: 'cancel' },
      {
        text: t('common.supprimer'),
        style: 'destructive',
        onPress: async () => {
          setDefis((prev) => prev.filter((x) => x.id !== d.id));
          await defisService.remove(d.id);
        },
      },
    ]);
  };

  const peutGerer = (d: Defi) => isGestion || d.createur_id === user?.id;

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>🏆 {t('defis.titre')}</Text>
        {!isVisiteur ? (
          <Pressable onPress={openCreate} hitSlop={10}>
            <Plus size={22} color={colors.primary.main} />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
      >
        {isVisiteur ? <VisitorBanner /> : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
        ) : defis.length === 0 ? (
          <EmptyState emoji="🏆" title={t('common.aucunResultat')} />
        ) : (
          defis.map((d) => (
            <CandyCard key={d.id} style={styles.card}>
              <View style={styles.cardTopRow}>
                <Text style={[styles.cardTitle, { color: colors.text.dark }]} numberOfLines={2}>
                  {d.titre}
                </Text>
                <Badge label={`${d.points} pts`} variant="yellow" />
              </View>
              {d.description ? <Text style={[styles.cardDesc, { color: colors.text.body }]}>{d.description}</Text> : null}
              <View style={styles.metaRow}>
                <Badge label={d.statut === 'ouvert' ? '🟢 ' + t('defis.ouvert') : '🔒 ' + t('defis.ferme')} variant={d.statut === 'ouvert' ? 'green' : 'neutral'} />
                {d.date_fin ? (
                  <Text style={[styles.echeance, { color: colors.text.muted }]}>
                    {t('defis.echeance')} : {d.date_fin}
                  </Text>
                ) : null}
              </View>

              {d.participants.length > 0 ? (
                <View style={styles.participantsRow}>
                  {d.participants.map((p) => (
                    <View key={p.utilisateur_id} style={styles.participantChip}>
                      <Avatar name={p.nom} image={p.image} size={22} />
                      {p.termine ? <Check size={12} color={colors.candy.greenDark} style={{ marginLeft: -6, marginTop: -14 }} /> : null}
                    </View>
                  ))}
                </View>
              ) : null}

              {d.statut === 'ouvert' && !isVisiteur ? (
                <View style={styles.actionsRow}>
                  {!d.je_participe ? (
                    <CandyButton label={t('defis.rejoindre')} onPress={() => handleRejoindre(d)} loading={busyId === d.id} variant="blue" size="sm" style={{ flex: 1 }} />
                  ) : !d.mon_termine ? (
                    <CandyButton label={t('defis.marquerTermine')} onPress={() => handleTerminer(d)} loading={busyId === d.id} variant="green" size="sm" style={{ flex: 1 }} />
                  ) : (
                    <Badge label={t('defis.fait')} variant="green" />
                  )}
                </View>
              ) : d.statut === 'ouvert' && d.je_participe && d.mon_termine ? (
                <View style={styles.actionsRow}>
                  <Badge label={t('defis.fait')} variant="green" />
                </View>
              ) : null}

              {peutGerer(d) ? (
                <View style={styles.gestionRow}>
                  {d.statut === 'ouvert' ? (
                    <Pressable onPress={() => handleCloturer(d)} hitSlop={8} style={styles.gestionButton}>
                      <Lock size={14} color={colors.text.muted} />
                      <Text style={[styles.gestionButtonText, { color: colors.text.muted }]}>{t('common.cloturer')}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => handleDelete(d)} hitSlop={8} style={styles.gestionButton}>
                    <Trash2 size={14} color={colors.candy.red} />
                    <Text style={[styles.gestionButtonText, { color: colors.candy.red }]}>{t('common.supprimer')}</Text>
                  </Pressable>
                </View>
              ) : null}
            </CandyCard>
          ))
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text.dark }]}>{t('defis.nouveau')} 🏆</Text>
                <Pressable onPress={() => setModalVisible(false)} hitSlop={10}>
                  <X size={22} color={colors.text.dark} />
                </Pressable>
              </View>

              <CandyInput label={t('courses.nom')} value={titre} onChangeText={setTitre} />
              <CandyInput label={t('boutique.description')} value={description} onChangeText={setDescription} multiline />
              <Stepper label={t('defis.points')} value={points} onValueChange={setPoints} min={1} max={1000} suffix="pts" />
              <CandyInput label={`${t('defis.echeance')} (AAAA-MM-JJ)`} placeholder="2026-08-01" value={dateFin} onChangeText={setDateFin} />

              {error ? <Text style={[styles.error, { color: colors.candy.red }]}>{error}</Text> : null}

              <CandyButton label={t('common.creer')} onPress={handleCreate} loading={saving} variant="yellow" />
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
  container: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing['4xl'] },
  card: { marginBottom: spacing.sm },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  cardDesc: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  echeance: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium },
  participantsRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  participantChip: { flexDirection: 'row', alignItems: 'center' },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  gestionRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md },
  gestionButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gestionButtonText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  modalTitle: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.black },
  error: { fontWeight: typography.fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
});
