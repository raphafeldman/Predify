import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Logo } from '../../components/ui/Logo';
import { TextField } from '../../components/ui/TextField';
import { supabase } from '../../lib/supabase';
import { colors, fontFamily, fontSize, spacing } from '../../lib/theme';

export default function SignupScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  async function handleSubmit() {
    if (!fullName.trim() || !email.trim() || !password) {
      setError('Preencha nome, e-mail e senha.');
      return;
    }
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    setError(null);
    setSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    setSubmitting(false);

    if (signUpError) {
      setError(traduzErro(signUpError.message));
      return;
    }

    // Se o projeto exige confirmação de e-mail, ainda não vem sessão ativa
    // aqui — a pessoa confirma pelo link recebido e depois entra normalmente.
    // Se não exige, o login acontece sozinho (o app reage à sessão nova).
    if (!data.session) {
      setPendingConfirmation(true);
    }
  }

  if (pendingConfirmation) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Logo size="lg" showWordmark={false} />
            <Text style={styles.title}>Confirme seu e-mail</Text>
            <Text style={styles.subtitle}>
              Enviamos um link de confirmação para {email.trim()}. Depois de confirmar, volte e entre normalmente.
            </Text>
          </View>
          <Button title="Voltar para o login" onPress={() => router.replace('/login')} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Logo size="lg" showWordmark={false} />
          <Text style={styles.title}>Criar conta</Text>
          <Text style={styles.subtitle}>Depois de criar sua conta, você cadastra seu condomínio e vira o síndico dele.</Text>
        </View>

        <Card style={styles.card}>
          <TextField label="Nome" value={fullName} onChangeText={setFullName} placeholder="Seu nome completo" />
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
            placeholder="mínimo 6 caracteres"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button title="Criar conta" onPress={handleSubmit} loading={submitting} style={styles.button} />
        </Card>

        <Pressable onPress={() => router.replace('/login')}>
          <Text style={styles.hint}>Já tem conta? Entrar</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function traduzErro(message: string) {
  if (message.includes('already registered') || message.includes('already exists')) {
    return 'Já existe uma conta com esse e-mail.';
  }
  return message;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing['3xl'] },
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
    marginTop: spacing.xs,
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
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing['2xl'],
    fontSize: fontSize.sm,
  },
});
