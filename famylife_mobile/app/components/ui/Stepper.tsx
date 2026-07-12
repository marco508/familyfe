// components/ui/Stepper.tsx
// Compteur numérique "bonbon" avec boutons +/- ronds (ex: points de gage).
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { borderRadius, spacing, typography } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Props {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  suffix?: string;
}

export default function Stepper({ value, onValueChange, min = 0, max = 999, step = 1, label, suffix }: Props) {
  const { colors } = useTheme();
  const dec = () => onValueChange(Math.max(min, value - step));
  const inc = () => onValueChange(Math.min(max, value + step));

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={[styles.label, { color: colors.text.dark }]}>{label}</Text> : null}
      <View style={styles.row}>
        <Pressable
          onPress={dec}
          style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.border }]}
          hitSlop={8}
        >
          <Minus size={16} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.value, { color: colors.text.dark }]}>
          {value}
          {suffix ? ` ${suffix}` : ''}
        </Text>
        <Pressable
          onPress={inc}
          style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.border }]}
          hitSlop={8}
        >
          <Plus size={16} color={colors.text.dark} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },
  label: {
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  button: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  value: {
    minWidth: 48,
    textAlign: 'center',
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.extrabold,
  },
});
