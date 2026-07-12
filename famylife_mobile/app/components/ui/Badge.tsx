// components/ui/Badge.tsx
// Petit badge pilule coloré (ex: rôle "Chef", statut d'activité/vote).
import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { borderRadius, spacing, typography } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';

export type BadgeVariant = 'pink' | 'purple' | 'blue' | 'green' | 'orange' | 'yellow' | 'neutral';

interface Props {
  label: string;
  variant?: BadgeVariant;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const BG: Record<BadgeVariant, string> = {
  pink: 'rgba(255,78,155,0.14)',
  purple: 'rgba(123,92,255,0.14)',
  blue: 'rgba(58,200,255,0.16)',
  green: 'rgba(63,217,139,0.16)',
  orange: 'rgba(255,138,61,0.16)',
  yellow: 'rgba(255,210,63,0.22)',
  neutral: 'rgba(58,42,91,0.08)',
};

export default function Badge({ label, variant = 'pink', icon, style }: Props) {
  const { colors } = useTheme();
  const FG: Record<BadgeVariant, string> = {
    pink: colors.candy.pinkDark,
    purple: colors.candy.purpleDark,
    blue: colors.candy.blueDark,
    green: colors.candy.greenDark,
    orange: colors.candy.orangeDark,
    yellow: colors.candy.yellowDark,
    neutral: colors.text.body,
  };
  return (
    <View style={[styles.badge, { backgroundColor: BG[variant] }, style]}>
      {icon}
      <Text style={[styles.label, { color: FG[variant] }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.pill,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.extrabold,
    letterSpacing: typography.letterSpacing.wide,
  },
});
