// app/(app)/courses.tsx — Liste de courses (ANNEXE V3)
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, Trash2, Plus, Sparkles } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { useMaison } from '../src/contexts/MaisonContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';
import coursesService, { CourseItem } from '../src/services/coursesService';
import { CandyButton, CandyCard, CandyInput, Checkbox, EmptyState } from '../components/ui';
import { typography, spacing, borderRadius } from '../theme/designTokens';

export default function CoursesScreen() {
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
    <ScreenBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>{t('courses.titre')}</Text>
        {achetes.length > 0 ? (
          <Pressable onPress={handleViderAchetes} hitSlop={10}>
            <Trash2 size={20} color={colors.candy.orangeDark} />
          </Pressable>
        ) : (
          <View style={{ width: 20 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
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
                </View>
                {achetes.map(renderItem)}
              </>
            ) : null}
          </>
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
  label: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
  row2: { flexDirection: 'row', gap: spacing.sm },
  itemCard: { marginBottom: spacing.sm, paddingVertical: spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemNom: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  itemNomDone: { textDecorationLine: 'line-through', opacity: 0.5 },
  itemMeta: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: 2 },
  doneHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, marginBottom: spacing.sm },
  doneHeader: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
});
