// components/ui/Checkbox.tsx
// Case à cocher "bonbon" ronde : coche animée-friendly, dégradé quand cochée.
// Utilisée pour les courses, sous-tâches d'activité, etc.
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { borderRadius } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Props {
  checked: boolean;
  onToggle: () => void;
  size?: number;
  disabled?: boolean;
}

export default function Checkbox({ checked, onToggle, size = 26, disabled }: Props) {
  const { colors, gradients } = useTheme();

  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onToggle();
  };

  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (checked) {
    return (
      <Pressable onPress={handlePress} disabled={disabled} hitSlop={8}>
        <LinearGradient colors={gradients.candyGreen} style={[dim, styles.center]}>
          <Check size={size * 0.6} color={colors.candy.white} strokeWidth={3} />
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      hitSlop={8}
      style={[dim, styles.center, styles.empty, { borderColor: colors.border }]}
    />
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  empty: { borderWidth: 2, backgroundColor: 'transparent' },
});
