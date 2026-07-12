// components/ui/Avatar.tsx
// Avatar rond : image si fournie, sinon emoji, sinon initiales sur fond
// dégradé coloré (couleur déduite du nom pour rester stable).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, typography } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';
import apiClient from '../../src/services/apiClient';

interface Props {
  name?: string | null;
  image?: string | null;
  size?: number;
  ringColor?: string;
}

const PALETTE = [
  gradients.candyPink,
  gradients.candyPurple,
  gradients.candyBlue,
  gradients.candyGreen,
  gradients.candyOrange,
  gradients.candyYellow,
];

function initialsFor(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function colorIndexFor(name?: string | null): number {
  if (!name) return 0;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % PALETTE.length;
  }
  return Math.abs(hash) % PALETTE.length;
}

export default function Avatar({ name, image, size = 40, ringColor }: Props) {
  const { colors } = useTheme();
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  // Emoji seul (courte chaîne non-URL/chemin) : on l'affiche tel quel sur fond clair.
  const isEmojiOnly =
    !!image && !image.startsWith('http') && !image.startsWith('file') && !image.startsWith('/') && image.length <= 4;

  if (image && !isEmojiOnly) {
    // Chemin relatif (ex: "/uploads/avatars/x.jpg" — upload ANNEXE V3) : on le
    // résout via apiClient pour obtenir une URL absolue affichable.
    const uri = apiClient.resolveMediaUrl(image) || image;
    return (
      <View
        style={[
          styles.imageWrap,
          dimensionStyle,
          { backgroundColor: colors.candy.cream },
          ringColor ? { borderColor: ringColor, borderWidth: 2 } : null,
        ]}
      >
        <Image source={{ uri }} style={dimensionStyle} contentFit="cover" transition={150} />
      </View>
    );
  }

  if (isEmojiOnly) {
    return (
      <View style={[styles.emojiWrap, dimensionStyle, { backgroundColor: colors.candy.cream, borderColor: colors.border }]}>
        <Text style={{ fontSize: size * 0.55 }}>{image}</Text>
      </View>
    );
  }

  const grad = PALETTE[colorIndexFor(name)];
  return (
    <LinearGradient colors={grad} style={[dimensionStyle, styles.gradientWrap]}>
      <Text style={[styles.initials, { color: colors.candy.white, fontSize: size * 0.38 }]}>{initialsFor(name)}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    overflow: 'hidden',
  },
  emojiWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  gradientWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: typography.fontWeight.extrabold,
  },
});
