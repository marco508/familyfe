// components/ui/CandyButton.tsx
// Bouton "bonbon" : dégradé + ombre colorée (glow) + bord blanc translucide +
// effet pressé (scale) + haptics.
import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  Text,
  StyleSheet,
  ViewStyle,
  StyleProp,
  ActivityIndicator,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { gradients, borderRadius, typography, spacing, shadows, motion } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';

export type CandyButtonVariant = 'pink' | 'purple' | 'blue' | 'green' | 'orange' | 'yellow' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress?: () => void;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  variant?: CandyButtonVariant;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}

const GRADIENTS: Record<string, readonly [string, string, ...string[]]> = {
  pink: gradients.candyPink,
  purple: gradients.candyPurple,
  blue: gradients.candyBlue,
  green: gradients.candyGreen,
  orange: gradients.candyOrange,
  yellow: gradients.candyYellow,
  danger: ['#FF8A9B', '#FF5B6E'],
};

const SHADOWS: Record<string, any> = {
  pink: shadows.candyPink,
  purple: shadows.candyPurple,
  blue: shadows.candyBlue,
  green: shadows.candyGreen,
  orange: shadows.candyOrange,
  yellow: shadows.candyYellow,
  danger: shadows.candyPink,
};

export default function CandyButton({
  label,
  onPress,
  icon,
  loading = false,
  disabled = false,
  variant = 'pink',
  size = 'md',
  style,
  full = true,
}: Props) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, ...motion.spring }).start();

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress?.();
  };

  const isGhost = variant === 'ghost';
  const grad = GRADIENTS[variant] ?? gradients.candyPink;
  const glow = SHADOWS[variant] ?? shadows.candyPink;
  const minHeight = size === 'sm' ? 42 : 54;

  const content = loading ? (
    <ActivityIndicator color={isGhost ? colors.primary.main : colors.candy.white} />
  ) : (
    <View style={styles.row}>
      {icon}
      <Text
        style={[
          styles.label,
          { color: isGhost ? colors.primary.main : colors.candy.white },
          size === 'sm' && styles.labelSm,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );

  return (
    <Animated.View style={[{ transform: [{ scale }] }, full && { alignSelf: 'stretch' }, style]}>
      <Pressable
        onPressIn={() => animate(motion.pressScale)}
        onPressOut={() => animate(1)}
        onPress={handlePress}
        disabled={disabled || loading}
      >
        {isGhost ? (
          <View
            style={[
              styles.base,
              { minHeight, backgroundColor: colors.primary.subtle, borderColor: colors.primary.border },
              styles.ghostBorder,
              disabled && styles.disabled,
            ]}
          >
            {content}
          </View>
        ) : (
          <LinearGradient
            colors={grad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.base, { minHeight }, styles.border, glow, disabled && styles.disabled]}
          >
            {content}
          </LinearGradient>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  border: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  ghostBorder: {
    borderWidth: 1.5,
  },
  disabled: { opacity: 0.5 },
  label: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.extrabold,
    letterSpacing: typography.letterSpacing.wide,
  },
  labelSm: {
    fontSize: typography.fontSize.md,
  },
});
