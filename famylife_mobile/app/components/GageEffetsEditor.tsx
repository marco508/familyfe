// components/GageEffetsEditor.tsx
// Constructeur de gage paramétrable : deux sections (à l'échec / à la réussite),
// chacune une liste d'effets typés (points, tâche, amende, note) que le système
// applique automatiquement. Contrôlé par le parent via props.
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { GageEffet, GageEffetType } from '../src/services/tacheService';
import { CandyButton, CandyInput, Segmented } from './ui';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';
import { typography, spacing, borderRadius } from '../theme/designTokens';

interface Props {
  effetsEchec: GageEffet[];
  effetsReussite: GageEffet[];
  onChangeEchec: (e: GageEffet[]) => void;
  onChangeReussite: (e: GageEffet[]) => void;
}

export default function GageEffetsEditor({ effetsEchec, effetsReussite, onChangeEchec, onChangeReussite }: Props) {
  const { colors } = useTheme();
  const { t } = useT();

  const [cible, setCible] = useState<'echec' | 'reussite' | null>(null);
  const [type, setType] = useState<GageEffetType>('points');
  const [valeur, setValeur] = useState('5');
  const [titre, setTitre] = useState('');
  const [jours, setJours] = useState('7');
  const [montant, setMontant] = useState('5');
  const [texte, setTexte] = useState('');

  const label = (e: GageEffet) =>
    e.type === 'points'
      ? `${(e.valeur ?? 0) > 0 ? '+' : ''}${e.valeur} pts`
      : e.type === 'tache'
      ? `${t('gage.typeTache')} : ${e.titre}`
      : e.type === 'amende'
      ? `${t('gage.typeAmende')} : ${e.montant} €`
      : `${t('gage.typeNote')} : ${e.texte}`;

  const add = () => {
    let effet: GageEffet | null = null;
    if (type === 'points') {
      const v = parseInt(valeur, 10);
      if (!v) return;
      effet = { type: 'points', valeur: v };
    } else if (type === 'tache') {
      if (!titre.trim()) return;
      effet = { type: 'tache', titre: titre.trim(), jours: parseInt(jours, 10) || 0 };
    } else if (type === 'amende') {
      const m = parseFloat(montant.replace(',', '.'));
      if (!m || m <= 0) return;
      effet = { type: 'amende', montant: Math.round(m * 100) / 100 };
    } else {
      if (!texte.trim()) return;
      effet = { type: 'note', texte: texte.trim() };
    }
    const list = cible === 'echec' ? effetsEchec : effetsReussite;
    const setter = cible === 'echec' ? onChangeEchec : onChangeReussite;
    setter([...list, effet]);
    setCible(null);
    setTitre('');
    setTexte('');
    setValeur('5');
    setJours('7');
    setMontant('5');
  };

  const remove = (c: 'echec' | 'reussite', idx: number) => {
    const list = c === 'echec' ? effetsEchec : effetsReussite;
    const setter = c === 'echec' ? onChangeEchec : onChangeReussite;
    setter(list.filter((_, i) => i !== idx));
  };

  const renderSection = (c: 'echec' | 'reussite', effets: GageEffet[]) => (
    <View style={{ marginTop: spacing.md }}>
      <Text style={[styles.label, { color: colors.text.dark }]}>
        {c === 'echec' ? t('gage.siEchouee') : t('gage.siReussie')}
      </Text>
      <View style={styles.chipsRow}>
        {effets.map((e, i) => (
          <Pressable
            key={i}
            onPress={() => remove(c, i)}
            style={[styles.chip, { backgroundColor: colors.primary.subtle, borderColor: colors.primary.main }]}
          >
            <Text style={[styles.chipText, { color: colors.primary.main }]}>{label(e)}  ✕</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setCible(c)} style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.chipText, { color: colors.text.body }]}>{t('gage.ajouterEffet')}</Text>
        </Pressable>
      </View>
      {cible === c ? (
        <View style={[styles.draftBox, { backgroundColor: colors.surface }]}>
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: 'points', label: t('gage.typePoints') },
              { value: 'tache', label: t('gage.typeTache') },
              { value: 'amende', label: t('gage.typeAmende') },
              { value: 'note', label: t('gage.typeNote') },
            ]}
          />
          {type === 'points' ? (
            <CandyInput label={t('gage.pointsLabel')} value={valeur} onChangeText={setValeur} keyboardType="numbers-and-punctuation" style={{ marginTop: spacing.sm }} />
          ) : null}
          {type === 'tache' ? (
            <>
              <CandyInput label={t('gage.tacheTitre')} placeholder={t('gage.tacheTitrePlaceholder')} value={titre} onChangeText={setTitre} style={{ marginTop: spacing.sm }} />
              <CandyInput label={t('gage.tacheJours')} value={jours} onChangeText={setJours} keyboardType="number-pad" />
            </>
          ) : null}
          {type === 'amende' ? (
            <CandyInput label={t('gage.amendeMontant')} value={montant} onChangeText={setMontant} keyboardType="decimal-pad" style={{ marginTop: spacing.sm }} />
          ) : null}
          {type === 'note' ? (
            <CandyInput label={t('gage.noteMessage')} placeholder={t('gage.notePlaceholder')} value={texte} onChangeText={setTexte} style={{ marginTop: spacing.sm }} />
          ) : null}
          <View style={styles.row}>
            <CandyButton label={t('common.ajouter')} onPress={add} variant="pink" style={{ flex: 1 }} />
            <CandyButton label={t('common.annuler')} onPress={() => setCible(null)} variant="ghost" style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <View>
      {renderSection('echec', effetsEchec)}
      {renderSection('reussite', effetsReussite)}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.pill, borderWidth: 1.5 },
  chipText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  draftBox: { borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
