// app/(app)/(tabs)/_layout.tsx
// Barre d'onglets "bonbon" flottante : pilule blanche, bulle dégradée sur
// l'onglet actif, haptics au tap.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Home, ListChecks, CalendarDays, BarChart3, LayoutGrid } from 'lucide-react-native';
import ScreenBackground from '../../components/ScreenBackground';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';
import { typography, spacing, borderRadius, shadows } from '../../theme/designTokens';

const ICONS: Record<string, any> = {
  index: Home,
  activites: ListChecks,
  agenda: CalendarDays,
  votes: BarChart3,
  plus: LayoutGrid,
};

// Onglets bonbon "principaux" affichés dans la barre — volontairement limités
// à 5 pour ne pas la surcharger (voir ANNEXE V3 : "Regrouper les onglets
// secondaires dans un menu Plus"). Les routes non listées ici (ex: "maison",
// conservée comme fichier dans ce groupe pour son historique de navigation)
// restent accessibles par navigation directe mais n'apparaissent pas ici.
const TAB_ORDER = ['index', 'activites', 'agenda', 'votes', 'plus'];

function CandyTabBar({ state, descriptors, navigation }: any) {
  const { colors, gradients } = useTheme();
  const { t } = useT();
  const LABELS: Record<string, string> = {
    index: t('nav.accueil'),
    activites: t('nav.activites'),
    agenda: t('nav.agenda'),
    votes: t('nav.votes'),
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
      <Tabs
        tabBar={(props) => <CandyTabBar {...props} />}
        sceneContainerStyle={{ backgroundColor: 'transparent' }}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      >
        <Tabs.Screen name="index" options={{ title: t('nav.accueil') }} />
        <Tabs.Screen name="activites" options={{ title: t('nav.activites') }} />
        <Tabs.Screen name="agenda" options={{ title: t('nav.agenda') }} />
        <Tabs.Screen name="votes" options={{ title: t('nav.votes') }} />
        <Tabs.Screen name="plus" options={{ title: t('nav.plus') }} />
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
