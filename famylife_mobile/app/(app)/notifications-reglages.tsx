// app/(app)/notifications-reglages.tsx — ANNEXE V10 : « je reçois quoi ? »
//
// Jusqu'ici, une notification de trop ne laissait qu'un choix : tout couper au
// niveau de l'OS. L'app perdait alors le seul canal par lequel elle est utile.
// Ici, on coupe une CATÉGORIE, pas l'app.
//
// LE PIÈGE DU SENS. Le serveur stocke `notif_desactivees` : la liste de ce
// qu'on ne veut PAS. Recopier ce modèle dans l'écran donnerait des
// interrupteurs « Désactiver le chat » qu'il faudrait ALLUMER pour ne plus rien
// recevoir — une double négation, la meilleure façon de faire l'inverse de ce
// qu'on voulait. Donc : à l'écran, allumé = JE REÇOIS. La négation est
// retournée ici, à la frontière, et nulle part ailleurs.
//
// LE TEXTE. Une catégorie ne se devine pas depuis son nom : « Foyer », seul, ne
// veut rien dire. Chaque ligne dit donc ce qu'on reçoit, en phrases concrètes
// (« Un membre arrive, un rôle change, un anniversaire. ») plutôt qu'en jargon
// (« Événements liés au cycle de vie du foyer »).
//
// Écriture optimiste : l'interrupteur bascule tout de suite, et revient en
// arrière si l'API refuse — même contrat que l'écran Modules.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import {
  ArrowLeft,
  Bell,
  Info,
  ListChecks,
  CalendarDays,
  Vote,
  Wallet,
  ShoppingCart,
  MessageCircle,
  Trophy,
  Users,
} from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';
import authService from '../src/services/authService';
import notificationService, { CATEGORIES_NOTIF_REPLI } from '../src/services/notificationService';
import { CandyCard, SectionTitle, Toggle } from '../components/ui';
import { typography, spacing, borderRadius } from '../theme/designTokens';

// Une icône par catégorie connue. `Bell` sert de repli : si le serveur annonce
// une catégorie que cette version de l'app ne connaît pas encore, elle doit
// rester affichable et réglable — mieux vaut une cloche générique qu'une ligne
// manquante (l'utilisateur recevrait alors des notifications qu'il ne peut pas
// couper).
const ICONES: Record<string, any> = {
  corvees: ListChecks,
  sorties: CalendarDays,
  decisions: Vote,
  depenses: Wallet,
  courses: ShoppingCart,
  chat: MessageCircle,
  jeu: Trophy,
  foyer: Users,
};

export default function NotificationsReglagesScreen() {
  const { colors } = useTheme();
  const { t } = useT();

  const [categories, setCategories] = useState<string[]>([]);
  const [desactivees, setDesactivees] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    // Les deux appels sont indépendants : la taxonomie (ce qui existe) et l'état
    // (ce que j'ai coupé).
    const [profil, cats] = await Promise.all([
      authService.getProfile(),
      notificationService.categories(),
    ]);
    // Le serveur fait autorité sur la liste ET sur son ordre. Repli sur la
    // liste connue de cette version si l'appel échoue : un écran vide serait
    // pire qu'un écran légèrement daté.
    const liste = cats.data?.categories?.length ? cats.data.categories : [...CATEGORIES_NOTIF_REPLI];
    setCategories(liste);
    setDesactivees(profil.data?.notif_desactivees ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  // `recevoir` est ce que l'utilisateur voit et veut ; `desactivees` est ce que
  // le serveur stocke. Le retournement se fait ici, en une ligne.
  const basculer = async (cle: string, recevoir: boolean) => {
    if (enCours) return;
    const precedent = desactivees;
    const suivant = recevoir
      ? precedent.filter((c) => c !== cle)
      : precedent.includes(cle)
        ? precedent
        : [...precedent, cle];

    setDesactivees(suivant); // optimiste
    setEnCours(cle);
    const res = await notificationService.setDesactivees(suivant);
    setEnCours(null);

    if (res.error || !res.data) {
      setDesactivees(precedent); // retour arrière : l'API a refusé
      Alert.alert(t('common.erreur'), res.error || t('notifsPrefs.erreur'));
      return;
    }
    // La réponse est la source de vérité (elle renvoie `desactivees`).
    setDesactivees(res.data.desactivees ?? suivant);
  };

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>{t('notifsPrefs.titre')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <SectionTitle title={t('notifsPrefs.sousTitre')} emoji="🔔" />

        {/* Rassurer avant de laisser couper : ce réglage est personnel, il
            n'impose rien aux autres membres du logement. */}
        <CandyCard style={styles.introCard}>
          <View style={styles.introRow}>
            <Info size={18} color={colors.primary.main} />
            <Text style={[styles.introText, { color: colors.text.body }]}>{t('notifsPrefs.intro')}</Text>
          </View>
        </CandyCard>

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
        ) : (
          <CandyCard style={styles.listCard}>
            {categories.map((cle, idx) => {
              const Icon = ICONES[cle] ?? Bell;
              // Le cœur de l'écran : allumé = je reçois.
              const recevoir = !desactivees.includes(cle);
              // Repli sur la clé brute pour une catégorie inconnue de cette
              // version : illisible, mais réglable. Une description absente
              // n'affiche simplement pas de deuxième ligne.
              const titre = t(`notifsPrefs.${cle}Titre`, cle);
              const desc = t(`notifsPrefs.${cle}Desc`, '');
              return (
                <View
                  key={cle}
                  style={[
                    styles.ligne,
                    idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                  ]}
                >
                  <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
                    <Icon size={18} color={recevoir ? colors.primary.main : colors.text.muted} />
                  </View>
                  <View style={styles.ligneTexte}>
                    <Text style={[styles.ligneTitre, { color: colors.text.dark }]}>{titre}</Text>
                    {desc ? (
                      <Text style={[styles.ligneDesc, { color: colors.text.body }]}>{desc}</Text>
                    ) : null}
                  </View>
                  <Toggle
                    value={recevoir}
                    onValueChange={(v) => basculer(cle, v)}
                    disabled={enCours !== null}
                  />
                </View>
              );
            })}
          </CandyCard>
        )}
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
  // aillent d'un bord à l'autre de la carte (même motif que l'écran Modules).
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
});
