// components/sections/CoursesSection.tsx
// ANNEXE V7 — Corps de l'ancien écran `(app)/courses.tsx`, extrait pour être
// rendu comme segment de "Courses & repas". Ne rend ni fond ni en-tête.
// Liste de courses (ANNEXE V3) : ajout rapide, cochage, purge des achetés.
//
// ANNEXE V12 — « Commander ». Les drives français (Carrefour, Leclerc,
// Chronodrive, Auchan) n'ouvrent AUCUNE API de panier aux apps tierces : on ne
// peut pas pré-remplir leur panier. La voie réaliste et universelle est donc le
// PARTAGE natif : on met la liste en forme, on ouvre la feuille de partage du
// téléphone (qui offre aussi « Copier »), et l'utilisateur la colle dans l'app
// de son drive. Des raccourcis ouvrent directement le drive choisi.
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Share,
  Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Trash2, Plus, Sparkles, ShoppingCart, Share2, Store } from 'lucide-react-native';
import { useMaison } from '../../src/contexts/MaisonContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';
import coursesService, { CourseItem } from '../../src/services/coursesService';
import { BottomSheet, CandyButton, CandyCard, CandyInput, Checkbox, EmptyState } from '../ui';
import { typography, spacing, borderRadius } from '../../theme/designTokens';

interface Props {
  bottomInset?: number;
}

// Drives français les plus courants. On ouvre leur site/app en https :
// l'OS route vers l'app installée si elle réclame le domaine, sinon le
// navigateur. Aucun ne permet le pré-remplissage du panier (d'où le partage).
const DRIVES: { key: string; label: string; url: string }[] = [
  { key: 'carrefour', label: 'Carrefour', url: 'https://www.carrefour.fr/drive' },
  { key: 'leclerc', label: 'Leclerc Drive', url: 'https://www.leclercdrive.fr' },
  { key: 'chronodrive', label: 'Chronodrive', url: 'https://www.chronodrive.com' },
  { key: 'auchan', label: 'Auchan', url: 'https://www.auchan.fr/drive-et-livraison' },
];

