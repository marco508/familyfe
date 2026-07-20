// components/sections/RepasSection.tsx
// ANNEXE V7 — Corps de l'ancien écran `(app)/menu.tsx`, extrait pour être rendu
// comme segment "Repas" de "Courses & repas". Ne rend ni fond ni en-tête.
// "Menu" ne disait pas ce qu'il contenait (menu de navigation ? menu du resto ?)
// et vivait loin de la liste de courses alors que les deux sont le même sujet
// (on planifie les repas → on en déduit les courses, cf. "vers courses").
// Menu de la semaine (ANNEXE V3) : jours × moments, ajout d'un repas, et
// génération d'une liste de courses depuis les ingrédients d'un repas.
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Plus, ShoppingCart, Trash2 } from 'lucide-react-native';
import { useMaison } from '../../src/contexts/MaisonContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';
import repasService, { MomentRepas, Repas } from '../../src/services/repasService';
import { BottomSheet, CandyButton, CandyCard, CandyInput, Segmented } from '../ui';
import { typography, spacing, borderRadius } from '../../theme/designTokens';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

const MOMENTS: MomentRepas[] = ['petit_dej', 'midi', 'soir'];

interface Props {
  bottomInset?: number;
}

export default function RepasSection({ bottomInset = spacing['4xl'] }: Props) {
  const { maisonActive } = useMaison();
  const { colors } = useTheme();
  const { t, lang } = useT();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [repas, setRepas] = useState<Repas[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalDate, setModalDate] = useState('');
  const [modalMoment, setModalMoment] = useState<MomentRepas>('midi');
  const [titre, setTitre] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [coursesModal, setCoursesModal] = useState<Repas | null>(null);
  const [ingredients, setIngredients] = useState('');
  const [sendingCourses, setSendingCourses] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const load = useCallback(async () => {
    if (!maisonActive) {
      setRepas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await repasService.list(maisonActive.id, toISODate(days[0]), toISODate(days[6]));
      setRepas(res.data ?? []);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maisonActive, weekStart]);

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

  const openModal = (date: Date, moment: MomentRepas) => {
    setModalDate(toISODate(date));
    setModalMoment(moment);
    setTitre('');
    setNotes('');
    setError('');
    setModalVisible(true);
  };

  const handleAdd = async () => {
    if (!maisonActive || !titre.trim()) {
      setError(t('activite.titreObligatoire'));
      return;
    }
    setSaving(true);
    setError('');
    const res = await repasService.create(maisonActive.id, {
      date: modalDate,
      moment: modalMoment,
      titre: titre.trim(),
      notes: notes.trim() || undefined,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setModalVisible(false);
    load();
  };

  const handleDelete = (r: Repas) => {
    Alert.alert(t('common.supprimer') + ' ?', r.titre, [
      { text: t('common.annuler'), style: 'cancel' },
      {
        text: t('common.supprimer'),
        style: 'destructive',
        onPress: async () => {
          setRepas((prev) => prev.filter((x) => x.id !== r.id));
          await repasService.remove(r.id);
        },
      },
    ]);
  };

  const openCoursesModal = (r: Repas) => {
    setIngredients('');
    setCoursesModal(r);
  };

  const handleVersCourses = async () => {
    if (!coursesModal) return;
    const items = ingredients
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) return;
    setSendingCourses(true);
    const res = await repasService.versCourses(coursesModal.id, items);
    setSendingCourses(false);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    setCoursesModal(null);
    Alert.alert(t('menu.ajouterCourses'), '✅');
  };

  const dayLabel = (d: Date) =>
    d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'short', day: '2-digit', month: '2-digit' });

  const momentLabel = (m: MomentRepas) =>
    m === 'petit_dej' ? t('menu.petitDej') : m === 'midi' ? t('menu.midi') : t('menu.soir');
  // « Moins de texte, plus de visuel » : un pictogramme par moment de la journée.
  const momentEmoji = (m: MomentRepas) => (m === 'petit_dej' ? '🥐' : m === 'midi' ? '🍽️' : '🌙');

  return (
    <View style={styles.flex}>
      <View style={styles.weekNavRow}>
        <Pressable onPress={() => setWeekStart((w) => addDays(w, -7))} hitSlop={10}>
          <Text style={[styles.weekNavArrow, { color: colors.primary.main }]}>‹</Text>
        </Pressable>
        <Text style={[styles.weekLabel, { color: colors.text.body }]}>
          {dayLabel(days[0])} — {dayLabel(days[6])}
        </Text>
        <Pressable onPress={() => setWeekStart((w) => addDays(w, 7))} hitSlop={10}>
          <Text style={[styles.weekNavArrow, { color: colors.primary.main }]}>›</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
        ) : (
          days.map((d) => {
            const iso = toISODate(d);
            const dayRepas = repas.filter((r) => r.date === iso);
            return (
              <CandyCard key={iso} style={styles.dayCard}>
                <Text style={[styles.dayTitle, { color: colors.text.dark }]}>{dayLabel(d)}</Text>
                {MOMENTS.map((m) => {
                  const items = dayRepas.filter((r) => r.moment === m);
                  return (
                    <View key={m} style={styles.momentRow}>
                      <Text style={styles.momentEmojiCol} accessibilityLabel={momentLabel(m)}>{momentEmoji(m)}</Text>
                      <View style={{ flex: 1 }}>
                        {items.length === 0 ? (
                          <Pressable onPress={() => openModal(d, m)} style={styles.addMealButton}>
                            <Plus size={14} color={colors.primary.main} />
                            <Text style={[styles.addMealText, { color: colors.primary.main }]}>{t('menu.ajouterRepas')}</Text>
                          </Pressable>
                        ) : (
                          items.map((r) => (
                            <View key={r.id} style={[styles.mealChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                              <Text style={[styles.mealTitle, { color: colors.text.dark }]} numberOfLines={1}>
                                {r.titre}
                              </Text>
                              <Pressable onPress={() => openCoursesModal(r)} hitSlop={8} style={{ marginLeft: spacing.xs }}>
                                <ShoppingCart size={15} color={colors.candy.greenDark} />
                              </Pressable>
                              <Pressable onPress={() => handleDelete(r)} hitSlop={8} style={{ marginLeft: spacing.xs }}>
                                <Trash2 size={15} color={colors.candy.red} />
                              </Pressable>
                            </View>
                          ))
                        )}
                      </View>
                    </View>
                  );
                })}
              </CandyCard>
            );
          })
        )}
      </ScrollView>

      {/* Ajouter un repas */}
      <BottomSheet
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={t('menu.ajouterRepas')}
        emoji="🍽️"
        footer={<CandyButton label={t('common.ajouter')} onPress={handleAdd} loading={saving} variant="orange" />}
      >
        <Text style={[styles.label, { color: colors.text.dark }]}>{momentLabel(modalMoment)} · {modalDate}</Text>
        <Segmented
          value={modalMoment}
          onChange={setModalMoment}
          options={MOMENTS.map((m) => ({ value: m, label: momentLabel(m) }))}
        />
        <View style={{ height: spacing.md }} />
        <CandyInput label={t('common.titre')} placeholder={t('menu.titrePlaceholder')} value={titre} onChangeText={setTitre} />
        <CandyInput label={t('menu.notes')} value={notes} onChangeText={setNotes} multiline />

        {error ? <Text style={[styles.error, { color: colors.candy.red }]}>{error}</Text> : null}
      </BottomSheet>

      {/* Vers courses */}
      <BottomSheet
        visible={!!coursesModal}
        onClose={() => setCoursesModal(null)}
        title={t('menu.ajouterCourses')}
        emoji="🛒"
        footer={
          <CandyButton
            label={t('menu.ajouterCourses')}
            onPress={handleVersCourses}
            loading={sendingCourses}
            disabled={!ingredients.trim()}
            variant="green"
            icon={<ShoppingCart size={18} color={colors.candy.white} />}
          />
        }
      >
        <Text style={[styles.label, { color: colors.text.body }]}>{coursesModal?.titre}</Text>
        <CandyInput
          label={t('menu.ingredients')}
          placeholder={t('menu.ingredientsPlaceholder')}
          value={ingredients}
          onChangeText={setIngredients}
          multiline
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  weekNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  weekNavArrow: { fontSize: 28, fontWeight: typography.fontWeight.black, lineHeight: 28 },
  weekLabel: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, textTransform: 'capitalize' },
  container: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  dayCard: { marginBottom: spacing.md },
  dayTitle: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.black, marginBottom: spacing.sm, textTransform: 'capitalize' },
  momentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  momentLabel: { width: 64, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.extrabold, marginTop: spacing.xs },
  momentEmojiCol: { width: 40, fontSize: 20, textAlign: 'center', marginTop: 2 },
  addMealButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: spacing.xs },
  addMealText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  mealChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  mealTitle: { flex: 1, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold },
  label: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
  error: { fontWeight: typography.fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
});
