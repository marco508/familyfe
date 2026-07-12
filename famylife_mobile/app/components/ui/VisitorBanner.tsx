// components/ui/VisitorBanner.tsx
// Bandeau affiché en tête des écrans principaux quand le membre courant a le
// rôle "visiteur" (temporaire, lecture seule) dans la maison active — ANNEXE V4.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Eye } from 'lucide-react-native';
import { spacing, borderRadius, typography } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';

export default function VisitorBanner() {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <View style={[styles.banner, { backgroundColor: colors.primary.subtle, borderColor: colors.primary.border }]}>
      <Eye size={16} color={colors.primary.main} />
      <Text style={[styles.text, { color: colors.primary.main }]} numberOfLines={1}>
        {t('visiteur.bandeau')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.pill,
    borderWidth: 1.5,
    marginBottom: spacing.lg,
  },
  text: { fontWeight: typography.fontWeight.extrabold, fontSize: typography.fontSize.sm },
});
