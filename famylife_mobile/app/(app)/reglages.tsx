// app/(app)/reglages.tsx — Réglages (ANNEXE V3)
// Mode sombre (ThemeContext), langue FR/EN (i18n), édition du profil, upload
// avatar (expo-image-picker → authService), déconnexion.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Moon,
  Sun,
  Camera,
  LogOut,
  Cake,
  ShieldOff,
  SlidersHorizontal,
  ChevronRight,
  Landmark,
  BellRing,
  Trash2,
  AlertTriangle,
} from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useMaison } from '../src/contexts/MaisonContext';
import { useT } from '../src/i18n';
import authService from '../src/services/authService';
import { Avatar, BottomSheet, CandyButton, CandyCard, CandyInput, SectionTitle, Segmented, Toggle } from '../components/ui';
import { typography, spacing, borderRadius } from '../theme/designTokens';

export default function ReglagesScreen() {
  const { user, logout, logoutAll, deleteAccount, refreshProfile } = useAuth();
  const { isDark, toggleTheme, colors } = useTheme();
  // ANNEXE V9 — Portefeuille rapatrié du menu "Plus" : il faut ici le rôle et
  // l'état du module pour reproduire exactement l'ancienne condition d'affichage.
  const { isChef, isModuleActif } = useMaison();
  const { t, lang, setLang } = useT();

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Suppression de compte — feuille de confirmation forte (geste destructeur).
  const [deleteSheetVisible, setDeleteSheetVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (user) {
      setNom(user.nom || '');
      setEmail(user.email || '');
      setTelephone(user.telephone || '');
      setDateNaissance(user.date_naissance || '');
    }
  }, [user]);

  const handleSaveProfile = async () => {
    if (!nom.trim() || !email.trim()) {
      setProfileError(t('maison.nomEmailObligatoires'));
      return;
    }
    if (dateNaissance.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(dateNaissance.trim())) {
      setProfileError(t('maison.dateNaissanceInvalide'));
      return;
    }
    setSavingProfile(true);
    setProfileError('');
    const res = await authService.updateProfile({
      nom: nom.trim(),
      email: email.trim().toLowerCase(),
      telephone: telephone.trim() || null,
      date_naissance: dateNaissance.trim() || null,
    });
    setSavingProfile(false);
    if (res.error) {
      setProfileError(res.error);
      return;
    }
    await refreshProfile();
    Alert.alert(t('common.enregistrer'), '✅');
  };

  const handlePickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('maison.permissionRefusee'), t('maison.permissionRefuseeMessage'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setUploadingAvatar(true);
    const res = await authService.uploadAvatar(result.assets[0].uri);
    setUploadingAvatar(false);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    await refreshProfile();
  };

  const handleLogout = () => {
    Alert.alert(t('common.deconnexion') + ' ?', '', [
      { text: t('common.annuler'), style: 'cancel' },
      { text: t('common.deconnexion'), style: 'destructive', onPress: logout },
    ]);
  };

  const handleLogoutAll = () => {
    Alert.alert(
      t('reglages.deconnexionTous') + ' ?',
      t('reglages.deconnexionTousConfirm'),
      [
        { text: t('common.annuler'), style: 'cancel' },
        { text: t('reglages.toutDeconnecter'), style: 'destructive', onPress: logoutAll },
      ]
    );
  };

  const openDeleteSheet = () => {
    setDeletePassword('');
    setDeleteError('');
    setDeleteSheetVisible(true);
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim() || deleting) return;
    setDeleting(true);
    setDeleteError('');
    const res = await deleteAccount(deletePassword);
    setDeleting(false);
    if (!res.ok) {
      // Mot de passe faux (403) → message dédié ; autre erreur → message brut.
      setDeleteError(res.error || t('reglages.motDePasseIncorrect'));
      return;
    }
    // Succès : l'état auth est déjà remis à zéro (user = null), la redirection
    // vers /(auth)/login se fait toute seule via (app)/_layout.tsx. On ferme
    // simplement la feuille.
    setDeleteSheetVisible(false);
  };

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text.dark} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.dark }]}>⚙️ {t('reglages.titre')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* Avatar + profil */}
        <SectionTitle title={t('reglages.profil')} emoji="🙂" />
        <CandyCard style={{ marginBottom: spacing.xl }}>
          <View style={styles.avatarRow}>
            <Pressable onPress={handlePickAvatar} disabled={uploadingAvatar}>
              <Avatar name={user?.nom} image={user?.image} size={72} />
              <View style={[styles.avatarBadge, { backgroundColor: colors.primary.main, borderColor: colors.background }]}>
                <Camera size={14} color={colors.candy.white} />
              </View>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.avatarHint, { color: colors.text.body }]}>
                {uploadingAvatar ? t('common.chargement') : t('maison.changerAvatar')}
              </Text>
            </View>
          </View>

          <CandyInput label={t('auth.nom')} value={nom} onChangeText={setNom} />
          <CandyInput label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <CandyInput label={t('maison.telephoneLabel')} value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" />
          <CandyInput
            label={`${t('reglages.dateNaissance')} (AAAA-MM-JJ)`}
            placeholder="1990-05-20"
            value={dateNaissance}
            onChangeText={setDateNaissance}
            icon={<Cake size={18} color={colors.text.muted} />}
          />
          {profileError ? <Text style={[styles.error, { color: colors.candy.red }]}>{profileError}</Text> : null}
          <CandyButton label={t('common.enregistrer')} onPress={handleSaveProfile} loading={savingProfile} variant="pink" />
        </CandyCard>

        {/* Mode sombre */}
        <SectionTitle title={t('reglages.titre')} emoji="🎨" />
        <CandyCard style={{ marginBottom: spacing.lg }}>
          <View style={styles.rowBetween}>
            <View style={styles.rowStart}>
              {isDark ? <Moon size={18} color={colors.secondary.main} /> : <Sun size={18} color={colors.candy.yellowDark} />}
              <Text style={[styles.rowLabel, { color: colors.text.dark }]}>{t('reglages.modeSombre')}</Text>
            </View>
            <Toggle value={isDark} onValueChange={toggleTheme} />
          </View>
        </CandyCard>

        {/* Langue */}
        <CandyCard style={{ marginBottom: spacing.xl }}>
          <Text style={[styles.rowLabel, { color: colors.text.dark, marginBottom: spacing.md }]}>{t('reglages.langue')}</Text>
          <Segmented
            value={lang}
            onChange={setLang}
            options={[
              { value: 'fr', label: '🇫🇷 ' + t('reglages.francais') },
              { value: 'en', label: '🇬🇧 ' + t('reglages.anglais') },
            ]}
          />
        </CandyCard>

        {/* ANNEXE V9 — Réglages est désormais la porte UNIQUE du paramétrage :
            le menu "Plus" ne duplique plus ces entrées (il n'y avait aucune
            raison de proposer deux fois le même écran). C'est ici que
            l'utilisateur vient chercher « comment j'active X ? ». */}
        <Pressable onPress={() => router.push('/(app)/modules')}>
          <CandyCard style={{ marginBottom: spacing.md }}>
            <View style={styles.rowBetween}>
              <View style={styles.rowStart}>
                <SlidersHorizontal size={18} color={colors.primary.main} />
                <View>
                  <Text style={[styles.rowLabel, { color: colors.text.dark }]}>{t('modules.titre')}</Text>
                  <Text style={[styles.rowSub, { color: colors.text.body }]}>{t('modules.sousTitre')}</Text>
                </View>
              </View>
              <ChevronRight size={18} color={colors.text.muted} />
            </View>
          </CandyCard>
        </Pressable>

        {/* ANNEXE V10 — Notifications : même rang que Modules, et pour la même
            raison. « Qu'est-ce que mon foyer utilise ? » et « qu'est-ce que je
            reçois ? » sont deux questions de paramétrage, et Réglages est leur
            porte unique. Surtout PAS dans le menu "Plus" : on vient d'y
            dédoublonner (V9), on ne va pas y remettre une entrée de réglage. */}
        <Pressable onPress={() => router.push('/(app)/notifications-reglages')}>
          <CandyCard style={{ marginBottom: spacing.md }}>
            <View style={styles.rowBetween}>
              <View style={styles.rowStart}>
                <BellRing size={18} color={colors.primary.main} />
                <View>
                  <Text style={[styles.rowLabel, { color: colors.text.dark }]}>{t('notifsPrefs.titre')}</Text>
                  <Text style={[styles.rowSub, { color: colors.text.body }]}>{t('notifsPrefs.sousTitre')}</Text>
                </View>
              </View>
              <ChevronRight size={18} color={colors.text.muted} />
            </View>
          </CandyCard>
        </Pressable>

        {/* ANNEXE V9 — Portefeuille : sorti du menu "Plus" (c'est de
            l'administratif, pas une fonction du quotidien). Double condition,
            reprise telle quelle de l'ancienne entrée : n'a de sens que pour qui
            dirige un logement, ET il faut que le module soit activé. */}
        {isChef && isModuleActif('portefeuille') ? (
          <Pressable onPress={() => router.push('/(app)/portefeuille')}>
            <CandyCard style={{ marginBottom: spacing.xl }}>
              <View style={styles.rowBetween}>
                <View style={styles.rowStart}>
                  <Landmark size={18} color={colors.primary.main} />
                  <View>
                    <Text style={[styles.rowLabel, { color: colors.text.dark }]}>{t('plus.portefeuille')}</Text>
                    <Text style={[styles.rowSub, { color: colors.text.body }]}>
                      {t('modules.portefeuilleDesc')}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={18} color={colors.text.muted} />
              </View>
            </CandyCard>
          </Pressable>
        ) : (
          <View style={{ marginBottom: spacing.md }} />
        )}

        <CandyButton
          label={t('common.deconnexion')}
          onPress={handleLogout}
          variant="danger"
          icon={<LogOut size={18} color={colors.candy.white} />}
        />
        <Pressable onPress={handleLogoutAll} style={styles.logoutAllRow} hitSlop={8}>
          <ShieldOff size={16} color={colors.candy.red} />
          <Text style={[styles.logoutAllText, { color: colors.candy.red }]}>{t('reglages.deconnexionTous')}</Text>
        </Pressable>

        {/* Zone de danger — actions irréversibles, visuellement distincte. */}
        <View style={styles.dangerZone}>
          <View style={styles.dangerHeader}>
            <AlertTriangle size={16} color={colors.candy.red} />
            <Text style={[styles.dangerZoneTitle, { color: colors.candy.red }]}>{t('reglages.zoneDanger')}</Text>
          </View>
          <Pressable onPress={openDeleteSheet}>
            <CandyCard style={{ borderWidth: 1.5, borderColor: colors.candy.red }}>
              <View style={styles.rowBetween}>
                <View style={styles.rowStart}>
                  <Trash2 size={18} color={colors.candy.red} />
                  <Text style={[styles.rowLabel, { color: colors.candy.red }]}>{t('reglages.supprimerCompte')}</Text>
                </View>
                <ChevronRight size={18} color={colors.candy.red} />
              </View>
            </CandyCard>
          </Pressable>
        </View>
      </ScrollView>

      <BottomSheet
        visible={deleteSheetVisible}
        onClose={() => {
          if (!deleting) setDeleteSheetVisible(false);
        }}
        title={t('reglages.supprimerCompteTitre')}
        emoji="⚠️"
        footer={
          <CandyButton
            label={t('reglages.supprimerCompteConfirmer')}
            onPress={handleDeleteAccount}
            variant="danger"
            loading={deleting}
            disabled={!deletePassword.trim() || deleting}
            icon={<Trash2 size={18} color={colors.candy.white} />}
          />
        }
      >
        <Text style={[styles.dangerWarning, { color: colors.text.body }]}>
          {t('reglages.supprimerCompteAvertissement')}
        </Text>
        <CandyInput
          label={t('reglages.motDePasseActuel')}
          value={deletePassword}
          onChangeText={(v) => {
            setDeletePassword(v);
            if (deleteError) setDeleteError('');
          }}
          secureTextEntry
          autoCapitalize="none"
          error={deleteError || undefined}
        />
      </BottomSheet>
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
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.lg },
  avatarBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  avatarHint: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowStart: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  rowSub: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginTop: 2 },
  error: { fontWeight: typography.fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
  logoutAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  logoutAllText: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold },
  dangerZone: { marginTop: spacing['2xl'] },
  dangerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  dangerZoneTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.extrabold,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  dangerWarning: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
});
