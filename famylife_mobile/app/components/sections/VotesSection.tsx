// components/sections/VotesSection.tsx
// ANNEXE V7 — Corps de l'ancien onglet `(tabs)/votes.tsx`, extrait pour être
// rendu comme segment de l'écran "Décisions". Ne rend ni fond ni en-tête :
// l'action "lancer un vote" passe du bouton + de l'en-tête à un FAB.
// Liste des votes : barres de progression par option, tap pour voter, création
// (question + options dynamiques), clôture par le chef/créateur.
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Plus, Lock, Trash2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useMaison } from '../../src/contexts/MaisonContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { useNotifications } from '../../src/contexts/NotificationContext';
import voteService, { Vote } from '../../src/services/voteService';
import { BottomSheet, CandyButton, CandyCard, CandyInput, Badge, EmptyState, Fab, VisitorBanner } from '../ui';
import { typography, spacing, borderRadius } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';

interface Props {
  bottomInset?: number;
}

export default function VotesSection({ bottomInset = spacing['4xl'] }: Props) {
  const { colors, gradients } = useTheme();
  const { t } = useT();
  const { maisonActive, isChef, isVisiteur } = useMaison();
  const { user } = useAuth();
  const { refresh: refreshNotifCount } = useNotifications();
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!maisonActive) {
      setVotes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await voteService.list(maisonActive.id);
      setVotes(res.data ?? []);
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
    setQuestion('');
    setDescription('');
    setOptions(['', '']);
    setError('');
    setModalVisible(true);
  };

  const updateOption = (idx: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  };
  const addOption = () => setOptions((prev) => [...prev, '']);
  const removeOption = (idx: number) => setOptions((prev) => prev.filter((_, i) => i !== idx));

  const handleCreate = async () => {
    if (!maisonActive) return;
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) {
      setError(t('votes.questionObligatoire'));
      return;
    }
    if (cleanOptions.length < 2) {
      setError(t('votes.minOptions'));
      return;
    }
    setSaving(true);
    setError('');
    const res = await voteService.create(maisonActive.id, {
      question: question.trim(),
      description: description.trim() || undefined,
      options: cleanOptions,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setModalVisible(false);
    load();
    refreshNotifCount();
  };

  const handleVoter = async (vote: Vote, optionId: number) => {
    if (vote.statut === 'clos') return;
    const res = await voteService.voter(vote.id, optionId);
    if (res.data) {
      setVotes((prev) => prev.map((v) => (v.id === vote.id ? res.data! : v)));
    }
  };

  const handleCloturer = async (vote: Vote) => {
    const res = await voteService.cloturer(vote.id);
    if (res.data) {
      setVotes((prev) => prev.map((v) => (v.id === vote.id ? res.data! : v)));
    }
  };

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
      >
        {isVisiteur ? <VisitorBanner /> : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
        ) : votes.length === 0 ? (
          <EmptyState emoji="🤔" title={t('votes.aucunVote')} message={t('votes.lancerBouton')} />
        ) : (
          votes.map((v) => {
            const peutCloturer = v.statut === 'ouvert' && (isChef || v.createur_id === user?.id);
            return (
              <Pressable key={v.id} onPress={() => router.push(`/(app)/votes/${v.id}`)}>
                <CandyCard style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: colors.text.dark }]} numberOfLines={2}>{v.question}</Text>
                    <Badge label={v.statut === 'ouvert' ? t('votes.ouvert') : t('votes.clos')} variant={v.statut === 'ouvert' ? 'green' : 'neutral'} />
                  </View>

                  {v.options.map((opt) => {
                    const pct = v.total_voix > 0 ? Math.round((opt.nb_voix / v.total_voix) * 100) : 0;
                    const isMine = v.mon_vote_option_id === opt.id;
                    return (
                      <Pressable key={opt.id} onPress={() => handleVoter(v, opt.id)} disabled={v.statut === 'clos'} style={styles.optionWrap}>
                        <View style={styles.optionHeader}>
                          <Text
                            style={[styles.optionLabel, { color: isMine ? colors.candy.greenDark : colors.text.dark }]}
                            numberOfLines={1}
                          >
                            {isMine ? '✓ ' : ''}{opt.texte}
                          </Text>
                          <Text style={[styles.optionPct, { color: colors.text.muted }]}>{pct}% ({opt.nb_voix})</Text>
                        </View>
                        <View style={[styles.barTrack, { backgroundColor: colors.surface }]}>
                          <LinearGradient
                            colors={isMine ? gradients.candyGreen : gradients.candyPurple}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.barFill, { width: `${Math.max(pct, opt.nb_voix > 0 ? 6 : 0)}%` }]}
                          />
                        </View>
                      </Pressable>
                    );
                  })}

                  <View style={styles.cardFooter}>
                    <Text style={[styles.totalVoix, { color: colors.text.muted }]}>
                      {v.total_voix} {v.total_voix > 1 ? t('accueil.votes') : t('accueil.vote')}
                    </Text>
                    {peutCloturer ? (
                      <Pressable onPress={() => handleCloturer(v)} style={styles.closeButton}>
                        <Lock size={14} color={colors.candy.orangeDark} />
                        <Text style={[styles.closeButtonText, { color: colors.candy.orangeDark }]}>{t('common.cloturer')}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </CandyCard>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {!isVisiteur ? (
        <Fab
          icon={<Plus size={24} color={colors.candy.white} />}
          onPress={openModal}
          style={[styles.fab, { bottom: bottomInset - spacing.xl }]}
        />
      ) : null}

      <BottomSheet
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={t('votes.nouveauVote')}
        emoji="🤔"
        footer={<CandyButton label={t('votes.lancerLeVote')} onPress={handleCreate} loading={saving} variant="blue" />}
      >
        <CandyInput label={t('votes.question')} placeholder={t('votes.questionPlaceholder')} value={question} onChangeText={setQuestion} />
        <CandyInput
          label={t('activite.descriptionOptionnelle')}
          placeholder={t('activite.descriptionPlaceholder')}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={[styles.label, { color: colors.text.dark }]}>{t('votes.options')}</Text>
        {options.map((opt, idx) => (
          <View key={idx} style={styles.optionRow}>
            <View style={{ flex: 1 }}>
              <CandyInput
                placeholder={`${t('votes.option')} ${idx + 1}`}
                value={opt}
                onChangeText={(v) => updateOption(idx, v)}
                style={{ marginBottom: 0 }}
              />
            </View>
            {options.length > 2 ? (
              <Pressable onPress={() => removeOption(idx)} style={styles.removeOptionButton} hitSlop={8}>
                <Trash2 size={18} color={colors.candy.red} />
              </Pressable>
            ) : null}
          </View>
        ))}

        <Pressable onPress={addOption} style={styles.addOptionButton}>
          <Plus size={16} color={colors.secondary.main} />
          <Text style={[styles.addOptionText, { color: colors.secondary.main }]}>{t('votes.ajouterOption')}</Text>
        </Pressable>

        {error ? <Text style={[styles.error, { color: colors.candy.red }]}>{error}</Text> : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  fab: { position: 'absolute', right: spacing.xl },
  card: { marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.md },
  cardTitle: { flex: 1, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.extrabold },
  optionWrap: { marginBottom: spacing.sm },
  optionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  optionLabel: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm, flex: 1 },
  optionPct: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.xs },
  barTrack: { height: 10, borderRadius: borderRadius.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: borderRadius.pill },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  totalVoix: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium },
  closeButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,138,61,0.16)', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: borderRadius.pill },
  closeButtonText: { fontWeight: typography.fontWeight.extrabold, fontSize: typography.fontSize.xs },
  label: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  removeOptionButton: { marginBottom: spacing.lg, padding: spacing.xs },
  addOptionButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.lg },
  addOptionText: { fontWeight: typography.fontWeight.extrabold, fontSize: typography.fontSize.sm },
  error: { fontWeight: typography.fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
});
