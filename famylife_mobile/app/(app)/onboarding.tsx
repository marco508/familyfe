// app/(app)/onboarding.tsx
// Première étape après inscription/connexion : créer une maison ou en
// rejoindre une via un code d'invitation.
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Home, Users, Plus, X } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { CandyButton, CandyCard, CandyInput, SectionTitle, Segmented } from '../components/ui';
import { useMaison } from '../src/contexts/MaisonContext';
import { useAuth } from '../src/contexts/AuthContext';
import maisonService, { MaisonUpdateInput, TypeLogement } from '../src/services/maisonService';
import pieceService, { TypePiece } from '../src/services/pieceService';
import { typography, spacing, borderRadius } from '../theme/designTokens';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';

const EMOJIS = ['🏠', '🏡', '🏘️', '🌈', '🧸', '🍬'];
const COULEURS = ['#FF4E9B', '#7B5CFF', '#3AC8FF', '#3FD98B', '#FFD23F', '#FF8A3D'];

// Pièces courantes pré-proposées à la création (icône + type backend).
const PIECES_COURANTES: { type: TypePiece; emoji: string }[] = [
  { type: 'chambre', emoji: '🛏️' },
  { type: 'salon', emoji: '🛋️' },
  { type: 'cuisine', emoji: '🍳' },
  { type: 'salle_de_bain', emoji: '🛁' },
  { type: 'bureau', emoji: '💼' },
  { type: 'garage', emoji: '🚗' },
];

