// app/(app)/modules.tsx — ANNEXE V8 : découverte progressive.
//
// Le retour n°1 des familles : « trop d'infos, je me perds ». Après avoir
// restructuré la navigation, dernier levier : un foyer neuf ne voit que le
// cœur (Aujourd'hui, Tâches, Agenda, Équité, Logement, Inviter, Réglages,
// Notifications) et allume le reste quand il en a besoin — ici.
//
// Chaque module est décrit par son BÉNÉFICE concret, pas par son nom de code :
// on ne demande pas « voulez-vous le module dépenses ? » mais on annonce
// « qui a payé quoi, et qui doit combien à qui ». Un interrupteur ne se vend
// pas tout seul.
//
// Écriture optimiste : l'interrupteur bascule immédiatement (MaisonContext met
// l'état à jour avant l'aller-retour réseau), et revient en arrière si l'API
// refuse. Aucune donnée n'est détruite en désactivant : le serveur ne touche
// qu'à la liste `modules`, les courses/dépenses/votes restent en base.
//
// ANNEXE V10 — « quand j'active une option, où est-ce que je la vois ? »
// Retour utilisateur : on cochait un interrupteur, l'écran ne bougeait pas, et
// RIEN ne disait où la fonction venait d'apparaître. Un module activé mais
// introuvable est pire qu'un module absent : on a promis, on n'a pas livré.
// Deux réponses complémentaires, aucune tapageuse :
//   1. Une mention PERMANENTE sous chaque module actif (« Plus ▸ Courses &
//      repas ») : la réponse est là même si on revient trois semaines plus tard.
//   2. Une confirmation BRÈVE et NON BLOQUANTE à l'activation (pas d'Alert : on
//      ne fait pas cliquer « OK » quelqu'un qui vient de cliquer), qui disparaît
//      toute seule au bout de quelques secondes.
// Pas de bannière publicitaire : une ligne de texte et une icône de lieu.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { router } from 'expo-router';
import {
  ArrowLeft,
  ShoppingCart,
  Wallet,
  Vote,
  Trophy,
  Landmark,
  MessageCircle,
  Info,
  Lock,
  MapPin,
  CheckCircle2,
} from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';
import { useMaison } from '../src/contexts/MaisonContext';
import { MODULES_CLES, ModuleCle } from '../src/services/maisonService';
import { CandyCard, SectionTitle, Toggle } from '../components/ui';
import { typography, spacing, borderRadius } from '../theme/designTokens';

// L'ordre d'affichage suit `MODULES_CLES` (= l'ordre canonique du serveur),
// pour que la liste ne se réordonne jamais sous les doigts.
const ICONES: Record<ModuleCle, any> = {
  courses: ShoppingCart,
  depenses: Wallet,
  decisions: Vote,
  jeu: Trophy,
  portefeuille: Landmark,
  chat: MessageCircle,
};

// ANNEXE V10 — chaque module sait dire OÙ il vit. La table est ici, en un seul
// endroit, pour qu'un déplacement d'écran ne laisse pas une indication fausse
// derrière lui (une mauvaise adresse est pire que pas d'adresse du tout).
// Ces chemins reflètent l'architecture V9 :
//   · Plus       → courses, depenses, decisions, chat
//   · Équité     → jeu (classement/défis/boutique y sont des segments ; l'écran
//                  n'a plus d'onglet, on y accède par la carte « Bilan de la
//                  semaine » d'Aujourd'hui)
//   · Réglages   → portefeuille (et encore : seulement pour un chef)
const OU_TROUVER: Record<ModuleCle, string> = {
  courses: 'modules.ouCourses',
  depenses: 'modules.ouDepenses',
  decisions: 'modules.ouDecisions',
  jeu: 'modules.ouJeu',
  portefeuille: 'modules.ouPortefeuille',
  chat: 'modules.ouChat',
};

// Durée d'affichage de la confirmation : assez pour être lue, assez court pour
// ne pas devenir un meuble.
const CONFIRMATION_MS = 6000;

