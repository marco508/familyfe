// components/ui/Repliable.tsx
// Divulgation progressive : un bloc dépliant sobre pour ranger le réglage fin
// d'un formulaire derrière un « Plus d'options ». Les champs ESSENTIELS restent
// toujours visibles ; ce composant n'accueille que le secondaire.
//
// Volontairement sobre : pas de carte, juste un en-tête pressable (chevron +
// titre, éventuellement un sous-titre qui RÉSUME l'état replié — capital quand
// le contenu masqué change le comportement, ex. « Partagé entre tous ») et un
// simple séparateur.
//
// Édition : `ouvertParDefaut` permet d'ouvrir le bloc d'emblée quand au moins
// un des champs masqués porte déjà une valeur — sinon l'utilisateur qui modifie
// un élément existant croirait ces réglages inexistants.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { spacing, typography } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Props {
  titre: string;
  /** Résumé d'une ligne de l'état replié (ex. « Partagé entre tous »). */
  sousTitre?: string;
  children: React.ReactNode;
  ouvertParDefaut?: boolean;
}

export default function Repliable({ titre, sousTitre, children, ouvertParDefaut = false }: Props) {
  const { colors } = useTheme();
  const [ouvert, setOuvert] = useState(ouvertParDefaut);

  // Si la feuille passe en mode édition alors qu'elle est déjà montée, on
  // ouvre le bloc — mais on ne le RE-ferme jamais dans le dos de l'utilisateur.
  const precedent = useRef(ouvertParDefaut);
  useEffect(() => {
    if (ouvertParDefaut && !precedent.current) setOuvert(true);
    precedent.current = ouvertParDefaut;
  }, [ouvertParDefaut]);

  const Chevron = ouvert ? ChevronDown : ChevronRight;

  return (
    <View style={[styles.wrap, { borderTopColor: colors.border }]}>
      <Pressable
        onPress={() => setOuvert((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={titre}
        accessibilityState={{ expanded: ouvert }}
        hitSlop={6}
        style={styles.header}
      >
        <Chevron size={18} color={colors.text.body} />
        <View style={styles.headerTexts}>
          <Text style={[styles.title, { color: colors.text.dark }]} numberOfLines={1}>
            {titre}
          </Text>
          {sousTitre && !ouvert ? (
            <Text style={[styles.subtitle, { color: colors.text.muted }]} numberOfLines={1}>
              {sousTitre}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {ouvert ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  headerTexts: { flex: 1 },
  title: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.extrabold,
  },
  subtitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    marginTop: 2,
  },
  content: { paddingTop: spacing.xs },
});