function pieceTypeEmoji(type: TypePiece): string {
  return PIECES_COURANTES.find((p) => p.type === type)?.emoji ?? '🚪';
}

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
  // ANNEXE V4 — infos de logement saisissables dès la création (facultatives).
  const [adresse, setAdresse] = useState('');
  const [complement, setComplement] = useState('');
  const [ville, setVille] = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [pays, setPays] = useState('');
  const [surface, setSurface] = useState('');
  const [etage, setEtage] = useState('');
  const [numeroAppartement, setNumeroAppartement] = useState('');
  const [digicode, setDigicode] = useState('');
  const [interphone, setInterphone] = useState('');
  const [acces, setAcces] = useState('');
  // ANNEXE V4 — Pièces saisissables dès la création (optionnel, best-effort).
  const [piecesSelectionnees, setPiecesSelectionnees] = useState<{ nom: string; type: TypePiece }[]>([]);
  const [pieceCustomNom, setPieceCustomNom] = useState('');
  const [pieceCustomType, setPieceCustomType] = useState<TypePiece>('autre');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const pieceTypeLabel = (type: TypePiece) => t(`pieces.${type === 'salle_de_bain' ? 'salleDeBain' : type}`);

  const isPieceCouranteSelected = (type: TypePiece) =>
    piecesSelectionnees.some((p) => p.type === type && p.nom === pieceTypeLabel(type));

  const togglePieceCourante = (type: TypePiece) => {
    if (isPieceCouranteSelected(type)) {
      setPiecesSelectionnees((prev) => prev.filter((p) => !(p.type === type && p.nom === pieceTypeLabel(type))));
    } else {
      setPiecesSelectionnees((prev) => [...prev, { nom: pieceTypeLabel(type), type }]);
    }
  };

  const addPiecePersonnalisee = () => {
    if (!pieceCustomNom.trim()) return;
    setPiecesSelectionnees((prev) => [...prev, { nom: pieceCustomNom.trim(), type: pieceCustomType }]);
    setPieceCustomNom('');
    setPieceCustomType('autre');
  };

  const removePieceSelectionnee = (idx: number) => {
    setPiecesSelectionnees((prev) => prev.filter((_, i) => i !== idx));
  };

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
    // Le type de logement + les infos d'adresse ne sont pas supportés par
    // `MaisonCreateInput` : on les applique juste après la création via `update`.
    // Best-effort : une erreur ici NE DOIT PAS empêcher d'entrer dans l'app
    // (le logement est déjà créé) — sinon on resterait bloqué sur l'onboarding.
    if (result.maison) {
      try {
        const updateData: MaisonUpdateInput = { type_logement: typeLogement };
        if (adresse.trim()) updateData.adresse = adresse.trim();
        if (complement.trim()) updateData.complement = complement.trim();
        if (codePostal.trim()) updateData.code_postal = codePostal.trim();
        if (ville.trim()) updateData.ville = ville.trim();
        if (pays.trim()) updateData.pays = pays.trim();
        if (surface.trim()) updateData.surface = Number(surface.trim()) || null;
        if (typeLogement === 'appartement') {
          if (etage.trim()) updateData.etage = etage.trim();
          if (numeroAppartement.trim()) updateData.numero_appartement = numeroAppartement.trim();
          if (digicode.trim()) updateData.digicode = digicode.trim();
          if (interphone.trim()) updateData.interphone = interphone.trim();
          if (acces.trim()) updateData.acces = acces.trim();
        }
        await maisonService.update(result.maison.id, updateData);
        await refreshMaisons();
      } catch {
        // on continue quand même
      }
      // ANNEXE V4 — création best-effort des pièces choisies : une erreur ici
      // ne doit jamais bloquer l'entrée dans l'app (le logement existe déjà).
      if (piecesSelectionnees.length > 0) {
        for (const piece of piecesSelectionnees) {
          try {
            await pieceService.create(result.maison.id, { nom: piece.nom, type: piece.type });
          } catch {
            // on continue avec les pièces suivantes
          }
        }
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

            {/* ANNEXE V4 — infos de logement dès la création (optionnel, par type) */}
            <SectionTitle title={t('onboarding.adresseSection')} style={{ marginBottom: spacing.sm }} />
            <CandyInput label={t('logement.adresse')} value={adresse} onChangeText={setAdresse} />
            <CandyInput label={t('logement.complement')} value={complement} onChangeText={setComplement} />
            <CandyInput label={t('logement.codePostal')} value={codePostal} onChangeText={setCodePostal} keyboardType="number-pad" />
            <CandyInput label={t('logement.ville')} value={ville} onChangeText={setVille} />
            <CandyInput label={t('logement.pays')} value={pays} onChangeText={setPays} />
            <CandyInput label={t('logement.surface')} value={surface} onChangeText={setSurface} keyboardType="numeric" />
            {typeLogement === 'appartement' ? (
              <>
                <CandyInput label={t('logement.etage')} value={etage} onChangeText={setEtage} />
                <CandyInput label={t('logement.numeroAppartement')} value={numeroAppartement} onChangeText={setNumeroAppartement} />
                <CandyInput label={t('logement.digicode')} value={digicode} onChangeText={setDigicode} />
                <CandyInput label={t('logement.interphone')} value={interphone} onChangeText={setInterphone} />
                <CandyInput label={t('logement.acces')} value={acces} onChangeText={setAcces} multiline />
              </>
            ) : null}

            {/* ANNEXE V4 — Pièces dès la création (optionnel, visuel, multi-sélection) */}
            <SectionTitle title={t('onboarding.piecesSection')} emoji="🚪" style={{ marginBottom: spacing.xs }} />
            <Text style={[styles.helperText, { color: colors.text.body }]}>{t('onboarding.piecesAide')}</Text>
            <View style={styles.chipsRow}>
              {PIECES_COURANTES.map((p) => {
                const active = isPieceCouranteSelected(p.type);
                return (
                  <Pressable
                    key={p.type}
                    onPress={() => togglePieceCourante(p.type)}
                    style={[
                      styles.pieceChip,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      active && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle },
                    ]}
                  >
                    <Text style={styles.pieceChipEmoji}>{p.emoji}</Text>
                    <Text style={[styles.pieceChipText, { color: active ? colors.primary.main : colors.text.body }]}>
                      {pieceTypeLabel(p.type)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.customPieceRow}>
              <View style={{ flex: 1 }}>
                <CandyInput
                  placeholder={t('onboarding.piecePersonnaliseePlaceholder')}
                  value={pieceCustomNom}
                  onChangeText={setPieceCustomNom}
                  style={{ marginBottom: 0 }}
                />
              </View>
              <Pressable
                onPress={addPiecePersonnalisee}
                disabled={!pieceCustomNom.trim()}
                style={[
                  styles.customPieceAddButton,
                  { backgroundColor: pieceCustomNom.trim() ? colors.primary.main : colors.surface },
                ]}
              >
                <Plus size={18} color={pieceCustomNom.trim() ? colors.candy.white : colors.text.muted} />
              </Pressable>
            </View>
            <View style={[styles.chipsRow, { marginBottom: spacing.md }]}>
              {(['chambre', 'salon', 'cuisine', 'salle_de_bain', 'bureau', 'garage', 'autre'] as TypePiece[]).map((tp) => {
                const active = pieceCustomType === tp;
                return (
                  <Pressable
                    key={tp}
                    onPress={() => setPieceCustomType(tp)}
                    style={[
                      styles.pieceChip,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      active && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle },
                    ]}
                  >
                    <Text style={styles.pieceChipEmoji}>{pieceTypeEmoji(tp)}</Text>
                    <Text style={[styles.pieceChipText, { color: active ? colors.primary.main : colors.text.body }]}>
                      {pieceTypeLabel(tp)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {piecesSelectionnees.length > 0 ? (
              <View style={styles.piecesChoisiesWrap}>
                <Text style={[styles.label, { color: colors.text.dark }]}>
                  {t('onboarding.piecesChoisies')} ({piecesSelectionnees.length})
                </Text>
                <View style={styles.chipsRow}>
                  {piecesSelectionnees.map((p, idx) => (
                    <Pressable
                      key={`${p.nom}-${idx}`}
                      onPress={() => removePieceSelectionnee(idx)}
                      style={[styles.pieceChosenChip, { backgroundColor: colors.primary.subtle, borderColor: colors.primary.main }]}
                    >
                      <Text style={styles.pieceChipEmoji}>{pieceTypeEmoji(p.type)}</Text>
                      <Text style={[styles.pieceChosenChipText, { color: colors.primary.main }]} numberOfLines={1}>
                        {p.nom}
                      </Text>
                      <X size={12} color={colors.primary.main} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

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
  helperText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginBottom: spacing.md },
  pieceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.pill,
    borderWidth: 1.5,
  },
  pieceChipEmoji: { fontSize: 16 },
  pieceChipText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  customPieceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  customPieceAddButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  piecesChoisiesWrap: { marginTop: spacing.sm, marginBottom: spacing.md },
  pieceChosenChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.pill,
    borderWidth: 1.5,
    maxWidth: 180,
  },
  pieceChosenChipText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold, flexShrink: 1 },
});
