// app/(app)/(tabs)/plus.tsx
// ANNEXE V9 — "Plus" : le strict nécessaire.
//
// Historique du désencombrement :
//   V7 : la grille de 14 tuiles en dégradés (toutes de même taille, de même
//        intensité — quand tout est mis en avant, rien ne l'est) devient une
//        liste sobre : icône discrète + label + chevron.
//   V8 : les entrées d'un module désactivé disparaissent (découverte
//        progressive).
//   V9 : on retire les REDONDANCES. Le menu restait chargé sur un foyer qui a
//        tout activé : 9 lignes + 3 titres de groupe. Or trois entrées avaient
//        déjà un meilleur foyer ailleurs :
//          · Modules   → vit dans Réglages (il y était DÉJÀ : doublon pur).
//          · Inviter   → vit dans l'écran Logement (qui le propose déjà).
//          · Portefeuille → de l'administratif : sa place est dans Réglages.
//        Et les titres de groupe coûtaient trois lignes de texte pour chapeauter
//        2 à 4 entrées : la séparation en cartes suffit à grouper (motif Réglages
//        d'iOS). Résultat : 6 lignes et 0 titre au lieu de 9 + 3.
//
// Ce qu'il reste, et pourquoi :
//   Carte 1 — ce que le foyer FAIT (les modules actifs) + le logement.
//   Carte 2 — Réglages, qui contient tout le paramétrage (dont Modules).
//   Une ligne d'appel discrète si, et seulement si, il reste à activer.
import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import {
  ShoppingCart,
  Wallet,
  Vote,
  Home as HomeIcon,
  Settings,
  MessageCircle,
  Plus as PlusIcon,
  ChevronRight,
} from 'lucide-react-native';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';
import { useNotifications } from '../../src/contexts/NotificationContext';
import { useMaison } from '../../src/contexts/MaisonContext';
import { MODULES_CLES } from '../../src/services/maisonService';
import { CandyCard, NotificationBell, SectionTitle } from '../../components/ui';
import { typography, spacing, borderRadius } from '../../theme/designTokens';

interface Entree {
  key: string;
  label: string;
  icon: any;
  href: string;
}

export default function PlusScreen() {
  const { colors } = useTheme();
  const { t } = useT();
  const { unreadCount, refresh: refreshNotifCount } = useNotifications();
  const { isModuleActif, modules } = useMaison();

  // Reste-t-il quelque chose à découvrir ? Sert à ne proposer « Activer d'autres
  // fonctions » que quand cette phrase a un sens (sinon c'est du bruit de plus).
  const resteAActiver = MODULES_CLES.some((m) => !modules.includes(m));

  // Carte 1 — ce que le foyer fait au quotidien, puis le logement lui-même.
  const foyer: Entree[] = [
    ...(isModuleActif('courses')
      ? [{ key: 'courses', label: t('plus.coursesRepas'), icon: ShoppingCart, href: '/(app)/courses' }]
      : []),
    ...(isModuleActif('depenses')
      ? [{ key: 'depenses', label: t('plus.depenses'), icon: Wallet, href: '/(app)/depenses' }]
      : []),
    ...(isModuleActif('decisions')
      ? [{ key: 'decisions', label: t('plus.decisions'), icon: Vote, href: '/(app)/decisions' }]
      : []),
    // Chat est éteint par défaut (un foyer neuf a `modules: []`) : les familles
    // utilisent déjà WhatsApp. Mais s'il est explicitement allumé, il faut
    // pouvoir l'atteindre — sinon on activerait une fonction introuvable.
    ...(isModuleActif('chat')
      ? [{ key: 'chat', label: t('plus.chat'), icon: MessageCircle, href: '/(app)/chat' }]
      : []),
    // Toujours là : le logement est le cœur, jamais un module.
    // (« Inviter » n'est PAS répété ici : l'écran Logement le propose déjà.)
    { key: 'maison', label: t('plus.maison'), icon: HomeIcon, href: '/(app)/(tabs)/maison' },
  ];

  // Carte 2 — le paramétrage. Réglages contient Modules, Portefeuille, thème,
  // langue, profil : une seule porte, pas cinq.
  const reglages: Entree[] = [
    { key: 'reglages', label: t('plus.reglages'), icon: Settings, href: '/(app)/reglages' },
  ];

  const Liste = ({ entrees }: { entrees: Entree[] }) => (
    <CandyCard style={styles.carte}>
      {entrees.map((entree, idx) => {
        const Icon = entree.icon;
        return (
          <Pressable
            key={entree.key}
            onPress={() => router.push(entree.href as any)}
            style={[
              styles.ligne,
              idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
              <Icon size={18} color={colors.text.body} />
            </View>
            <Text style={[styles.ligneLabel, { color: colors.text.dark }]} numberOfLines={1}>
              {entree.label}
            </Text>
            <ChevronRight size={18} color={colors.text.muted} />
          </Pressable>
        );
      })}
    </CandyCard>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SectionTitle
        title={t('plus.titre')}
        subtitle={t('plus.sousTitre')}
        right={
          <NotificationBell
            count={unreadCount}
            onPress={() => {
              refreshNotifCount();
              router.push('/(app)/notifications');
            }}
          />
        }
      />

      <View style={styles.bloc}>
        <Liste entrees={foyer} />
      </View>
      <View style={styles.bloc}>
        <Liste entrees={reglages} />
      </View>

      {/* Appel discret, uniquement s'il reste réellement quelque chose à
          activer : une ligne de texte, pas une bannière — on désencombre, on ne
          rajoute pas un panneau publicitaire en bas du menu. */}
      {resteAActiver ? (
        <Pressable onPress={() => router.push('/(app)/modules')} style={styles.activerRow} hitSlop={8}>
          <PlusIcon size={15} color={colors.text.muted} />
          <Text style={[styles.activerText, { color: colors.text.muted }]}>{t('plus.activerAutres')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, paddingTop: spacing['2xl'], paddingBottom: 140 },
  bloc: { marginTop: spacing.lg },
  // Le padding vertical est porté par chaque ligne pour que les séparateurs
  // aillent d'un bord à l'autre de la carte.
  carte: { paddingVertical: 0 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ligneLabel: { flex: 1, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold },
  activerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
  activerText: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold },
});
