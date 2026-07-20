// components/ui/AvatarStack.tsx
// Pile d'avatars qui se chevauchent (+ « +N » si débordement). Remplace une
// énumération de prénoms par une rangée de visages qu'on reconnaît d'un coup.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Avatar from './Avatar';
import { typography } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Person {
  nom?: string | null;
  image?: string | null;
}

interface Props {
  people: Person[];
  size?: number;
  max?: number;
  /** Chevauchement en px (par défaut ~36 % de la taille). */
  overlap?: number;
  /** Couleur du liseré autour de chaque avatar (par défaut la carte). */
  ringColor?: string;
}

export default function AvatarStack({ people, size = 30, max = 4, overlap, ringColor }: Props) {
  const { colors } = useTheme();
  const ov = overlap ?? Math.round(size * 0.36);
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const border = ringColor ?? colors.card;

  return (
    <View style={styles.row}>
      {shown.map((p, i) => (
        <View
          key={i}
          style={{
            marginLeft: i === 0 ? 0 : -ov,
            borderRadius: size,
            borderWidth: 2,
            borderColor: border,
          }}
        >
          <Avatar name={p.nom} image={p.image} size={size} />
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={[
            styles.extra,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: -ov,
              backgroundColor: colors.surface,
              borderColor: border,
            },
          ]}
        >
          <Text style={[styles.extraText, { color: colors.text.body, fontSize: size * 0.34 }]}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  extra: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  extraText: { fontWeight: typography.fontWeight.extrabold },
});
