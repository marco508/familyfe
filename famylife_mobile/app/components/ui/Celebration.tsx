// components/ui/Celebration.tsx — ANNEXE V6 : « boucle magique » de rétention.
// Overlay plein écran, léger et sans dépendance externe, joué à chaque
// validation réussie d'une tâche : un gros badge qui « pop » (scale/opacity),
// quelques particules emoji qui s'envolent, un « +X pts » qui monte et
// s'efface, et une pulsation haptique de succès. S'auto-ferme après ~1.2s en
// appelant `onDone`. N'intercepte aucun toucher (décoratif uniquement).
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Easing, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/contexts/ThemeContext';
import { typography, spacing, borderRadius, shadows } from '../../theme/designTokens';

interface Props {
  /** Affiche/déclenche la célébration. Repasser à `false` après `onDone`. */
  visible: boolean;
  /** Points gagnés à afficher ("+X pts"). 0/undefined = pas de compteur affiché. */
  points?: number;
  /** Emoji central (gros badge qui pop). */
  emoji?: string;
  /** Appelé une fois l'animation terminée (~1.2s). */
  onDone?: () => void;
}

const PARTICLE_EMOJIS = ['✨', '🎉', '⭐', '🍬', '🥳', '💫', '🍭'];
const PARTICLE_COUNT = 8;
const TOTAL_DURATION_MS = 1200;
const FADE_START_MS = 850;

export default function Celebration({ visible, points = 0, emoji = '🎉', onDone }: Props) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const pointsTranslate = useRef(new Animated.Value(0)).current;
  const pointsOpacity = useRef(new Animated.Value(0)).current;

  // Particules générées une seule fois (positions/emoji figés) — seule la
  // valeur animée `anim` est réinitialisée à chaque déclenchement.
  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }).map((_, i) => ({
        key: i,
        emoji: PARTICLE_EMOJIS[i % PARTICLE_EMOJIS.length],
        xOffset: (Math.random() - 0.5) * 220,
        rise: 160 + Math.random() * 90,
        delay: Math.random() * 140,
        spin: i % 2 === 0 ? 1 : -1,
        anim: new Animated.Value(0),
      })),
    []
  );

  useEffect(() => {
    if (!visible) return undefined;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    scale.setValue(0);
    opacity.setValue(1);
    pointsTranslate.setValue(0);
    pointsOpacity.setValue(0);
    particles.forEach((p) => p.anim.setValue(0));

    Animated.parallel([
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.15, friction: 4, tension: 180, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 220, useNativeDriver: true }),
      ]),
      Animated.timing(pointsOpacity, { toValue: 1, duration: 200, delay: 120, useNativeDriver: true }),
      Animated.timing(pointsTranslate, {
        toValue: 1,
        duration: 850,
        delay: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      ...particles.map((p) =>
        Animated.timing(p.anim, {
          toValue: 1,
          duration: 800 + p.delay,
          delay: p.delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      ),
    ]).start();

    const fadeTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: TOTAL_DURATION_MS - FADE_START_MS, useNativeDriver: true }),
        Animated.timing(pointsOpacity, { toValue: 0, duration: TOTAL_DURATION_MS - FADE_START_MS, useNativeDriver: true }),
      ]).start();
    }, FADE_START_MS);

    const doneTimer = setTimeout(() => {
      onDone?.();
    }, TOTAL_DURATION_MS);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p) => {
        const translateY = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -p.rise] });
        const particleOpacity = p.anim.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] });
        const rotate = p.anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 200}deg`] });
        return (
          <Animated.Text
            key={p.key}
            style={[
              styles.particle,
              {
                left: screenWidth / 2 + p.xOffset,
                opacity: particleOpacity,
                transform: [{ translateY }, { rotate }],
              },
            ]}
          >
            {p.emoji}
          </Animated.Text>
        );
      })}

      <View style={styles.center}>
        <Animated.View
          style={[
            styles.badge,
            shadows.candyGreen,
            { backgroundColor: colors.card, opacity, transform: [{ scale }] },
          ]}
        >
          <Text style={styles.badgeEmoji}>{emoji}</Text>
        </Animated.View>

        {points > 0 ? (
          <Animated.Text
            style={[
              styles.pointsText,
              {
                color: colors.candy.greenDark,
                opacity: pointsOpacity,
                transform: [
                  { translateY: pointsTranslate.interpolate({ inputRange: [0, 1], outputRange: [0, -46] }) },
                ],
              },
            ]}
          >
            +{points} pts
          </Animated.Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEmoji: { fontSize: 64 },
  pointsText: {
    marginTop: spacing.lg,
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.black,
  },
  particle: {
    position: 'absolute',
    top: '42%',
    fontSize: 26,
  },
});
