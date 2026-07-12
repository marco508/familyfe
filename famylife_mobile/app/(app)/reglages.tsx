// app/(app)/reglages.tsx — Réglages (ANNEXE V3)
// Mode sombre (ThemeContext), langue FR/EN (i18n), édition du profil, upload
// avatar (expo-image-picker → authService), déconnexion.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Moon, Sun, Camera, LogOut, Cake } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';
import authService from '../src/services/authService';
import { Avatar, CandyButton, CandyCard, CandyInput, SectionTitle, Segmented, Toggle } from '../components/ui';
import { typography, spacing, borderRadius } from '../theme/designTokens';

export default function ReglagesScreen() {
  const { user, logout, refreshProfile } = useAuth();
  const { isDark, toggleTheme, colors } = useTheme();
  const { t, lang, setLang } = useT();

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

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

        <CandyButton
          label={t('common.deconnexion')}
          onPress={handleLogout}
          variant="danger"
          icon={<LogOut size={18} color={colors.candy.white} />}
        />
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
  error: { fontWeight: typography.fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
});
