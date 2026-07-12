// components/ui/ListItem.tsx
// Ligne de liste générique "bonbon" : icône/avatar à gauche, titre + sous-titre,
// contenu libre à droite. Réutilisée par Courses, Défis, Boutique, Classement…
import React from 'react';
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { borderRadius, spacing, typography } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';
import CandyCard from './CandyCard';

interface Props {
  left?: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  strikethrough?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function ListItem({ left, title, subtitle, right, onPress, strikethrough, style }: Props) {
  const { colors } = useTheme();
  const content = (
    <CandyCard style={[styles.card, style]}>
      <View style={styles.row}>
        {left ? <View style={styles.left}>{left}</View> : null}
        <View style={styles.textCol}>
          <Text
            style={[
              styles.title,
              { color: colors.text.dark },
              strikethrough && { textDecorationLine: 'line-through', color: colors.text.muted },
            ]}
            numberOfLines={2}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.text.body }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </CandyCard>
  );

  if (!onPress) return content;
  return <Pressable onPress={onPress}>{content}</Pressable>;
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm, paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  left: { alignItems: 'center', justifyContent: 'center' },
  textCol: { flex: 1 },
  title: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  subtitle: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
});
