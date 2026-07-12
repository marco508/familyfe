// app/(app)/membres/ajouter.tsx
// Recherche de membres à ajouter (nom/email/téléphone) + import des contacts
// du téléphone pour retrouver les utilisateurs FamiLyfe correspondants.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as Contacts from 'expo-contacts';
import { X, Search, Contact as ContactIcon, UserPlus } from 'lucide-react-native';
import ScreenBackground from '../../components/ScreenBackground';
import { useMaison } from '../../src/contexts/MaisonContext';
import maisonService, { PublicUser } from '../../src/services/maisonService';
import { Avatar, CandyButton, CandyCard, CandyInput, EmptyState } from '../../components/ui';
import { typography, spacing, borderRadius } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useT } from '../../src/i18n';

export default function AjouterMembreScreen() {
  const { colors } = useTheme();
  const { t } = useT();
  const { maisonActive, membres, refreshMembres } = useMaison();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [contactsResults, setContactsResults] = useState<PublicUser[] | null>(null);
  const [importingContacts, setImportingContacts] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const membreIds = new Set(membres.map((m) => m.id));

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    try {
      const res = await maisonService.searchUsers(q.trim());
      setResults(res.data ?? []);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const handleImportContacts = async () => {
    setImportingContacts(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('membres.permissionContactsRefusee'), t('membres.permissionContactsMessage'));
        setImportingContacts(false);
        return;
      }
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
      const numbers = new Set<string>();
      data.forEach((c) => {
        c.phoneNumbers?.forEach((p) => {
          if (p.number) {
            const cleaned = p.number.replace(/[\s.\-()]/g, '');
            if (cleaned) numbers.add(cleaned);
          }
        });
      });
      if (numbers.size === 0) {
        setContactsResults([]);
        setImportingContacts(false);
        return;
      }
      const res = await maisonService.searchUsersByTelephones(Array.from(numbers));
      setContactsResults(res.data ?? []);
    } catch (e) {
      Alert.alert(t('common.erreur'), t('membres.erreurImportContacts'));
    } finally {
      setImportingContacts(false);
    }
  };

  const handleAdd = async (user: PublicUser) => {
    if (!maisonActive) return;
    setAddingId(user.id);
    const res = await maisonService.addMembre(maisonActive.id, user.id);
    setAddingId(null);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    await refreshMembres();
    Alert.alert(t('membres.membreAjouteTitre'), `${user.nom} ${t('membres.membreAjouteMessage')}`);
  };

  const renderUserRow = (user: PublicUser) => {
    const dejaMembre = membreIds.has(user.id);
    return (
      <CandyCard key={user.id} style={styles.userCard}>
        <View style={styles.userRow}>
          <Avatar name={user.nom} image={user.image} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.userNom, { color: colors.text.dark }]}>{user.nom}</Text>
            <Text style={[styles.userMeta, { color: colors.text.body }]}>{user.email}</Text>
            {user.telephone ? <Text style={[styles.userMeta, { color: colors.text.body }]}>{user.telephone}</Text> : null}
          </View>
          {dejaMembre ? (
            <Text style={[styles.dejaMembre, { color: colors.text.muted }]}>{t('membres.dejaMembre')}</Text>
          ) : (
            <Pressable
              onPress={() => handleAdd(user)}
              style={[styles.addUserButton, { backgroundColor: colors.primary.main }]}
              disabled={addingId === user.id}
            >
              {addingId === user.id ? (
                <ActivityIndicator color={colors.candy.white} size="small" />
              ) : (
                <>
                  <UserPlus size={14} color={colors.candy.white} />
                  <Text style={[styles.addUserButtonText, { color: colors.candy.white }]}>{t('common.ajouter')}</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </CandyCard>
    );
  };

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>{t('membres.ajouterMembre')}</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <X size={22} color={colors.text.dark} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <CandyInput
          placeholder={t('membres.rechercherPlaceholder')}
          value={query}
          onChangeText={setQuery}
          icon={<Search size={20} color={colors.text.muted} />}
          autoCapitalize="none"
        />

        {searching ? (
          <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary.main} />
        ) : searched && results.length === 0 ? (
          <EmptyState emoji="🔍" title={t('common.aucunResultat')} message={t('membres.aucunResultatMessage')} />
        ) : (
          results.map(renderUserRow)
        )}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <CandyButton
          label={t('membres.importerContacts')}
          onPress={handleImportContacts}
          loading={importingContacts}
          variant="purple"
          icon={<ContactIcon size={18} color={colors.candy.white} />}
        />

        {contactsResults !== null ? (
          contactsResults.length === 0 ? (
            <EmptyState emoji="📵" title={t('membres.aucunProche')} message={t('membres.aucunProcheMessage')} />
          ) : (
            <View style={{ marginTop: spacing.lg }}>
              <Text style={[styles.sectionLabel, { color: colors.text.dark }]}>{t('membres.trouvesContacts')}</Text>
              {contactsResults.map(renderUserRow)}
            </View>
          )
        ) : null}
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
  container: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing['4xl'] },
  divider: { height: 1, marginVertical: spacing.xl },
  sectionLabel: { fontWeight: typography.fontWeight.extrabold, marginBottom: spacing.sm },
  userCard: { marginBottom: spacing.sm },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  userNom: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  userMeta: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium },
  dejaMembre: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.xs },
  addUserButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.pill,
    minWidth: 84,
    justifyContent: 'center',
  },
  addUserButtonText: { fontWeight: typography.fontWeight.extrabold, fontSize: typography.fontSize.xs },
});
