import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { colors, fontFamily, fontSize, layout, spacing } from '../lib/theme';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Logo } from './ui/Logo';
import { TextField } from './ui/TextField';

export function CreateCondominioScreen() {
  const { signOut, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [administradora, setAdministradora] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError('Dê um nome para o condomínio.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('create_own_condominio', {
      p_name: name.trim(),
      p_cnpj: cnpj.trim() || null,
      p_address: address.trim() || null,
      p_phone: phone.trim() || null,
      p_administradora: administradora.trim() || null,
    });
    if (rpcError) {
      setSaving(false);
      setError(rpcError.message);
      return;
    }
    await refreshProfile();
    setSaving(false);
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.formColumn}>
          <View style={styles.header}>
            <Logo size="lg" showWordmark={false} />
            <Text style={styles.title}>Criar seu condomínio</Text>
            <Text style={styles.subtitle}>
              Sua conta ainda não está associada a um condomínio. Preencha os dados abaixo — você vira o síndico dele
              automaticamente.
            </Text>
          </View>

          <Card style={styles.card}>
            <TextField
              label="Nome do condomínio"
              value={name}
              onChangeText={setName}
              placeholder="Ex: Edifício Aurora"
            />
            <TextField label="CNPJ (opcional)" value={cnpj} onChangeText={setCnpj} placeholder="00.000.000/0000-00" />
            <TextField label="Endereço (opcional)" value={address} onChangeText={setAddress} />
            <TextField label="Telefone (opcional)" value={phone} onChangeText={setPhone} />
            <TextField
              label="Administradora (opcional)"
              value={administradora}
              onChangeText={setAdministradora}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button title="Criar condomínio" onPress={submit} loading={saving} style={styles.button} />
          </Card>

          <Pressable onPress={signOut}>
            <Text style={styles.hint}>Entrou com a conta errada? Sair</Text>
          </Pressable>
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
    fontSize: fontSize.xl,
    color: colors.textPrimary,
    marginTop: spacing.md,
    textAlign: 'center',
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
