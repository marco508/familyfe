// components/ui/BottomSheet.tsx
// Feuille modale « bonbon » qui glisse depuis le bas : poignée, en-tête compact
// (emoji + titre + fermeture), contenu défilable, et zone d'actions collante en
// bas. Gère le clavier, la zone sûre et le thème sombre. Remplace les <Modal>
// centrés peu ergonomiques par un pattern bottom-sheet moderne.
import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';
import { spacing, borderRadius, typography, shadows } from '../../theme/designTokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  emoji?: string;
  children: React.ReactNode;
  /** Zone d'actions collée en bas (ex. bouton Enregistrer). */
  footer?: React.ReactNode;
}

export default function BottomSheet({ visible, onClose, title, emoji, children, footer }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(height)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 24,
          stiffness: 240,
          mass: 0.9,
        }),
        Animated.timing(backdrop, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: height, duration: 200, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, height, translateY, backdrop]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.sheet,
              shadows.soft,
              { backgroundColor: colors.card, maxHeight: height * 0.9, transform: [{ translateY }] },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            {title || emoji ? (
              <View style={styles.header}>
                <Text style={[styles.title, { color: colors.text.dark }]} numberOfLines={1}>
                  {emoji ? `${emoji}  ` : ''}
                  {title}
                </Text>
                <Pressable
                  onPress={onClose}
                  hitSlop={10}
                  style={[styles.close, { backgroundColor: colors.surface }]}
                >
                  <X size={18} color={colors.text.body} />
                </Pressable>
              </View>
            ) : null}

            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>

            {footer ? (
              <View
                style={[
                  styles.footer,
                  { borderTopColor: colors.border, paddingBottom: insets.bottom + spacing.md },
                ]}
              >
                {footer}
              </View>
            ) : (
              <View style={{ height: insets.bottom }} />
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
  kav: { justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    marginBottom: spacing.sm,
    opacity: 0.6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  title: {
    flex: 1,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.extrabold,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, borderTopWidth: 1 },
});
