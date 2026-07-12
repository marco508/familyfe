// components/ui/CandyCard.tsx
// Carte blanche, coins très arrondis, ombre douce colorée, liseré pastel.
import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { borderRadius, spacing, shadows } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}

export default function CandyCard({ children, style, padded = true }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.card,
    borderWidth: 1,
    ...shadows.soft,
  },
  padded: {
    padding: spacing.lg,
  },
});
