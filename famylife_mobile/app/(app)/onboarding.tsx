// app/(app)/onboarding.tsx
// Première étape après inscription/connexion : créer une maison ou en
// rejoindre une via un code d'invitation.
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Home, Users } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { CandyButton, CandyCard, CandyInput, Segmented } from '../components/ui';
import { useMaison } from '../src/contexts/MaisonContext';
import { useAuth } from '../src/contexts/AuthContext';
import maisonService, { TypeLogement } from '../src/services/maisonService';
import { typography, spacing, borderRadius } from '../theme/designTokens';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';

const EMOJIS = ['🏠', '🏡', '🏘️', '🌈', '🧸', '🍬'];
const COULEURS = ['#FF4E9B', '#7B5CFF', '#3AC8FF', '#3FD98B', '#FFD23F', '#FF8A3D'];

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const { t } = useT();
  const { createMaison, joinMaison, refresh: refreshMaisons } = useMaison();
  const { logout, user } = useAuth();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [nom, setNom] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [couleur, setCouleur] = useState(COULEURS[0]);
  const [typeLogement, setTypeLogement] = useState<TypeLogement>('maison');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setError('');
    if (!nom.trim()) {
      setError(t('onboarding.nomObligatoire'));
      return;
    }
    setLoading(true);
    const result = await createMaison({ nom: nom.trim(), emoji, couleur });
    if (!result.success) {
      setLoading(false);
      setError(result.error || t('onboarding.creationImpossible'));
      return;
    }
    // Le type de logement (maison/appartement) n'est pas supporté par
    // `MaisonCreateInput` : on l'applique juste après la création via `update`.
    // Best-effort : une erreur ici NE DOIT PAS empêcher d'entrer dans l'app
    // (la maison est déjà créée) — sinon on resterait bloqué sur l'onboarding.
    if (result.maison) {
      try {
        await maisonService.update(result.maison.id, { type_logement: typeLogement });
        await refreshMaisons();
      } catch {
        // on continue quand même
      }
    }
    setLoading(false);
    router.replace('/(app)/(tabs)');
  };

  const handleJoin = async () => {
    setError('');
    if (!code.trim()) {
      setError(t('onboarding.codeObligatoire'));
      return;
    }
    setLoading(true);
    const result = await joinMaison(code.trim().toUpperCase());
    setLoading(false);
    if (!result.success) {
      setError(result.error || t('onboarding.rejoindreImpossible'));
      return;
    }
    router.replace('/(app)/(tabs)');
  };

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[styles.hello, { color: colors.text.body }]}>
          {t('onboarding.bienvenue')} {user?.nom?.split(' ')[0] || ''} ✨
        </Text>
        <Text style={[styles.title, { color: colors.text.dark }]}>{t('onboarding.titre')}</Text>

        <View style={[styles.tabs, { backgroundColor: colors.card }]}>
          <Pressable
            style={[styles.tabButton, mode === 'create' && { backgroundColor: colors.primary.main }]}
            onPress={() => setMode('create')}
          >
            <Home size={18} color={mode === 'create' ? colors.candy.white : colors.text.body} />
            <Text style={[styles.tabLabel, { color: mode === 'create' ? colors.candy.white : colors.text.body }]}>
              {t('onboarding.creerTab')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, mode === 'join' && { backgroundColor: colors.primary.main }]}
            onPress={() => setMode('join')}
          >
            <Users size={18} color={mode === 'join' ? colors.candy.white : colors.text.body} />
            <Text style={[styles.tabLabel, { color: mode === 'join' ? colors.candy.white : colors.text.body }]}>
              {t('onboarding.rejoindreTab')}
            </Text>
          </Pressable>
        </View>

        {mode === 'create' ? (
          <CandyCard style={styles.card}>
            <CandyInput
              label={t('onboarding.nomMaison')}
              placeholder={t('onboarding.nomMaisonPlaceholder')}
              value={nom}
              onChangeText={setNom}
            />
            <Text style={[styles.label, { color: colors.text.dark }]}>{t('onboarding.emoji')}</Text>
            <View style={styles.chipsRow}>
              {EMOJIS.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => setEmoji(e)}
                  style={[
                    styles.emojiChip,
                    { backgroundColor: colors.surface },
                    emoji === e && { borderColor: colors.primary.main },
                  ]}
                >
                  <Text style={styles.emojiChipText}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.label, { color: colors.text.dark }]}>{t('agenda.couleur')}</Text>
            <View style={styles.chipsRow}>
              {COULEURS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCouleur(c)}
                  style={[
                    styles.colorChip,
                    { backgroundColor: c },
                    couleur === c && { borderColor: colors.text.dark },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.label, { color: colors.text.dark }]}>{t('logement.type')}</Text>
            <View style={{ marginBottom: spacing.lg }}>
              <Segmented
                value={typeLogement}
                onChange={setTypeLogement}
                options={[
                  { value: 'maison', label: t('logement.maison') },
                  { value: 'appartement', label: t('logement.appartement') },
                ]}
              />
            </View>
            {error ? <Text style={[styles.error, { color: colors.candy.red }]}>{error}</Text> : null}
            <CandyButton label={t('onboarding.creerMaMaison')} onPress={handleCreate} loading={loading} variant="pink" />
          </CandyCard>
        ) : (
          <CandyCard style={styles.card}>
            <CandyInput
              label={t('maison.codeInvitation')}
              placeholder={t('onboarding.codePlaceholder')}
              autoCapitalize="characters"
              value={code}
              onChangeText={setCode}
            />
            {error ? <Text style={[styles.error, { color: colors.candy.red }]}>{error}</Text> : null}
            <CandyButton label={t('onboarding.rejoindreMaison')} onPress={handleJoin} loading={loading} variant="purple" />
          </CandyCard>
        )}

        <Pressable onPress={logout} style={styles.logoutLink}>
          <Text style={[styles.logoutText, { color: colors.text.muted }]}>{t('common.deconnexion')}</Text>
        </Pressable>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, paddingTop: spacing['4xl'], paddingBottom: spacing['4xl'] },
  hello: {
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.md,
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.black,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: borderRadius.pill,
    padding: 4,
    marginBottom: spacing.lg,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.pill,
  },
  tabLabel: { fontWeight: typography.fontWeight.bold },
  card: { marginBottom: spacing.xl },
  label: {
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.sm,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  emojiChip: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emojiChipText: { fontSize: 22 },
  colorChip: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.pill,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  error: {
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  logoutLink: { alignItems: 'center', marginTop: spacing.md },
  logoutText: { fontWeight: typography.fontWeight.bold },
});
