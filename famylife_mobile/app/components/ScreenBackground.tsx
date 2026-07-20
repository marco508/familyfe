// components/ScreenBackground.tsx
// Fond bonbon commun à tous les écrans : dégradé pastel sucré + quelques
// pastilles décoratives discrètes pour l'ambiance "Candy Crush".
// Gère AUSSI les zones sûres (encoche/barre d'état en haut, barre de navigation
// gestuelle en bas) via les insets : le contenu ne passe jamais sous ces barres.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/contexts/ThemeContext';

type Edge = 'top' | 'bottom';

export default function ScreenBackground({
  children,
  edges = ['top', 'bottom'],
}: {
  children: React.ReactNode;
  /** Bords sur lesquels appliquer la zone sûre. Par défaut haut + bas. */
  edges?: Edge[];
}) {
  const { gradients, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const paddingTop = edges.includes('top') ? insets.top : 0;
  const paddingBottom = edges.includes('bottom') ? insets.bottom : 0;

  return (
    <View style={[styles.root, isDark && styles.rootDark]}>
      {/* Dégradé + pastilles en plein écran, derrière la zone sûre */}
      <LinearGradient colors={gradients.appBackground} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[styles.blob, styles.blobPink, isDark && styles.blobDark]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobBlue, isDark && styles.blobDark]} />
      {/* Contenu, décalé sous la barre d'état et au-dessus de la barre de nav */}
      <View style={[styles.content, { paddingTop, paddingBottom }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF8F0' },
  rootDark: { backgroundColor: '#221820' },
  blobDark: { opacity: 0.12 },
  content: { flex: 1 },
  blob: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.25,
  },
  blobPink: {
    width: 220,
    height: 220,
    backgroundColor: '#F7C9AE',
    top: -60,
    right: -60,
  },
  blobBlue: {
    width: 180,
    height: 180,
    backgroundColor: '#C9DBC4',
    bottom: 40,
    left: -70,
  },
});