export default function CoursesSection({ bottomInset = spacing['4xl'] }: Props) {
  const { maisonActive } = useMaison();
  const { colors } = useTheme();
  const { t } = useT();
  const [items, setItems] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [nom, setNom] = useState('');
  const [quantite, setQuantite] = useState('');
  const [categorie, setCategorie] = useState('');
  const [adding, setAdding] = useState(false);

  const [commanderVisible, setCommanderVisible] = useState(false);

  const load = useCallback(async () => {
    if (!maisonActive) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await coursesService.list(maisonActive.id);
      setItems(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [maisonActive]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleAdd = async () => {
    if (!maisonActive || !nom.trim()) return;
    setAdding(true);
    const res = await coursesService.create(maisonActive.id, {
      nom: nom.trim(),
      quantite: quantite.trim() || undefined,
      categorie: categorie.trim() || undefined,
    });
    setAdding(false);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    setNom('');
    setQuantite('');
    setCategorie('');
    load();
  };

  const toggleAchete = async (item: CourseItem) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, achete: !i.achete } : i)));
    const res = await coursesService.update(item.id, { achete: !item.achete });
    if (res.data) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? res.data! : i)));
    }
  };

  const handleDelete = (item: CourseItem) => {
    Alert.alert(t('common.supprimer') + ' ?', item.nom, [
      { text: t('common.annuler'), style: 'cancel' },
      {
        text: t('common.supprimer'),
        style: 'destructive',
        onPress: async () => {
          setItems((prev) => prev.filter((i) => i.id !== item.id));
          await coursesService.remove(item.id);
        },
      },
    ]);
  };

  const handleViderAchetes = () => {
    if (!maisonActive) return;
    Alert.alert(t('courses.viderAchetes') + ' ?', '', [
      { text: t('common.annuler'), style: 'cancel' },
      {
        text: t('courses.viderAchetes'),
        style: 'destructive',
        onPress: async () => {
          await coursesService.viderAchetes(maisonActive.id);
          load();
        },
      },
    ]);
  };

  const nonAchetes = items.filter((i) => !i.achete);
  const achetes = items.filter((i) => i.achete);

  // Liste mise en forme, prête à coller dans n'importe quelle app.
  const formatListe = (): string => {
    const lignes = nonAchetes.map((i) => {
      const q = i.quantite ? `${i.quantite} ` : '';
      const cat = i.categorie ? ` (${i.categorie})` : '';
      return `• ${q}${i.nom}${cat}`;
    });
    const entete = `${t('courses.titre')}${maisonActive?.nom ? ` — ${maisonActive.nom}` : ''}`;
    return `${entete}\n\n${lignes.join('\n')}`;
  };

  const handleShare = async () => {
    if (nonAchetes.length === 0) return;
    try {
      await Share.share({ message: formatListe() });
    } catch {
      // partage annulé / indisponible : rien à faire.
    }
  };

  const openDrive = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('common.erreur'), url);
    }
  };

  const renderItem = (item: CourseItem) => (
    <CandyCard key={item.id} style={styles.itemCard}>
      <View style={styles.itemRow}>
        <Checkbox checked={item.achete} onToggle={() => toggleAchete(item)} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.itemNom, { color: colors.text.dark }, item.achete && styles.itemNomDone]} numberOfLines={2}>
            {item.nom}
          </Text>
          {item.quantite || item.categorie ? (
            <Text style={[styles.itemMeta, { color: colors.text.body }]} numberOfLines={1}>
              {[item.quantite, item.categorie].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={() => handleDelete(item)} hitSlop={8}>
          <Trash2 size={18} color={colors.candy.red} />
        </Pressable>
      </View>
    </CandyCard>
  );

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
      >
        <CandyCard style={{ marginBottom: spacing.lg }}>
          <Text style={[styles.label, { color: colors.text.dark }]}>{t('courses.ajoutRapide')}</Text>
          <CandyInput placeholder={t('courses.nom')} value={nom} onChangeText={setNom} />
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <CandyInput placeholder={t('courses.quantite')} value={quantite} onChangeText={setQuantite} />
            </View>
            <View style={{ flex: 1 }}>
              <CandyInput placeholder={t('courses.categorie')} value={categorie} onChangeText={setCategorie} />
            </View>
          </View>
          <CandyButton
            label={t('common.ajouter')}
            onPress={handleAdd}
            loading={adding}
            disabled={!nom.trim()}
            variant="pink"
            icon={<Plus size={18} color={colors.candy.white} />}
          />
        </CandyCard>

        {/* Bouton « Commander » : n'apparaît que s'il reste des articles à
            acheter — sur une liste vide ou tout coché, il n'aurait aucun sens. */}
        {nonAchetes.length > 0 ? (
          <View style={{ marginBottom: spacing.lg }}>
            <CandyButton
              label={`${t('courses.commander')} (${nonAchetes.length})`}
              onPress={() => setCommanderVisible(true)}
              variant="green"
              icon={<ShoppingCart size={18} color={colors.candy.white} />}
            />
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
        ) : items.length === 0 ? (
          <EmptyState emoji="🛒" title={t('courses.vide')} />
        ) : (
          <>
            {nonAchetes.map(renderItem)}
            {achetes.length > 0 ? (
              <>
                <View style={styles.doneHeaderRow}>
                  <Sparkles size={14} color={colors.text.muted} />
                  <Text style={[styles.doneHeader, { color: colors.text.muted }]}>
                    {achetes.length} {achetes.length > 1 ? t('courses.achetes') : t('courses.achete')}
                  </Text>
                  <Pressable onPress={handleViderAchetes} hitSlop={8} style={styles.viderButton}>
                    <Trash2 size={13} color={colors.candy.orangeDark} />
                    <Text style={[styles.viderText, { color: colors.candy.orangeDark }]}>{t('courses.viderAchetes')}</Text>
                  </Pressable>
                </View>
                {achetes.map(renderItem)}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={commanderVisible}
        onClose={() => setCommanderVisible(false)}
        title={t('courses.commanderTitre')}
        emoji="🛒"
        footer={
          <CandyButton
            label={t('courses.partagerListe')}
            onPress={handleShare}
            variant="green"
            icon={<Share2 size={18} color={colors.candy.white} />}
          />
        }
      >
        <Text style={[styles.sheetIntro, { color: colors.text.body }]}>{t('courses.commanderIntro')}</Text>

        <CandyCard style={{ marginBottom: spacing.lg }}>
          <Text style={[styles.previewText, { color: colors.text.dark }]}>{formatListe()}</Text>
        </CandyCard>

        <Text style={[styles.sheetLabel, { color: colors.text.muted }]}>{t('courses.ouvrirDrive')}</Text>
        <View style={styles.driveGrid}>
          {DRIVES.map((d) => (
            <Pressable
              key={d.key}
              onPress={() => openDrive(d.url)}
              style={[styles.driveChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Store size={16} color={colors.text.body} />
              <Text style={[styles.driveLabel, { color: colors.text.dark }]} numberOfLines={1}>
                {d.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  label: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
  row2: { flexDirection: 'row', gap: spacing.sm },
  itemCard: { marginBottom: spacing.sm, paddingVertical: spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemNom: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  itemNomDone: { textDecorationLine: 'line-through', opacity: 0.5 },
  itemMeta: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: 2 },
  doneHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, marginBottom: spacing.sm },
  doneHeader: { flex: 1, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  viderButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viderText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  // ANNEXE V12 — feuille « Commander ».
  sheetIntro: { fontSize: typography.fontSize.sm, lineHeight: 20, marginBottom: spacing.lg },
  previewText: { fontSize: typography.fontSize.sm, lineHeight: 22 },
  sheetLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.extrabold,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  driveGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  driveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  driveLabel: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold },
});
