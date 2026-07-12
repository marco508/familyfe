// app/(auth)/login.tsx
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
import { User, Lock } from 'lucide-react-native';
import { useAuth } from '../src/contexts/AuthContext';
import { CandyButton, CandyInput } from '../components/ui';
import { typography, spacing, borderRadius } from '../theme/designTokens';
import { useTheme } from '../src/contexts/ThemeContext';
import { useT } from '../src/i18n';

export default function LoginScreen() {
  const { colors } = useTheme();
  const { t } = useT();
  const { login } = useAuth();
  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    if (!identifiant.trim() || !password) {
      setError('Merci de renseigner votre identifiant et votre mot de passe');
      return;
    }
    setLoading(true);
    const result = await login({ identifiant: identifiant.trim(), password });
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Connexion impossible');
      return;
    }
    router.replace('/(app)/(tabs)');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={[styles.logoCircle, { backgroundColor: colors.card, borderColor: colors.candy.white }]}>
            <Text style={styles.logoEmoji}>🏠</Text>
          </View>
          <Text style={[styles.title, { color: colors.text.dark }]}>{t('auth.titre')}</Text>
          <Text style={[styles.subtitle, { color: colors.text.body }]}>{t('auth.sousTitre')}</Text>
        </View>

        <View style={styles.form}>
          <CandyInput
            label={t('auth.identifiant')}
            placeholder={t('auth.identifiantPlaceholder')}
            autoCapitalize="none"
            value={identifiant}
            onChangeText={setIdentifiant}
            icon={<User size={20} color={colors.text.muted} />}
          />
          <CandyInput
            label={t('auth.motDePasse')}
            placeholder={t('auth.motDePassePlaceholder')}
            isPassword
            value={password}
            onChangeText={setPassword}
            icon={<Lock size={20} color={colors.text.muted} />}
          />

          {error ? <Text style={[styles.error, { color: colors.candy.red }]}>{error}</Text> : null}

          <CandyButton label={t('auth.seConnecter')} onPress={handleLogin} loading={loading} variant="pink" />

          <Link href="/(auth)/signup" asChild>
            <Pressable style={styles.linkWrap}>
              <Text style={[styles.linkText, { color: colors.text.body }]}>
                {t('auth.pasDeCompte')} <Text style={[styles.linkBold, { color: colors.primary.main }]}>{t('auth.creerCompte')}</Text>
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
  header: { alignItems: 'center', marginBottom: spacing['3xl'] },
  logoCircle: {
    width: 84,
    height: 84,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 2,
  },
  logoEmoji: { fontSize: 40 },
  title: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.black,
    letterSpacing: typography.letterSpacing.tight,
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
