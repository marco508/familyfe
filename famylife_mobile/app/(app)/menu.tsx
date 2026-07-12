// app/(app)/menu.tsx — Menu de la semaine (ANNEXE V3)
// Jours × moments (petit-déj / midi / soir), ajout d'un repas, et génération
// d'une liste de courses depuis les ingrédients d'un repas.
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, X, ShoppingCart, Trash2 } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { useMaison } from '../src/contexts/MaisonContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';
import repasService, { MomentRepas, Repas } from '../src/services/repasService';
import { CandyButton, CandyCard, CandyInput, Segmented } from '../components/ui';
import { typography, spacing, borderRadius } from '../theme/designTokens';

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

export default function MenuScreen() {
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
      setError(t('courses.nom'));
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

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>🍽️ {t('menu.titre')}</Text>
        <View style={{ width: 22 }} />
      </View>

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
        contentContainerStyle={styles.container}
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
                      <Text style={[styles.momentLabel, { color: colors.text.muted }]}>{momentLabel(m)}</Text>
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
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text.dark }]}>{t('menu.ajouterRepas')} 🍽️</Text>
                <Pressable onPress={() => setModalVisible(false)} hitSlop={10}>
                  <X size={22} color={colors.text.dark} />
                </Pressable>
              </View>

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

              <CandyButton label={t('common.ajouter')} onPress={handleAdd} loading={saving} variant="orange" />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Vers courses */}
      <Modal visible={!!coursesModal} animationType="slide" transparent onRequestClose={() => setCoursesModal(null)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text.dark }]}>{t('menu.ajouterCourses')} 🛒</Text>
              <Pressable onPress={() => setCoursesModal(null)} hitSlop={10}>
                <X size={22} color={colors.text.dark} />
              </Pressable>
            </View>
            <Text style={[styles.label, { color: colors.text.body }]}>{coursesModal?.titre}</Text>
            <CandyInput
              label={t('menu.ingredients')}
              placeholder={t('menu.ingredientsPlaceholder')}
              value={ingredients}
              onChangeText={setIngredients}
              multiline
            />
            <CandyButton
              label={t('menu.ajouterCourses')}
              onPress={handleVersCourses}
              loading={sendingCourses}
              disabled={!ingredients.trim()}
              variant="green"
              icon={<ShoppingCart size={18} color={colors.candy.white} />}
            />
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  weekNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  weekNavArrow: { fontSize: 28, fontWeight: typography.fontWeight.black, lineHeight: 28 },
  weekLabel: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, textTransform: 'capitalize' },
  container: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing['4xl'] },
  dayCard: { marginBottom: spacing.md },
  dayTitle: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.black, marginBottom: spacing.sm, textTransform: 'capitalize' },
  momentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  momentLabel: { width: 64, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.extrabold, marginTop: spacing.xs },
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
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  modalTitle: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.black },
  label: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
  error: { fontWeight: typography.fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
});
