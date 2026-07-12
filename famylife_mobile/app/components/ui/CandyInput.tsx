// components/ui/CandyInput.tsx
// Champ de saisie "bonbon" : fond blanc, coins arrondis, bord pastel,
// libellé au-dessus, message d'erreur en dessous.
import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, TextInputProps, Pressable } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { borderRadius, spacing, typography } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  isPassword?: boolean;
}

export default function CandyInput({ label, error, icon, isPassword, style, ...rest }: Props) {
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(!!isPassword);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={[styles.label, { color: colors.text.dark }]}>{label}</Text> : null}
      <View
        style={[
          styles.inputRow,
          { backgroundColor: colors.card, borderColor: colors.border },
          error && { borderColor: colors.candy.red },
        ]}
      >
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <TextInput
          placeholderTextColor={colors.text.muted}
          {...rest}
          style={[styles.input, { color: colors.text.dark }, style]}
          secureTextEntry={isPassword ? hidden : rest.secureTextEntry}
        />
        {isPassword ? (
          <Pressable onPress={() => setHidden((v) => !v)} hitSlop={10} style={styles.eyeButton}>
            {hidden ? (
              <EyeOff size={20} color={colors.text.muted} />
            ) : (
              <Eye size={20} color={colors.text.muted} />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={[styles.error, { color: colors.candy.red }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },
  label: {
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
  },
  icon: { marginRight: spacing.sm },
  eyeButton: { marginLeft: spacing.sm, padding: spacing.xs },
  input: {
    flex: 1,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    paddingVertical: spacing.md,
  },
  error: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
    fontWeight: typography.fontWeight.medium,
  },
});
