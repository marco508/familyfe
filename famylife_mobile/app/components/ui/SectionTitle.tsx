// components/ui/SectionTitle.tsx
// Titre de section : gras 800/900, violet foncé, accent emoji optionnel.
import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { typography, spacing } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Props {
  title: string;
  emoji?: string;
  subtitle?: string;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg';
}

export default function SectionTitle({ title, emoji, subtitle, right, style, size = 'md' }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, style]}>
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: colors.text.dark }, size === 'lg' && styles.titleLg]}>
          {emoji ? `${emoji} ` : ''}
          {title}
        </Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.text.body }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  textCol: { flex: 1 },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.extrabold,
    letterSpacing: typography.letterSpacing.tight,
  },
  titleLg: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.black,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginTop: 2,
  },
});
