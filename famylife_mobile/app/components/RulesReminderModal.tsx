// components/RulesReminderModal.tsx
// Rappel des règles de la maison à la connexion (ANNEXE V4) : modale non
// bloquante affichée tant que `doit_lire` est vrai pour la maison active.
// Une seule vérification par maison active tant que ce composant reste monté
// (il est monté une fois au niveau de `(app)/_layout.tsx`, donc "une fois par
// session" — remise à zéro seulement si l'utilisateur change de maison).
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView } from 'react-native';
import { useMaison } from '../src/contexts/MaisonContext';
import { useT } from '../src/i18n';
import { useTheme } from '../src/contexts/ThemeContext';
import regleService, { Regle } from '../src/services/regleService';
import { CandyButton, CandyCard } from './ui';
import { spacing, typography, borderRadius } from '../theme/designTokens';

export default function RulesReminderModal() {
  const { maisonActive } = useMaison();
  const { t } = useT();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [regles, setRegles] = useState<Regle[]>([]);
  const [ack, setAck] = useState(false);
  const checkedMaisonId = useRef<number | null>(null);

  useEffect(() => {
    if (!maisonActive) return;
    if (checkedMaisonId.current === maisonActive.id) return;
    checkedMaisonId.current = maisonActive.id;
    (async () => {
      const res = await regleService.aLire(maisonActive.id);
      if (res.data?.doit_lire) {
        setRegles(res.data.regles || []);
        setVisible(true);
      }
    })();
  }, [maisonActive]);

  const handleAck = async () => {
    if (!maisonActive) return;
    setAck(true);
    await regleService.lues(maisonActive.id);
    setAck(false);
    setVisible(false);
  };

  if (!maisonActive) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={() => setVisible(false)}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.text.dark }]}>{t('regles.rappelTitre')}</Text>
          <Text style={[styles.message, { color: colors.text.body }]}>{t('regles.rappelMessage')}</Text>
          <ScrollView style={styles.list}>
            {regles.length === 0 ? (
              <Text style={[styles.message, { color: colors.text.body }]}>{t('regles.aucuneRegle')}</Text>
            ) : (
              regles.map((r) => (
                <CandyCard key={r.id} style={{ marginBottom: spacing.sm }}>
                  <Text style={[styles.regleTitre, { color: colors.text.dark }]}>{r.titre}</Text>
                  <Text style={[styles.regleContenu, { color: colors.text.body }]}>{r.contenu}</Text>
                </CandyCard>
              ))
            )}
          </ScrollView>
          <CandyButton label={t('regles.jaiLu')} onPress={handleAck} loading={ack} variant="pink" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: { width: '100%', maxHeight: '80%', borderRadius: borderRadius.xl, padding: spacing.xl },
  title: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.black, textAlign: 'center' },
  message: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  list: { marginBottom: spacing.lg },
  regleTitre: { fontWeight: typography.fontWeight.extrabold, fontSize: typography.fontSize.md },
  regleContenu: { fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.sm, marginTop: 2 },
});
