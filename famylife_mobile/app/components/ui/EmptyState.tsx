// components/ui/EmptyState.tsx
// État vide ludique : gros emoji, message, action optionnelle.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { typography, spacing } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Props {
  emoji?: string;
  title: string;
  message?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ emoji = '🍬', title, message, action }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.title, { color: colors.text.dark }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: colors.text.body }]}>{message}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
    paddingHorizontal: spacing.xl,
  },
  emoji: { fontSize: 56, marginBottom: spacing.md },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.extrabold,
    textAlign: 'center',
  },
  message: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  action: { marginTop: spacing.lg, alignSelf: 'stretch' },
});
