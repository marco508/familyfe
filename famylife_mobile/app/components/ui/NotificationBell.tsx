// components/ui/NotificationBell.tsx
// Icône cloche avec badge (nombre de notifications non-lues). Composant
// "pur" (comme Avatar/Badge) : le compteur et l'action lui sont passés en
// props par l'écran appelant (voir src/contexts/NotificationContext.tsx).
import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Bell } from 'lucide-react-native';
import { borderRadius, typography, shadows } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';

interface Props {
  count?: number;
  onPress?: () => void;
}

export default function NotificationBell({ count = 0, onPress }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  // Bouton icône-seule : on annonce « Notifications » + le nombre de non-lues.
  const a11yLabel =
    count > 0
      ? t('a11y.notificationsAvecCompte').replace('{count}', String(count > 99 ? 99 : count))
      : t('a11y.notifications');
  return (
    <Pressable
      onPress={onPress}
      style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.border }, shadows.soft]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      <Bell size={18} color={colors.text.dark} />
      {count > 0 ? (
        <View style={[styles.badge, { backgroundColor: colors.candy.red, borderColor: colors.candy.white }]}>
          <Text style={[styles.badgeText, { color: colors.candy.white }]} numberOfLines={1}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: typography.fontWeight.extrabold,
  },
});
