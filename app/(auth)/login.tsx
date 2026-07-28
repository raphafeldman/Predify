import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Logo } from '../../components/ui/Logo';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../lib/auth-context';
import { colors, fontFamily, fontSize, layout, spacing } from '../../lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, blockedMessage } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email || !password) {
      setError('Preencha e-mail e senha.');
      return;
    }
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (signInError) setError(signInError);
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.formColumn}>
          <View style={styles.header}>
            <Logo size="lg" showWordmark={false} />
            <Text style={styles.title}>Predify</Text>
            <Text style={styles.slogan}>
              <Text style={styles.sloganNavy}>Facilities em dia.</Text>
              {'\n'}
              <Text style={styles.sloganTeal}>Condomínio em ordem.</Text>
            </Text>
            <Text style={styles.subtitle}>Gestão inteligente para síndicos e condomínios</Text>
          </View>

          {blockedMessage ? <Text style={styles.blocked}>{blockedMessage}</Text> : null}

          <Card style={styles.card}>
            <TextField
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="seu@email.com"
            />
            <TextField
              label="Senha"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button title="Entrar" onPress={handleSubmit} loading={submitting} style={styles.button} />

            <Pressable onPress={() => router.push('/esqueci-senha')}>
              <Text style={styles.forgotLink}>Esqueci minha senha</Text>
            </Pressable>
          </Card>

          <Pressable onPress={() => router.push('/signup')}>
            <Text style={styles.hint}>Ainda não tem condomínio cadastrado? Criar conta</Text>
          </Pressable>
          <Text style={styles.hintSmall}>
            Se seu síndico já te cadastrou, é só entrar com o e-mail e a senha que ele criou.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['3xl'],
  },
  formColumn: { width: '100%', maxWidth: layout.maxFormWidth },
  header: { alignItems: 'center', marginBottom: spacing['2xl'] },
  title: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.display,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  slogan: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: fontSize.lg + 6,
  },
  sloganNavy: { color: colors.primary },
  sloganTeal: { color: colors.accent },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  card: { gap: 0 },
  error: {
    fontFamily: fontFamily.medium,
    color: colors.danger,
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
  },
  blocked: {
    fontFamily: fontFamily.medium,
    color: colors.danger,
    backgroundColor: colors.dangerLight,
    borderRadius: 10,
    padding: spacing.md,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  button: { marginTop: spacing.xl },
  forgotLink: {
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.lg,
    fontSize: fontSize.sm,
  },
  hint: {
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
    color: colors.primary,
    marginTop: spacing['2xl'],
    fontSize: fontSize.sm,
  },
  hintSmall: {
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
  },
});
