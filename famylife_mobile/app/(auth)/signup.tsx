// app/(auth)/signup.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { router, Link } from 'expo-router';
import { User, Mail, Phone, Lock, Cake } from 'lucide-react-native';
import { useAuth } from '../src/contexts/AuthContext';
import { CandyButton, CandyInput } from '../components/ui';
import { typography, spacing } from '../theme/designTokens';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';

export default function SignupScreen() {
  const { colors } = useTheme();
  const { t } = useT();
  const { signup } = useAuth();
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    setError('');
    if (!nom.trim() || !email.trim() || !password) {
      setError('Merci de remplir tous les champs obligatoires');
      return;
    }
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    if (dateNaissance.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(dateNaissance.trim())) {
      setError('Date de naissance invalide (format AAAA-MM-JJ)');
      return;
    }
    setLoading(true);
    const result = await signup({
      nom: nom.trim(),
      email: email.trim().toLowerCase(),
      password,
      telephone: telephone.trim() || undefined,
      date_naissance: dateNaissance.trim() || undefined,
    });
    setLoading(false);
    if (!result.success) {
      setError(result.error || "Inscription impossible");
      return;
    }
    router.replace('/(app)/(tabs)');
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text.dark }]}>{t('auth.creerCompteTitre')}</Text>
          <Text style={[styles.subtitle, { color: colors.text.body }]}>{t('auth.rejoindreFamille')}</Text>
        </View>

        <View style={styles.form}>
          <CandyInput
            label={t('auth.nom')}
            placeholder={t('auth.nomPlaceholder')}
            value={nom}
            onChangeText={setNom}
            icon={<User size={20} color={colors.text.muted} />}
          />
          <CandyInput
            label={t('auth.email')}
            placeholder={t('auth.emailPlaceholder')}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            icon={<Mail size={20} color={colors.text.muted} />}
          />
          <CandyInput
            label={t('auth.telephone')}
            placeholder={t('auth.telephonePlaceholder')}
            keyboardType="phone-pad"
            value={telephone}
            onChangeText={setTelephone}
            icon={<Phone size={20} color={colors.text.muted} />}
          />
          <CandyInput
            label={t('auth.dateNaissanceOptionnelle')}
            placeholder={t('auth.dateNaissancePlaceholder')}
            keyboardType="numbers-and-punctuation"
            value={dateNaissance}
            onChangeText={setDateNaissance}
            icon={<Cake size={20} color={colors.text.muted} />}
          />
          <CandyInput
            label={t('auth.motDePasse')}
            placeholder={t('auth.motDePassePlaceholderSignup')}
            isPassword
            value={password}
            onChangeText={setPassword}
            icon={<Lock size={20} color={colors.text.muted} />}
          />

          {error ? <Text style={[styles.error, { color: colors.candy.red }]}>{error}</Text> : null}

          <CandyButton label={t('auth.creerMonCompte')} onPress={handleSignup} loading={loading} variant="purple" />

          <Link href="/(auth)/login" asChild>
            <Pressable style={styles.linkWrap}>
              <Text style={[styles.linkText, { color: colors.text.body }]}>
                {t('auth.dejaCompte')} <Text style={[styles.linkBold, { color: colors.secondary.main }]}>{t('auth.seConnecter')}</Text>
              </Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: spacing.xl, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: spacing['2xl'] },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.black,
  },
  subtitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  form: { width: '100%' },
  error: {
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  linkWrap: { marginTop: spacing.xl, alignItems: 'center' },
  linkText: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },
  linkBold: { fontWeight: typography.fontWeight.extrabold },
});
