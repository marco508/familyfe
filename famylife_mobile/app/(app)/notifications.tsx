// app/(app)/notifications.tsx
// Centre de notifications in-app : liste, tout marquer lu, tap → navigation
// selon `lien` ("activite:ID", "vote:ID", "agenda", "maison"), suppression.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { X, CheckCheck, Trash2 } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import notificationService, { AppNotification, NotificationType } from '../src/services/notificationService';
import { useNotifications } from '../src/contexts/NotificationContext';
import { CandyButton, CandyCard, EmptyState } from '../components/ui';
import { typography, spacing, borderRadius } from '../theme/designTokens';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';

const TYPE_EMOJI: Record<NotificationType, string> = {
  activite: '📋',
  evenement: '📅',
  vote: '🗳️',
  anniversaire: '🎂',
  rotation: '🔄',
};

// Code couleur par type : la tuile teintée fait reconnaître la nature d'un
// coup d'œil, avant même de lire le titre.
const TYPE_TINT: Record<NotificationType, string> = {
  activite: 'rgba(58,154,158,0.16)',
  evenement: 'rgba(94,58,85,0.14)',
  vote: 'rgba(219,138,87,0.16)',
  anniversaire: 'rgba(236,95,78,0.14)',
  rotation: 'rgba(111,163,106,0.16)',
};

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { t, lang } = useT();

  const relativeDate = (iso: string): string => {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return t('notifications.instant');
    if (diffMin < 60) return lang === 'en' ? `${diffMin} ${t('notifications.min')}` : `${t('notifications.ilYA')} ${diffMin} ${t('notifications.min')}`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return lang === 'en' ? `${diffH} ${t('notifications.heure')}` : `${t('notifications.ilYA')} ${diffH} ${t('notifications.heure')}`;
    const diffJ = Math.round(diffH / 24);
    if (diffJ < 7) return lang === 'en' ? `${diffJ} ${t('notifications.jour')}` : `${t('notifications.ilYA')} ${diffJ} ${t('notifications.jour')}`;
    return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { day: '2-digit', month: 'short' });
  };

  const { refresh: refreshCount } = useNotifications();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationService.list();
      setItems(res.data ?? []);
    } finally {
      setLoading(false);
    }
    refreshCount();
  }, [refreshCount]);

  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleTap = (n: AppNotification) => {
    if (!n.lu) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, lu: true } : x)));
      notificationService.marquerLu(n.id).then(() => refreshCount());
    }
    if (!n.lien) return;
    const [type, idStr] = n.lien.split(':');
    if (type === 'activite' && idStr) {
      router.push(`/(app)/activites/${idStr}`);
    } else if (type === 'vote' && idStr) {
      router.push(`/(app)/votes/${idStr}`);
    } else if (type === 'agenda') {
      router.push('/(app)/(tabs)/agenda');
    } else if (type === 'maison') {
      router.push('/(app)/(tabs)/maison');
    }
  };

  const handleMarquerToutLu = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, lu: true })));
    await notificationService.marquerToutLu();
    refreshCount();
  };

  const handleSupprimer = async (id: number) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await notificationService.supprimer(id);
    refreshCount();
  };

  const hasUnread = items.some((n) => !n.lu);

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>{t('notifications.titre')} 🔔</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <X size={22} color={colors.text.dark} />
        </Pressable>
      </View>

      {hasUnread ? (
        <View style={styles.actionsRow}>
          <CandyButton
            label={t('notifications.toutMarquerLu')}
            onPress={handleMarquerToutLu}
            variant="ghost"
            size="sm"
            full={false}
            icon={<CheckCheck size={16} color={colors.primary.main} />}
          />
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
        ) : items.length === 0 ? (
          <EmptyState emoji="🔕" title={t('notifications.aucuneNotification')} message={t('notifications.vousEtesAJour')} />
        ) : (
          items.map((n) => (
            <Pressable key={n.id} onPress={() => handleTap(n)}>
              <CandyCard
                style={StyleSheet.flatten([
                  styles.card,
                  !n.lu && { borderColor: colors.primary.border, borderWidth: 1.5 },
                ])}
              >
                <View style={styles.row}>
                  <View style={[styles.iconTile, { backgroundColor: TYPE_TINT[n.type] ?? colors.surface }]}>
                    <Text style={styles.emoji}>{TYPE_EMOJI[n.type] ?? '🔔'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.titre, { color: colors.text.dark }]} numberOfLines={2}>{n.titre}</Text>
                    <Text style={[styles.message, { color: colors.text.body }]} numberOfLines={3}>{n.message}</Text>
                    <Text style={[styles.date, { color: colors.text.muted }]}>{relativeDate(n.date_creation)}</Text>
                  </View>
                  {!n.lu ? <View style={[styles.dot, { backgroundColor: colors.candy.pink }]} /> : null}
                  <Pressable onPress={() => handleSupprimer(n.id)} hitSlop={8} style={styles.deleteButton}>
                    <Trash2 size={16} color={colors.text.muted} />
                  </Pressable>
                </View>
              </CandyCard>
            </Pressable>
          ))
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
  headerTitle: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.black },
  actionsRow: { paddingHorizontal: spacing.xl, marginBottom: spacing.sm, alignItems: 'flex-end' },
  container: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing['4xl'] },
  card: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconTile: { width: 44, height: 44, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22 },
  titre: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  message: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, marginTop: 2 },
  date: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  deleteButton: { padding: spacing.xs },
});
