// app/(app)/inviter.tsx — ANNEXE V6 : écran d'invitation partageable (adoption).
// Point d'entrée principal pour faire rejoindre un proche : code d'invitation
// bien visible + partage natif (message chaleureux prérempli) + rappel des 3
// étapes pour le nouvel arrivant. Pas de QR (aucune dépendance native ajoutée).
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Share } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Share2, Smartphone, UserPlus, KeyRound } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { useMaison } from '../src/contexts/MaisonContext';
import { useT } from '../src/i18n';
import { useTheme } from '../src/contexts/ThemeContext';
import { logementIcon } from '../src/utils/logement';
import { CandyButton, CandyCard, EmptyState } from '../components/ui';
import { typography, spacing, borderRadius, shadows } from '../theme/designTokens';

export default function InviterScreen() {
  const { colors, gradients } = useTheme();
  const { t } = useT();
  const { maisonActive } = useMaison();

  const STEPS: { icon: any; label: string }[] = [
    { icon: Smartphone, label: t('inviter.etape1') },
    { icon: UserPlus, label: t('inviter.etape2') },
    { icon: KeyRound, label: t('inviter.etape3') },
  ];

  const handleShare = async () => {
    if (!maisonActive) return;
    try {
      await Share.share({
        message: `${t('inviter.messageIntro')} "${maisonActive.nom}" ${t('inviter.messageOn')} ${t('inviter.messageAction')} ${maisonActive.code_invitation}`,
      });
    } catch {
      // ignore
    }
  };

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>{t('inviter.titre')}</Text>
        <View style={{ width: 22 }} />
      </View>

      {!maisonActive ? (
        <EmptyState emoji="🏠" title={t('accueil.aucuneMaison')} />
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={[styles.intro, { color: colors.text.body }]}>{t('inviter.intro')}</Text>

          <LinearGradient colors={gradients.candyPurple} style={[styles.codeCard, shadows.candyPurple]}>
            <Text style={styles.codeCardEmoji}>{logementIcon(maisonActive.type_logement)}</Text>
            <Text style={styles.codeCardMaisonNom} numberOfLines={1}>{maisonActive.nom}</Text>
            <Text style={styles.codeCardLabel}>{t('inviter.codeLabel')}</Text>
            <View style={styles.codeCardBox}>
              <Text style={styles.codeCardValue}>{maisonActive.code_invitation.split('').join(' ')}</Text>
            </View>
          </LinearGradient>

          <CandyButton
            label={t('inviter.partager')}
            onPress={handleShare}
            variant="pink"
            icon={<Share2 size={18} color={colors.candy.white} />}
            style={{ marginTop: spacing.xl }}
          />

          <Text style={[styles.stepsTitle, { color: colors.text.dark }]}>{t('inviter.etapesTitre')}</Text>
          <CandyCard style={{ marginTop: spacing.sm }}>
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <View
                  key={i}
                  style={[
                    styles.stepRow,
                    i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                  ]}
                >
                  <View style={[styles.stepNumber, { backgroundColor: colors.primary.main }]}>
                    <Text style={[styles.stepNumberText, { color: colors.candy.white }]}>{i + 1}</Text>
                  </View>
                  <View style={[styles.stepIconWrap, { backgroundColor: colors.primary.subtle }]}>
                    <Icon size={18} color={colors.primary.main} />
                  </View>
                  <Text style={[styles.stepLabel, { color: colors.text.dark }]}>{s.label}</Text>
                </View>
              );
            })}
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
  intro: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, textAlign: 'center', marginBottom: spacing.lg },
  codeCard: { borderRadius: borderRadius.card, padding: spacing.xl, alignItems: 'center' },
  codeCardEmoji: { fontSize: 32, marginBottom: spacing.xs },
  codeCardMaisonNom: { color: '#FFFFFF', fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold, marginBottom: spacing.lg, opacity: 0.95 },
  codeCardLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  codeCardBox: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  codeCardValue: {
    color: '#FFFFFF',
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.black,
    letterSpacing: 4,
  },
  stepsTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.extrabold,
    marginTop: spacing['2xl'],
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  stepNumber: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.black },
  stepIconWrap: { width: 36, height: 36, borderRadius: borderRadius.pill, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { flex: 1, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold },
});
