import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Logo } from '../components/ui/Logo';
import { TextField } from '../components/ui/TextField';
import { supabase } from '../lib/supabase';
import { colors, fontFamily, fontSize, layout, spacing } from '../lib/theme';

// Fica fora dos grupos (auth)/(app) de propósito: o passo 2 (verificar o
// código) cria uma sessão de recuperação momentânea, e o layout de (auth)
// redireciona pra dentro do app assim que existe sessão — o que atropelaria
// o usuário no meio da troca de senha. Aqui a tela controla a sessão sozinha
// (e desloga de novo assim que a senha é trocada).
export default function EsqueciSenhaScreen() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function requestCode() {
    if (!email.trim()) {
      setError('Informe seu e-mail.');
      return;
    }
    setError(null);
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setStep('code');
  }

  async function confirmNewPassword() {
    if (!code.trim()) {
      setError('Informe o código recebido por e-mail.');
      return;
    }
    if (newPassword.length < 8) {
      setError('A nova senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }
    setError(null);
    setSubmitting(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'recovery',
    });
    if (verifyError) {
      setSubmitting(false);
      setError('Código inválido ou expirado. Peça um novo.');
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    await supabase.auth.signOut();
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setStep('done');
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.formColumn}>
          <View style={styles.header}>
            <Logo size="lg" showWordmark={false} />
            <Text style={styles.title}>Esqueci minha senha</Text>
            {step === 'email' && (
              <Text style={styles.subtitle}>Informe seu e-mail para receber um código de verificação.</Text>
            )}
            {step === 'code' && (
              <Text style={styles.subtitle}>
                Enviamos um código para {email.trim()}. Digite-o abaixo junto com sua nova senha.
              </Text>
            )}
            {step === 'done' && <Text style={styles.subtitle}>Senha redefinida com sucesso.</Text>}
          </View>

          {step === 'email' && (
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
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button title="Enviar código" onPress={requestCode} loading={submitting} style={styles.button} />
            </Card>
          )}

          {step === 'code' && (
            <Card style={styles.card}>
              <TextField
                label="Código recebido por e-mail"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                placeholder="000000"
                maxLength={6}
              />
              <TextField
                label="Nova senha"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="mínimo 8 caracteres"
              />
              <TextField
                label="Confirmar nova senha"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="repita a nova senha"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button
                title="Redefinir senha"
                onPress={confirmNewPassword}
                loading={submitting}
                style={styles.button}
              />
              <Pressable onPress={requestCode} disabled={submitting}>
                <Text style={styles.hint}>Não recebeu? Reenviar código</Text>
              </Pressable>
            </Card>
          )}

          {step === 'done' && (
            <Button title="Ir para o login" onPress={() => router.replace('/login')} style={styles.button} />
          )}

          {step !== 'done' && (
            <Pressable onPress={() => router.replace('/login')}>
              <Text style={styles.hint}>Voltar para o login</Text>
            </Pressable>
          )}
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
  button: { marginTop: spacing.xl },
  hint: {
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
    color: colors.primary,
    marginTop: spacing.lg,
    fontSize: fontSize.sm,
  },
});
