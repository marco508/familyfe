// components/ui/Segmented.tsx
// Sélecteur segmenté "bonbon" (pilule) — ex: période de classement, onglets
// Boutique/Mes échanges/Gestion.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { borderRadius, spacing, typography } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
}

interface Props<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export default function Segmented<T extends string = string>({ options, value, onChange }: Props<T>) {
  const { colors } = useTheme();

  const handlePress = (v: T) => {
    if (v === value) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onChange(v);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.candy.cream, borderColor: colors.border }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => handlePress(opt.value)}
            style={[styles.item, active && { backgroundColor: colors.primary.main }]}
          >
            <Text
              style={[styles.label, { color: active ? colors.candy.white : colors.text.body }]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderRadius: borderRadius.pill,
    padding: 4,
    borderWidth: 1.5,
  },
  item: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.extrabold,
  },
});
