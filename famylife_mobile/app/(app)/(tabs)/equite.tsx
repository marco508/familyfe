// app/(app)/(tabs)/equite.tsx
// ANNEXE V7 — Hub "Équité" : le lieu UNIQUE du jeu de points.
// Classement, Défis et Boutique étaient trois entrées séparées du menu Plus
// alors qu'ils forment une seule boucle (je fais des tâches → je gagne des
// points → je monte au classement / je relève des défis → je dépense en
// boutique). Ils deviennent des segments d'un seul écran.
//
// L'implémentation de chaque segment vit dans `components/sections/*Section`
// (corps extrait des anciens écrans, sans en-tête ni fond : ils sont fournis
// une seule fois ici, pour ne pas dupliquer les en-têtes).
// `(app)/equite.tsx`, `(app)/classement.tsx`, `(app)/defis.tsx` et
// `(app)/boutique.tsx` redirigent désormais vers cet onglet.
//
// ANNEXE V8 — découverte progressive : Classement/Défis/Boutique forment le
// module optionnel "jeu". L'ÉQUITÉ, elle, est le cœur de l'app et n'est jamais
// désactivable : quand "jeu" est éteint, cet onglet se réduit à son seul
// segment Équité — et la barre d'onglets disparaît, car une barre à un seul
// onglet n'offre aucun choix : c'est du bruit.
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useT } from '../../src/i18n';
import { useNotifications } from '../../src/contexts/NotificationContext';
import { useMaison } from '../../src/contexts/MaisonContext';
import { NotificationBell, SectionTitle, Segmented } from '../../components/ui';
import EquiteSection from '../../components/sections/EquiteSection';
import ClassementSection from '../../components/sections/ClassementSection';
import DefisSection from '../../components/sections/DefisSection';
import BoutiqueSection from '../../components/sections/BoutiqueSection';
import { spacing } from '../../theme/designTokens';

type Segment = 'equite' | 'classement' | 'defis' | 'boutique';

// La barre d'onglets flotte au-dessus du contenu : marge basse réservée.
const TAB_BAR_INSET = 140;

export default function EquiteHubScreen() {
  const { t } = useT();
  const { unreadCount, refresh: refreshNotifCount } = useNotifications();
  const { isModuleActif } = useMaison();
  const [segment, setSegment] = useState<Segment>('equite');

  const jeuActif = isModuleActif('jeu');

  const options: { value: Segment; label: string }[] = [
    { value: 'equite', label: t('equite.titre') },
    ...(jeuActif
      ? ([
          { value: 'classement', label: t('classement.titre') },
          { value: 'defis', label: t('defis.titre') },
          { value: 'boutique', label: t('boutique.titre') },
        ] as { value: Segment; label: string }[])
      : []),
  ];

  // Le module peut s'éteindre alors qu'on est justement sur Boutique (le chef
  // le coupe depuis un autre appareil, ou on revient sur l'onglet après l'avoir
  // désactivé) : on retombe alors sur Équité, sans quoi on afficherait un
  // segment devenu inaccessible depuis la barre. Dériver plutôt que corriger
  // l'état dans un effet évite une frame d'affichage incohérente.
  const segmentActif: Segment = jeuActif ? segment : 'equite';

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <SectionTitle
          title={t('equite.titre')}
          emoji="⚖️"
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
        {/* Une barre à un seul onglet ne propose aucun choix : on la masque. */}
        {options.length > 1 ? (
          <Segmented value={segmentActif} onChange={setSegment} options={options} />
        ) : null}
      </View>

      <View style={styles.flex}>
        {segmentActif === 'equite' ? (
          <EquiteSection bottomInset={TAB_BAR_INSET} />
        ) : segmentActif === 'classement' ? (
          <ClassementSection bottomInset={TAB_BAR_INSET} />
        ) : segmentActif === 'defis' ? (
          <DefisSection bottomInset={TAB_BAR_INSET} />
        ) : (
          <BoutiqueSection bottomInset={TAB_BAR_INSET} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing['2xl'] },
});
