// app/(app)/chat.tsx — Chat de la maison (ANNEXE V3)
// Fil de discussion : bulles gauche/droite, saisie + envoi, rafraîchissement
// au focus + polling léger (pas de push distant disponible en Expo Go).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, Send } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import ModuleInactif from '../components/ModuleInactif';
import { useMaison } from '../src/contexts/MaisonContext';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';
import chatService, { Message } from '../src/services/chatService';
import { Avatar, EmptyState } from '../components/ui';
import { typography, spacing, borderRadius } from '../theme/designTokens';

const POLL_INTERVAL_MS = 8000;

export default function ChatScreen() {
  const { maisonActive, isModuleActif } = useMaison();
  const chatActif = isModuleActif('chat');
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t, lang } = useT();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [texte, setTexte] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!maisonActive) {
        setMessages([]);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const res = await chatService.listMessages(maisonActive.id, undefined, 100);
        // Le back renvoie souvent du plus récent au plus ancien ; on affiche du
        // plus ancien au plus récent, comme un fil de discussion classique.
        const list = [...(res.data ?? [])].sort(
          (a, b) => new Date(a.date_creation).getTime() - new Date(b.date_creation).getTime()
        );
        setMessages(list);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [maisonActive]
  );

  useFocusEffect(
    useCallback(() => {
      // ANNEXE V8 — module éteint : ne pas lancer le polling (une requête
      // toutes les 8 s pour un écran qui n'affiche qu'un état "désactivé").
      if (!chatActif) return;
      load();
      const interval = setInterval(() => load(true), POLL_INTERVAL_MS);
      return () => clearInterval(interval);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, chatActif])
  );

  useEffect(() => {
    if (!loading) {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length, loading]);

  const handleSend = async () => {
    if (!maisonActive || !texte.trim()) return;
    const contenu = texte.trim();
    setTexte('');
    setSending(true);
    const res = await chatService.envoyerMessage(maisonActive.id, contenu);
    setSending(false);
    if (res.data) {
      setMessages((prev) => [...prev, res.data as Message]);
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  // ANNEXE V8 — après les hooks (règle des hooks). La route reste vivante ; on
  // explique au lieu de rediriger.
  if (!chatActif) return <ModuleInactif cle="chat" />;

  return (
    <ScreenBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <ArrowLeft size={22} color={colors.text.dark} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text.dark }]}>{t('chat.titre')}</Text>
          <View style={{ width: 22 }} />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary.main} />
        ) : messages.length === 0 ? (
          <EmptyState emoji="💬" title={t('chat.vide')} />
        ) : (
          <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>
            {messages.map((m) => {
              const mine = m.utilisateur_id === user?.id;
              return (
                <View key={m.id} style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowTheirs]}>
                  {!mine ? <Avatar name={m.auteur?.nom} image={m.auteur?.image} size={28} /> : null}
                  <View style={{ maxWidth: '75%' }}>
                    {!mine ? (
                      <Text style={[styles.authorName, { color: colors.text.muted }]}>{m.auteur?.nom ?? '?'}</Text>
                    ) : null}
                    <View
                      style={[
                        styles.bubble,
                        mine
                          ? { backgroundColor: colors.primary.main, borderBottomRightRadius: 4 }
                          : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 4 },
                      ]}
                    >
                      <Text style={[styles.bubbleText, { color: mine ? colors.candy.white : colors.text.dark }]}>{m.contenu}</Text>
                    </View>
                    <Text style={[styles.time, { color: colors.text.muted }, mine && { textAlign: 'right' }]}>
                      {formatTime(m.date_creation)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        <View style={[styles.composerRow, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <TextInput
            value={texte}
            onChangeText={setTexte}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={colors.text.muted}
            style={[styles.composerInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text.dark }]}
            multiline
          />
          <Pressable
            onPress={handleSend}
            disabled={!texte.trim() || sending}
            style={[styles.sendButton, { backgroundColor: colors.primary.main, opacity: !texte.trim() || sending ? 0.5 : 1 }]}
          >
            <Send size={18} color={colors.candy.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  container: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.lg, gap: spacing.md },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginBottom: spacing.sm },
  msgRowMine: { justifyContent: 'flex-end', alignSelf: 'flex-end' },
  msgRowTheirs: { justifyContent: 'flex-start', alignSelf: 'flex-start' },
  authorName: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold, marginBottom: 2, marginLeft: spacing.xs },
  bubble: { borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleText: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.medium },
  time: { fontSize: 10, fontWeight: typography.fontWeight.medium, marginTop: 2, marginHorizontal: spacing.xs },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  composerInput: {
    flex: 1,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.md,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
