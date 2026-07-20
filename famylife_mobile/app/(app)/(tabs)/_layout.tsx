// app/(app)/(tabs)/_layout.tsx
// Barre d'onglets "bonbon" flottante : pilule blanche, bulle dégradée sur
// l'onglet actif, haptics au tap.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
// `Home` sert d'icône de repli si une route n'est pas dans ICONS (voir plus bas).
import { Sun, ClipboardCheck, CalendarDays, LayoutGrid, Home } from 'lucide-react-native';
import ScreenBackground from '../../components/ScreenBackground';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';
import { typography, spacing, borderRadius, shadows } from '../../theme/designTokens';

const ICONS: Record<string, any> = {
  index: Sun,
  taches: ClipboardCheck,
  agenda: CalendarDays,
  plus: LayoutGrid,
};

// Onglets principaux — ANNEXE V7 : la barre suit le cœur de l'app ("faire
// tourner le foyer sans se disputer") et non l'historique des ajouts.
// Auparavant "Votes" occupait un onglet pendant que Tâches était enterrée dans
// le menu Plus : la hiérarchie était inversée, d'où les retours « je me perds ».
//
// ANNEXE V9 — on descend à 4 onglets. Un onglet se justifie par un geste
// QUOTIDIEN ; l'équité, elle, se consulte une fois par semaine : c'est une prise
// de recul, pas une destination. Pire, elle est VIDE pour un foyer neuf (aucun
// historique) — on donnait l'emplacement le plus précieux de l'app à un écran
// muet au démarrage, exactement l'erreur qu'on venait de corriger avec Votes.
// Elle vit désormais dans la carte « Bilan de la semaine » d'Aujourd'hui, qui
// porte son signal (déséquilibre + qui prend la suivante) et mène à l'écran
// complet : plus vue là qu'en onglet que personne ne tape.
//
// Les routes non listées ici (equite, activites, votes, maison) restent
// vivantes pour les liens directs, mais sortent de la barre.
const TAB_ORDER = ['index', 'taches', 'agenda', 'plus'];

function CandyTabBar({ state, descriptors, navigation }: any) {
  const { colors, gradients } = useTheme();
  const { t } = useT();
  const LABELS: Record<string, string> = {
    index: t('nav.accueil'),
    taches: t('nav.taches'),
    agenda: t('nav.agenda'),
    plus: t('nav.plus'),
  };
  const visibleRoutes = TAB_ORDER
    .map((name) => state.routes.find((r: any) => r.name === name))
    .filter(Boolean) as any[];

  return (
    <View style={styles.tabBarWrap}>
      <View style={[styles.tabBar, { backgroundColor: colors.card }]}>
        {visibleRoutes.map((route: any) => {
          const index = state.routes.indexOf(route);
          const isFocused = state.index === index;
          const Icon = ICONS[route.name] ?? Home;
          const label = LABELS[route.name] ?? route.name;

          const onPress = () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable key={route.key} onPress={onPress} style={styles.tabItem}>
              {isFocused ? (
                <LinearGradient colors={gradients.tabBubble} style={[styles.bubble, shadows.candyPurple]}>
                  <Icon size={20} color={colors.candy.white} />
                </LinearGradient>
              ) : (
                <View style={styles.bubbleInactive}>
                  <Icon size={20} color={colors.text.muted} />
                </View>
              )}
              <Text
                style={[styles.tabLabel, { color: isFocused ? colors.text.dark : colors.text.muted }]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useT();
  return (
    <ScreenBackground>
      {/* `sceneStyle` transparent est ce qui laisse voir ScreenBackground à
          travers le navigateur (sans lui, le fond opaque du navigateur écrase
          le thème sombre). L'ancienne prop `sceneContainerStyle` n'existe plus
          sur Tabs en SDK 54 : elle était ignorée, `sceneStyle` la remplace. */}
      <Tabs
        tabBar={(props) => <CandyTabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      >
        {/* Onglets visibles dans la barre (voir TAB_ORDER). */}
        <Tabs.Screen name="index" options={{ title: t('nav.accueil') }} />
        <Tabs.Screen name="taches" options={{ title: t('nav.taches') }} />
        <Tabs.Screen name="agenda" options={{ title: t('nav.agenda') }} />
        <Tabs.Screen name="plus" options={{ title: t('nav.plus') }} />
        {/* Routes du groupe conservées pour les liens directs, hors barre.
            `equite` reste un écran plein (atteint depuis la carte « Bilan de la
            semaine » d'Aujourd'hui) : seule sa place dans la barre disparaît. */}
        <Tabs.Screen name="equite" options={{ title: t('nav.equite') }} />
        <Tabs.Screen name="activites" options={{ title: t('nav.activites') }} />
        <Tabs.Screen name="votes" options={{ title: t('nav.votes') }} />
        <Tabs.Screen name="maison" options={{ title: t('nav.maison') }} />
      </Tabs>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  tabBarWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: borderRadius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    ...shadows.soft,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.xs,
  },
  bubble: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleInactive: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
});
