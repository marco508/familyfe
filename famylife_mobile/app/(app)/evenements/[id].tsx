// app/(app)/evenements/[id].tsx — Détail d'un événement (ANNEXE V3)
// Infos, RSVP (Oui/Non/Peut-être) + liste des réponses, sélecteur de
// récurrence, et export iCal (affiche/partage l'URL de `agenda.ics`).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Share } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Trash2, MapPin, CalendarClock, ExternalLink, Check, X as XIcon, HelpCircle } from 'lucide-react-native';
import ScreenBackground from '../../components/ScreenBackground';
import { useMaison } from '../../src/contexts/MaisonContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';
import evenementService, { Evenement, RecurrenceEvenement, ReponseRsvp } from '../../src/services/evenementService';
import { Avatar, Badge, CandyButton, CandyCard, Segmented } from '../../components/ui';
import { typography, spacing, borderRadius } from '../../theme/designTokens';

const RECURRENCES: { value: RecurrenceEvenement; labelKey: string }[] = [
  { value: 'aucune', labelKey: 'activite.aucune' },
  { value: 'hebdo', labelKey: 'activite.hebdo' },
  { value: 'mensuel', labelKey: 'activite.mensuel' },
];

export default function EvenementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const evenementId = Number(id);
  const { isChef } = useMaison();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t, lang } = useT();

  const [evenement, setEvenement] = useState<Evenement | null>(null);
  const [loading, setLoading] = useState(true);
  const [reponding, setReponding] = useState(false);
  const [savingRecurrence, setSavingRecurrence] = useState(false);

  const load = useCallback(async () => {
    if (!evenementId) return;
    setLoading(true);
    const res = await evenementService.get(evenementId);
    setEvenement(res.data ?? null);
    setLoading(false);
  }, [evenementId]);

  useEffect(() => {
    load();
  }, [load]);

  const peutGerer = !!evenement && !!user && (isChef || evenement.createur_id === user.id);

  const handleRepondre = async (reponse: ReponseRsvp) => {
    if (!evenement) return;
    setReponding(true);
    const res = await evenementService.repondre(evenement.id, reponse);
    setReponding(false);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    if (res.data) setEvenement(res.data);
  };

  const handleRecurrenceChange = async (recurrence: RecurrenceEvenement) => {
    if (!evenement || !peutGerer) return;
    setSavingRecurrence(true);
    const res = await evenementService.update(evenement.id, { recurrence });
    setSavingRecurrence(false);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    if (res.data) setEvenement(res.data);
  };

  const handleDelete = () => {
    if (!evenement) return;
    Alert.alert(t('evenement.supprimerConfirmTitre'), t('common.actionIrreversible'), [
      { text: t('common.annuler'), style: 'cancel' },
      {
        text: t('common.supprimer'),
        style: 'destructive',
        onPress: async () => {
          const res = await evenementService.remove(evenement.id);
          if (res.error) {
            Alert.alert(t('common.erreur'), res.error);
            return;
          }
          router.back();
        },
      },
    ]);
  };

  const handleExportIcal = async () => {
    if (!evenement) return;
    const url = evenementService.icalUrl(evenement.maison_id);
    try {
      await Share.share({ message: url, url });
    } catch {
      Alert.alert(t('evenement.exporterIcal'), url);
    }
  };

  const rsvpButtons: { value: ReponseRsvp; label: string; icon: any; variant: 'green' | 'danger' | 'yellow' }[] = [
    { value: 'oui', label: t('evenement.oui'), icon: Check, variant: 'green' },
    { value: 'non', label: t('evenement.non'), icon: XIcon, variant: 'danger' },
    { value: 'peut_etre', label: t('evenement.peutEtre'), icon: HelpCircle, variant: 'yellow' },
  ];

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>{t('evenement.detailTitre')}</Text>
        {peutGerer ? (
          <Pressable onPress={handleDelete} hitSlop={10}>
            <Trash2 size={20} color={colors.candy.red} />
          </Pressable>
        ) : (
          <View style={{ width: 20 }} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing['2xl'] }} color={colors.primary.main} />
      ) : !evenement ? (
        <Text style={[styles.notFound, { color: colors.text.body }]}>{t('evenement.introuvable')}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <CandyCard style={{ marginBottom: spacing.lg }}>
            <Text style={[styles.titre, { color: colors.text.dark }]}>{evenement.titre}</Text>
            {evenement.description ? <Text style={[styles.description, { color: colors.text.body }]}>{evenement.description}</Text> : null}

            <View style={styles.metaRow}>
              <CalendarClock size={16} color={colors.text.muted} />
              <Text style={[styles.metaText, { color: colors.text.body }]}>
                {new Date(evenement.date_debut).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                  hour: evenement.toute_la_journee ? undefined : '2-digit',
                  minute: evenement.toute_la_journee ? undefined : '2-digit',
                })}
              </Text>
            </View>
            {evenement.lieu ? (
              <View style={styles.metaRow}>
                <MapPin size={16} color={colors.text.muted} />
                <Text style={[styles.metaText, { color: colors.text.body }]}>{evenement.lieu}</Text>
              </View>
            ) : null}
            {evenement.createur ? (
              <View style={styles.metaRow}>
                <Avatar name={evenement.createur.nom} image={evenement.createur.image} size={20} />
                <Text style={[styles.metaText, { color: colors.text.muted }]}>
                  {t('evenement.creePar')} {evenement.createur.nom}
                </Text>
              </View>
            ) : null}
          </CandyCard>

          {/* RSVP */}
          <CandyCard style={{ marginBottom: spacing.lg }}>
            <Text style={[styles.sectionTitle, { color: colors.text.dark }]}>{t('evenement.rsvp')}</Text>
            <View style={styles.rsvpRow}>
              {rsvpButtons.map((b) => {
                const Icon = b.icon;
                const active = evenement.ma_reponse === b.value;
                return (
                  <Pressable
                    key={b.value}
                    onPress={() => handleRepondre(b.value)}
                    disabled={reponding}
                    style={[
                      styles.rsvpButton,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      active && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle },
                    ]}
                  >
                    <Icon size={18} color={active ? colors.primary.main : colors.text.muted} />
                    <Text style={[styles.rsvpLabel, { color: active ? colors.primary.main : colors.text.body }]}>{b.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {evenement.reponses.length > 0 ? (
              <View style={styles.reponsesWrap}>
                <Text style={[styles.reponsesTitle, { color: colors.text.muted }]}>{t('evenement.reponses')}</Text>
                {evenement.reponses.map((r) => (
                  <View key={r.utilisateur_id} style={styles.reponseRow}>
                    <Avatar name={r.nom} image={r.image} size={24} />
                    <Text style={[styles.reponseNom, { color: colors.text.dark }]} numberOfLines={1}>{r.nom}</Text>
                    <Badge
                      label={r.reponse === 'oui' ? t('evenement.oui') : r.reponse === 'non' ? t('evenement.non') : t('evenement.peutEtre')}
                      variant={r.reponse === 'oui' ? 'green' : r.reponse === 'non' ? 'neutral' : 'yellow'}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </CandyCard>

          {/* Récurrence */}
          <CandyCard style={{ marginBottom: spacing.lg }}>
            <Text style={[styles.sectionTitle, { color: colors.text.dark }]}>{t('activite.recurrence')}</Text>
            <Segmented
              value={evenement.recurrence}
              onChange={handleRecurrenceChange}
              options={RECURRENCES.map((r) => ({ value: r.value, label: t(r.labelKey) }))}
            />
            {savingRecurrence ? <ActivityIndicator style={{ marginTop: spacing.sm }} color={colors.primary.main} /> : null}
            {!peutGerer ? (
              <Text style={[styles.helperText, { color: colors.text.muted }]}>{t('evenement.reserveChefCreateur')}</Text>
            ) : null}
          </CandyCard>

          {/* Export iCal */}
          <CandyButton
            label={t('evenement.exporterIcal')}
            onPress={handleExportIcal}
            variant="blue"
            icon={<ExternalLink size={18} color={colors.candy.white} />}
          />
        </ScrollView>
      )}
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
  notFound: { textAlign: 'center', marginTop: spacing['2xl'] },
  titre: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.black },
  description: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, marginTop: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  metaText: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },
  sectionTitle: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold, marginBottom: spacing.md },
  rsvpRow: { flexDirection: 'row', gap: spacing.sm },
  rsvpButton: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    paddingVertical: spacing.md,
  },
  rsvpLabel: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  reponsesWrap: { marginTop: spacing.lg },
  reponsesTitle: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold, marginBottom: spacing.sm },
  reponseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  reponseNom: { flex: 1, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold },
  helperText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: spacing.sm },
});
