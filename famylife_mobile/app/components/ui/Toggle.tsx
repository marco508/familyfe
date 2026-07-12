// components/ui/Toggle.tsx
// Interrupteur "bonbon" : piste pastel, pouce blanc, dégradé quand actif.
import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { borderRadius, motion } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Props {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export default function Toggle({ value, onValueChange, disabled }: Props) {
  const { colors } = useTheme();
  const translate = useRef(new Animated.Value(value ? 1 : 0)).current;

  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = !value;
    Animated.spring(translate, { toValue: next ? 1 : 0, useNativeDriver: true, ...motion.spring }).start();
    onValueChange(next);
  };

  const translateX = translate.interpolate({ inputRange: [0, 1], outputRange: [2, 22] });

  return (
    <Pressable onPress={handlePress} disabled={disabled} hitSlop={8}>
      <Animated.View
        style={[
          styles.track,
          { backgroundColor: value ? colors.primary.main : colors.candy.cream },
          !value && [styles.trackBorder, { borderColor: colors.border }],
          disabled && styles.disabled,
        ]}
      >
        <Animated.View style={[styles.thumb, { backgroundColor: colors.candy.white, transform: [{ translateX }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 48,
    height: 28,
    borderRadius: borderRadius.pill,
    justifyContent: 'center',
  },
  trackBorder: { borderWidth: 1.5 },
  thumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  disabled: { opacity: 0.5 },
});
