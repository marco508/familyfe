// app/(app)/votes/[id].tsx
// Détail d'un vote : question, description, résultats détaillés par option,
// vote, clôture et suppression (chef ou créateur).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Lock, Trash2 } from 'lucide-react-native';
import ScreenBackground from '../../components/ScreenBackground';
import { useMaison } from '../../src/contexts/MaisonContext';
import { useAuth } from '../../src/contexts/AuthContext';
import voteService, { Vote } from '../../src/services/voteService';
import { Avatar, Badge, CandyButton, CandyCard } from '../../components/ui';
import { typography, spacing, borderRadius } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';

export default function VoteDetailScreen() {
  const { colors, gradients } = useTheme();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const voteId = Number(id);
  const { isChef } = useMaison();
  const { user } = useAuth();

  const [vote, setVote] = useState<Vote | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);

  const load = useCallback(async () => {
    if (!voteId) return;
    setLoading(true);
    const res = await voteService.get(voteId);
    setVote(res.data ?? null);
    setLoading(false);
  }, [voteId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleVoter = async (optionId: number) => {
    if (!vote || vote.statut === 'clos') return;
    setVoting(true);
    const res = await voteService.voter(vote.id, optionId);
    setVoting(false);
    if (res.data) setVote(res.data);
    else if (res.error) Alert.alert(t('common.erreur'), res.error);
  };

  const handleCloturer = async () => {
    if (!vote) return;
    const res = await voteService.cloturer(vote.id);
    if (res.data) setVote(res.data);
    else if (res.error) Alert.alert(t('common.erreur'), res.error);
  };

  const handleDelete = () => {
    if (!vote) return;
    Alert.alert(t('votes.supprimerConfirmTitre'), t('common.actionIrreversible'), [
      { text: t('common.annuler'), style: 'cancel' },
      {
        text: t('common.supprimer'),
        style: 'destructive',
        onPress: async () => {
          const res = await voteService.remove(vote.id);
          if (res.error) {
            Alert.alert(t('common.erreur'), res.error);
            return;
          }
          router.back();
        },
      },
    ]);
  };

  const peutGerer = vote ? isChef || vote.createur_id === user?.id : false;

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>{t('votes.detailTitre')}</Text>
        {peutGerer ? (
          <Pressable onPress={handleDelete} hitSlop={10}>
            <Trash2 size={20} color={colors.candy.red} />
          </Pressable>
        ) : (
          <View style={{ width: 20 }} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing['2xl'] }} color={colors.primary.main} />
      ) : !vote ? (
        <Text style={[styles.notFound, { color: colors.text.body }]}>{t('votes.introuvable')}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <CandyCard style={{ marginBottom: spacing.lg }}>
            <View style={styles.questionRow}>
              <Text style={[styles.question, { color: colors.text.dark }]}>{vote.question}</Text>
              <Badge label={vote.statut === 'ouvert' ? t('votes.ouvert') : t('votes.clos')} variant={vote.statut === 'ouvert' ? 'green' : 'neutral'} />
            </View>
            {vote.description ? <Text style={[styles.description, { color: colors.text.body }]}>{vote.description}</Text> : null}
            {vote.createur ? (
              <View style={styles.createurRow}>
                <Avatar name={vote.createur.nom} image={vote.createur.image} size={22} />
                <Text style={[styles.createurText, { color: colors.text.muted }]}>
                  {t('votes.creePar')} {vote.createur.nom}
                </Text>
              </View>
            ) : null}
          </CandyCard>

          <CandyCard>
            {vote.options.map((opt) => {
              const pct = vote.total_voix > 0 ? Math.round((opt.nb_voix / vote.total_voix) * 100) : 0;
              const isMine = vote.mon_vote_option_id === opt.id;
              return (
                <Pressable key={opt.id} onPress={() => handleVoter(opt.id)} disabled={vote.statut === 'clos' || voting} style={styles.optionWrap}>
                  <View style={styles.optionHeader}>
                    <Text
                      style={[styles.optionLabel, { color: isMine ? colors.candy.greenDark : colors.text.dark }]}
                      numberOfLines={2}
                    >
                      {isMine ? '✓ ' : ''}{opt.texte}
                    </Text>
                    <Text style={[styles.optionPct, { color: colors.text.muted }]}>{pct}% · {opt.nb_voix} {t('votes.voix')}</Text>
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
            <Text style={[styles.totalVoix, { color: colors.text.muted }]}>
              {vote.total_voix} {vote.total_voix > 1 ? t('accueil.votes') : t('accueil.vote')} {t('votes.auTotal')}
            </Text>
          </CandyCard>

          {peutGerer && vote.statut === 'ouvert' ? (
            <CandyButton
              label={t('votes.cloturerVote')}
              onPress={handleCloturer}
              variant="orange"
              icon={<Lock size={18} color={colors.candy.white} />}
              style={{ marginTop: spacing.lg }}
            />
          ) : null}
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
  questionRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  question: { flex: 1, fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.black },
  description: { fontWeight: typography.fontWeight.medium, marginTop: spacing.sm },
  createurRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  createurText: { fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.xs },
  optionWrap: { marginBottom: spacing.md },
  optionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  optionLabel: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.md, flex: 1 },
  optionPct: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.xs },
  barTrack: { height: 12, borderRadius: borderRadius.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: borderRadius.pill },
  totalVoix: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: spacing.xs, textAlign: 'right' },
});
