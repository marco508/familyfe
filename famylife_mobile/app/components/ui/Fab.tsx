// components/ui/Fab.tsx
// Bouton d'action flottant rond "bonbon" (ex: + ajouter), position absolue
// au choix de l'écran appelant (via `style`).
import React from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { borderRadius, shadows } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Props {
  icon: React.ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  size?: number;
  /** Libellé VoiceOver/TalkBack : un FAB est icône-seule, donc muet sans lui. */
  accessibilityLabel?: string;
}

export default function Fab({ icon, onPress, style, size = 56, accessibilityLabel }: Props) {
  const { gradients } = useTheme();
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress();
  };
  const dim = { width: size, height: size, borderRadius: size / 2 };
  return (
    <Pressable
      onPress={handlePress}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <LinearGradient colors={gradients.candyPink} style={[dim, styles.center, shadows.candyPink]}>
        {icon}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