// Clés i18n : `modules.<cle>Titre` / `modules.<cle>Desc`.
export default function ModulesScreen() {
  const { colors } = useTheme();
  const { t } = useT();
  // `isGestion` est le miroir exact de `require_gestion` côté API (chef,
  // co-chef ou chef temporaire) qui garde `PUT /maisons/{id}`. Utiliser
  // `isChef` masquerait les interrupteurs aux co-chefs alors que le serveur
  // les accepte.
  const { modules, isModuleActif, updateModules, isGestion } = useMaison();
  const [enCours, setEnCours] = useState<ModuleCle | null>(null);
  // Le module qu'on vient d'activer, le temps de dire où il est parti.
  const [confirmation, setConfirmation] = useState<ModuleCle | null>(null);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Un timer qui survit à la sortie de l'écran appellerait setState sur un
  // composant démonté : on le coupe.
  useEffect(() => {
    return () => {
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    };
  }, []);

  const annoncer = (cle: ModuleCle | null) => {
    if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    setConfirmation(cle);
    if (cle) {
      confirmationTimer.current = setTimeout(() => setConfirmation(null), CONFIRMATION_MS);
    }
  };

  const basculer = async (cle: ModuleCle, actif: boolean) => {
    if (!isGestion || enCours) return;
    // On reconstruit depuis `MODULES_CLES` : ordre stable et pas de doublon
    // possible, même si l'état local et le serveur divergeaient.
    const suivant = MODULES_CLES.filter((m) =>
      m === cle ? actif : modules.includes(m)
    ) as ModuleCle[];

    setEnCours(cle);
    const res = await updateModules(suivant);
    setEnCours(null);
    if (!res.success) {
      // Le contexte a déjà remis l'interrupteur dans son état précédent : la
      // confirmation aussi doit disparaître, sinon on annoncerait une adresse
      // pour un module finalement resté éteint.
      annoncer(null);
      Alert.alert(t('common.erreur'), res.error || t('modules.erreur'));
      return;
    }
    // On n'annonce QUE l'activation : à la désactivation, la ligne « où le
    // trouver » disparaît d'elle-même, ce qui est déjà la réponse.
    annoncer(actif ? cle : null);
  };

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>{t('modules.titre')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <SectionTitle title={t('modules.sousTitre')} emoji="🧩" />

        {/* Le mot d'intro : rassurer avant de demander de choisir. Désactiver
            n'efface rien — c'est LA crainte qui bloque ce genre d'écran. */}
        <CandyCard style={styles.introCard}>
          <View style={styles.introRow}>
            <Info size={18} color={colors.primary.main} />
            <Text style={[styles.introText, { color: colors.text.body }]}>{t('modules.intro')}</Text>
          </View>
        </CandyCard>

        {!isGestion ? (
          <CandyCard style={styles.introCard}>
            <View style={styles.introRow}>
              <Lock size={18} color={colors.text.muted} />
              <Text style={[styles.introText, { color: colors.text.body }]}>
                {t('modules.lectureSeule')}
              </Text>
            </View>
          </CandyCard>
        ) : null}

        {/* Confirmation brève et non bloquante : elle répond à « où est-ce que
            je la vois ? » à la seconde où la question se pose, puis s'efface. */}
        {confirmation ? (
          <View
            style={[
              styles.confirmCard,
              { backgroundColor: colors.primary.subtle, borderColor: colors.primary.main },
            ]}
          >
            <CheckCircle2 size={18} color={colors.primary.main} />
            <Text style={[styles.confirmText, { color: colors.primary.main }]}>
              {t('modules.activeConfirmation')
                .replace('{module}', t(`modules.${confirmation}Titre`))
                .replace('{ou}', t(OU_TROUVER[confirmation]))}
            </Text>
          </View>
        ) : null}

        <CandyCard style={styles.listCard}>
          {MODULES_CLES.map((cle, idx) => {
            const Icon = ICONES[cle];
            const actif = isModuleActif(cle);
            return (
              <View
                key={cle}
                style={[
                  styles.ligne,
                  idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                ]}
              >
                <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
                  <Icon size={18} color={actif ? colors.primary.main : colors.text.muted} />
                </View>
                <View style={styles.ligneTexte}>
                  <Text style={[styles.ligneTitre, { color: colors.text.dark }]}>
                    {t(`modules.${cle}Titre`)}
                  </Text>
                  <Text style={[styles.ligneDesc, { color: colors.text.body }]}>
                    {t(`modules.${cle}Desc`)}
                  </Text>
                  {/* Mention permanente : tant que le module est actif, son
                      adresse reste écrite noir sur blanc. Sur un module éteint
                      elle n'aurait aucun sens (la fonction n'est nulle part). */}
                  {actif ? (
                    <View style={styles.ouRow}>
                      <MapPin size={11} color={colors.primary.main} />
                      <Text style={[styles.ouText, { color: colors.primary.main }]}>
                        {t(OU_TROUVER[cle])}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {/* Pour un membre non gestionnaire : l'état reste visible (il
                    comprend ce que son foyer utilise) mais non modifiable. */}
                <Toggle
                  value={actif}
                  onValueChange={(v) => basculer(cle, v)}
                  disabled={!isGestion || enCours !== null}
                />
              </View>
            );
          })}
        </CandyCard>

        <Text style={[styles.footnote, { color: colors.text.muted }]}>{t('modules.toujoursActifs')}</Text>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.md,
  },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.extrabold },
  container: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing['4xl'] },
  introCard: { marginBottom: spacing.md },
  introRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  introText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: 19,
  },
  // Le padding vertical est porté par chaque ligne pour que les séparateurs
  // aillent d'un bord à l'autre de la carte.
  listCard: { paddingVertical: 0, marginBottom: spacing.lg },
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
  ligneTexte: { flex: 1 },
  ligneTitre: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold },
  ligneDesc: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    marginTop: 2,
    lineHeight: 16,
  },
  // ANNEXE V10 — « où le trouver » : discret (xs, une icône de 11px), mais
  // toujours là. On indique, on ne vend pas.
  ouRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  ouText: { flex: 1, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold, lineHeight: 15 },
  confirmCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  confirmText: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 16,
  },
  footnote: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
    lineHeight: 16,
  },
});
