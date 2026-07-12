// app/(app)/(tabs)/plus.tsx
// Onglet "Plus" : grille de gros boutons bonbon donnant accès aux fonctions
// secondaires (ANNEXE V3) pour ne pas surcharger la barre d'onglets.
import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ShoppingCart,
  Wallet,
  UtensilsCrossed,
  MessageCircle,
  Gift,
  Trophy,
  Medal,
  Home as HomeIcon,
  Settings,
  ClipboardCheck,
  ScrollText,
  Landmark,
} from 'lucide-react-native';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';
import { useNotifications } from '../../src/contexts/NotificationContext';
import { useMaison } from '../../src/contexts/MaisonContext';
import { NotificationBell, SectionTitle } from '../../components/ui';
import { typography, spacing, borderRadius, shadows } from '../../theme/designTokens';

export default function PlusScreen() {
  const { colors, gradients } = useTheme();
  const { t } = useT();
  const { unreadCount, refresh: refreshNotifCount } = useNotifications();
  const { isChef } = useMaison();

  const items: { key: string; label: string; emoji: string; icon: any; gradient: readonly [string, string, ...string[]]; href: string }[] = [
    { key: 'taches', label: t('plus.taches'), emoji: '🧹', icon: ClipboardCheck, gradient: gradients.candyGreen, href: '/(app)/taches' },
    { key: 'regles', label: t('plus.regles'), emoji: '📜', icon: ScrollText, gradient: gradients.candyPurple, href: '/(app)/regles' },
    { key: 'courses', label: t('plus.courses'), emoji: '🛒', icon: ShoppingCart, gradient: gradients.candyPink, href: '/(app)/courses' },
    { key: 'depenses', label: t('plus.depenses'), emoji: '💰', icon: Wallet, gradient: gradients.candyGreen, href: '/(app)/depenses' },
    { key: 'menu', label: t('plus.menu'), emoji: '🍽️', icon: UtensilsCrossed, gradient: gradients.candyOrange, href: '/(app)/menu' },
    { key: 'chat', label: t('plus.chat'), emoji: '💬', icon: MessageCircle, gradient: gradients.candyBlue, href: '/(app)/chat' },
    { key: 'boutique', label: t('plus.boutique'), emoji: '🎁', icon: Gift, gradient: gradients.candyPurple, href: '/(app)/boutique' },
    { key: 'defis', label: t('plus.defis'), emoji: '🏆', icon: Trophy, gradient: gradients.candyYellow, href: '/(app)/defis' },
    { key: 'classement', label: t('plus.classement'), emoji: '🥇', icon: Medal, gradient: gradients.candyPink, href: '/(app)/classement' },
    ...(isChef
      ? [{ key: 'portefeuille', label: t('plus.portefeuille'), emoji: '🏘️', icon: Landmark, gradient: gradients.candyOrange, href: '/(app)/portefeuille' }]
      : []),
    { key: 'maison', label: t('plus.maison'), emoji: '🏠', icon: HomeIcon, gradient: gradients.candyBlue, href: '/(app)/(tabs)/maison' },
    { key: 'reglages', label: t('plus.reglages'), emoji: '⚙️', icon: Settings, gradient: gradients.candyPurple, href: '/(app)/reglages' },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SectionTitle
        title={t('plus.titre')}
        emoji="🍭"
        subtitle={t('plus.sousTitre')}
        right={<NotificationBell count={unreadCount} onPress={() => { refreshNotifCount(); router.push('/(app)/notifications'); }} />}
      />

      <View style={styles.grid}>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Pressable key={item.key} onPress={() => router.push(item.href as any)} style={styles.cell}>
              <LinearGradient colors={item.gradient} style={[styles.tile, shadows.soft]}>
                <View style={styles.tileIconWrap}>
                  <Icon size={26} color={colors.candy.white} />
                </View>
                <Text style={styles.tileLabel} numberOfLines={2}>
                  {item.emoji} {item.label}
                </Text>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, paddingTop: spacing['2xl'], paddingBottom: 140 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  cell: { width: '47%' },
  tile: {
    borderRadius: borderRadius.card,
    padding: spacing.lg,
    minHeight: 110,
    justifyContent: 'space-between',
  },
  tileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.pill,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.extrabold,
    marginTop: spacing.md,
  },
});
