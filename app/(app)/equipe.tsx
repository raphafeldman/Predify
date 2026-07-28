import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '../../components/AppModal';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../lib/auth-context';
import { JOB_TITLE_LABEL } from '../../lib/jobTitles';
import { getInvokeErrorMessage, supabase } from '../../lib/supabase';
import { colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import { useIsWideScreen } from '../../lib/useIsWideScreen';
import type { Profile, Role } from '../../lib/types';

export default function EquipeScreen() {
  const { profile: myProfile } = useAuth();
  const isWeb = useIsWideScreen();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('full_name');
    if (data) setProfiles(data as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (myProfile?.role !== 'sindico') {
    return (
      <View style={styles.container}>
        <Text style={styles.restricted}>Acesso restrito ao síndico.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Equipe</Text>
        <Pressable style={styles.newButton} onPress={() => setCreating(true)}>
          <Ionicons name="add" size={16} color={colors.textOnPrimary} />
          <Text style={styles.newButtonText}>Novo usuário</Text>
        </Pressable>
      </View>

      {isWeb && (
        <View style={[styles.row, styles.tableHeader]}>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 2 }]}>Nome</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Papel</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Telefone</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Status</Text>
        </View>
      )}

      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) =>
          isWeb ? (
            <Pressable style={styles.row} onPress={() => setEditing(item)}>
              <Text style={[styles.tableCell, styles.tableCellStrong, { flex: 2 }]}>{item.full_name}</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>
                {item.role === 'sindico' ? 'Síndico' : JOB_TITLE_LABEL[item.job_title ?? ''] ?? 'Funcionário'}
              </Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>{item.phone ?? '—'}</Text>
              <View style={{ flex: 1 }}>
                <Badge label={item.active ? 'Ativo' : 'Bloqueado'} color={item.active ? colors.success : colors.danger} />
              </View>
            </Pressable>
          ) : (
            <Pressable style={styles.row} onPress={() => setEditing(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.full_name}</Text>
                <Text style={styles.meta}>
                  {item.role === 'sindico' ? 'Síndico' : JOB_TITLE_LABEL[item.job_title ?? ''] ?? 'Funcionário'}
                  {item.phone ? ` • ${item.phone}` : ''}
                </Text>
              </View>
              <Badge label={item.active ? 'Ativo' : 'Bloqueado'} color={item.active ? colors.success : colors.danger} />
            </Pressable>
          )
        }
      />

      <EditProfileModal
        profile={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />

      <NewUserModal
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          load();
        }}
      />
    </View>
  );
}

function JobTitlePicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <>
      <Text style={styles.label}>Cargo (opcional)</Text>
      <View style={styles.optionsRow}>
        {Object.keys(JOB_TITLE_LABEL).map((key) => (
          <Pressable
            key={key}
            style={[styles.option, value === key && styles.optionActive]}
            onPress={() => onChange(value === key ? null : key)}
          >
            <Text style={[styles.optionText, value === key && styles.optionTextActive]}>
              {JOB_TITLE_LABEL[key]}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

function NewUserModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('funcionario');
  const [jobTitle, setJobTitle] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFullName('');
    setEmail('');
    setPassword('');
    setPhone('');
    setRole('funcionario');
    setJobTitle(null);
    setError(null);
  }

  async function submit() {
    if (!fullName.trim() || !email.trim() || !password) {
      setError('Preencha nome, e-mail e senha.');
      return;
    }
    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke('admin-users', {
      body: {
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
        role,
        job_title: role === 'funcionario' ? jobTitle ?? undefined : undefined,
      },
    });
    setSaving(false);

    const responseError = await getInvokeErrorMessage(invokeError, data);
    if (responseError) {
      setError(responseError);
      return;
    }
    reset();
    onCreated();
  }

  return (
    <AppModal visible={visible} onClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Novo usuário</Text>

        <TextField label="Nome" value={fullName} onChangeText={setFullName} placeholder="Nome completo" />
        <TextField
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="pessoa@email.com"
        />
        <TextField
          label="Senha provisória"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="mínimo 8 caracteres"
        />
        <TextField label="Telefone (opcional)" value={phone} onChangeText={setPhone} placeholder="(11) 90000-0000" />

        <Text style={styles.label}>Papel</Text>
        <View style={styles.optionsRow}>
          {(['funcionario', 'sindico'] as Role[]).map((r) => (
            <Pressable
              key={r}
              style={[styles.option, role === r && styles.optionActive]}
              onPress={() => setRole(r)}
            >
              <Text style={[styles.optionText, role === r && styles.optionTextActive]}>
                {r === 'sindico' ? 'Síndico' : 'Funcionário'}
              </Text>
            </Pressable>
          ))}
        </View>

        {role === 'funcionario' && <JobTitlePicker value={jobTitle} onChange={setJobTitle} />}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Cadastrar" onPress={submit} loading={saving} style={styles.flex1} />
        </View>

        <Text style={styles.hint}>
          Se aparecer erro dizendo que a função não foi encontrada, é porque o deploy da Edge Function ainda não foi
          feito — veja o SETUP.md.
        </Text>
      </ModalFormLayout>
    </AppModal>
  );
}

function EditProfileModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile: myProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('funcionario');
  const [jobTitle, setJobTitle] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [showWhatsappField, setShowWhatsappField] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const [whatsappMsg, setWhatsappMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name);
      setPhone(profile.phone ?? '');
      setRole(profile.role);
      setJobTitle(profile.job_title);
      setActive(profile.active);
      setConfirmingBlock(false);
      setError(null);
      setShowPasswordField(false);
      setNewPassword('');
      setPasswordMsg(null);
      setShowWhatsappField(false);
      setWhatsappMessage('');
      setWhatsappMsg(null);
    }
  }, [profile]);

  async function resetPassword() {
    if (!profile) return;
    if (newPassword.length < 8) {
      setError('A nova senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    setResettingPassword(true);
    setError(null);
    setPasswordMsg(null);
    const { data, error: invokeError } = await supabase.functions.invoke('admin-reset-password', {
      body: { user_id: profile.id, password: newPassword },
    });
    setResettingPassword(false);
    const responseError = await getInvokeErrorMessage(invokeError, data);
    if (responseError) {
      setError(responseError);
      return;
    }
    setPasswordMsg('Senha redefinida com sucesso.');
    setNewPassword('');
    setShowPasswordField(false);
  }

  async function sendWhatsapp() {
    if (!profile) return;
    if (!whatsappMessage.trim()) {
      setError('Escreva a mensagem do aviso.');
      return;
    }
    setSendingWhatsapp(true);
    setError(null);
    setWhatsappMsg(null);
    const { data, error: invokeError } = await supabase.functions.invoke('whatsapp-send', {
      body: { user_id: profile.id, message: whatsappMessage.trim() },
    });
    setSendingWhatsapp(false);
    const responseError = await getInvokeErrorMessage(invokeError, data);
    if (responseError) {
      setError(responseError);
      return;
    }
    setWhatsappMsg('Aviso enviado pelo WhatsApp.');
    setWhatsappMessage('');
    setShowWhatsappField(false);
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        role,
        job_title: role === 'funcionario' ? jobTitle : null,
        active,
      })
      .eq('id', profile.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved();
  }

  if (!profile) return null;

  const isSelf = profile.id === myProfile?.id;

  return (
    <AppModal visible={Boolean(profile)} onClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Editar usuário</Text>

        <TextField label="Nome" value={fullName} onChangeText={setFullName} />
        <TextField label="Telefone" value={phone} onChangeText={setPhone} placeholder="(11) 90000-0000" />

        <Text style={styles.label}>Papel</Text>
        <View style={styles.optionsRow}>
          {(['funcionario', 'sindico'] as Role[]).map((r) => (
            <Pressable
              key={r}
              style={[styles.option, role === r && styles.optionActive]}
              onPress={() => setRole(r)}
              disabled={isSelf}
            >
              <Text style={[styles.optionText, role === r && styles.optionTextActive]}>
                {r === 'sindico' ? 'Síndico' : 'Funcionário'}
              </Text>
            </Pressable>
          ))}
        </View>
        {isSelf && <Text style={styles.hintSmall}>Você não pode alterar seu próprio papel.</Text>}

        {role === 'funcionario' && <JobTitlePicker value={jobTitle} onChange={setJobTitle} />}

        <Text style={styles.label}>Status</Text>
        {active ? (
          confirmingBlock ? (
            <View style={styles.confirmRow}>
              <Text style={styles.confirmText}>
                Bloquear {profile.full_name}? Ela não vai conseguir mais entrar no app.
              </Text>
              <View style={styles.confirmButtonsRow}>
                <Button
                  title="Cancelar"
                  variant="secondary"
                  onPress={() => setConfirmingBlock(false)}
                  style={styles.flex1}
                />
                <Button
                  title="Confirmar bloqueio"
                  variant="danger"
                  onPress={() => {
                    setActive(false);
                    setConfirmingBlock(false);
                  }}
                  style={styles.flex1}
                />
              </View>
            </View>
          ) : (
            <Button
              title="Bloquear usuário"
              variant="danger"
              onPress={() => (isSelf ? null : setConfirmingBlock(true))}
              disabled={isSelf}
            />
          )
        ) : (
          <Pressable style={styles.unblockButton} onPress={() => setActive(true)}>
            <Text style={styles.unblockButtonText}>Desbloquear usuário</Text>
          </Pressable>
        )}
        {isSelf && <Text style={styles.hintSmall}>Você não pode bloquear a si mesmo.</Text>}

        {!isSelf && (
          <>
            <Text style={styles.label}>Senha</Text>
            {showPasswordField ? (
              <>
                <TextField
                  label="Nova senha"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  placeholder="mínimo 8 caracteres"
                />
                <View style={styles.modalButtonsRow}>
                  <Button
                    title="Cancelar"
                    variant="secondary"
                    onPress={() => {
                      setShowPasswordField(false);
                      setNewPassword('');
                    }}
                    style={styles.flex1}
                  />
                  <Button
                    title="Redefinir"
                    onPress={resetPassword}
                    loading={resettingPassword}
                    style={styles.flex1}
                  />
                </View>
              </>
            ) : (
              <Button title="Redefinir senha" variant="secondary" onPress={() => setShowPasswordField(true)} />
            )}
            {passwordMsg ? <Text style={styles.successText}>{passwordMsg}</Text> : null}
          </>
        )}

        {!isSelf && profile.phone && (
          <>
            <Text style={styles.label}>WhatsApp</Text>
            {showWhatsappField ? (
              <>
                <TextField
                  label="Mensagem"
                  value={whatsappMessage}
                  onChangeText={setWhatsappMessage}
                  placeholder="Ex: Preciso que você confira o elevador social hoje."
                  multiline
                />
                <View style={styles.modalButtonsRow}>
                  <Button
                    title="Cancelar"
                    variant="secondary"
                    onPress={() => {
                      setShowWhatsappField(false);
                      setWhatsappMessage('');
                    }}
                    style={styles.flex1}
                  />
                  <Button
                    title="Enviar"
                    onPress={sendWhatsapp}
                    loading={sendingWhatsapp}
                    style={styles.flex1}
                  />
                </View>
              </>
            ) : (
              <Button title="Enviar aviso no WhatsApp" variant="secondary" onPress={() => setShowWhatsappField(true)} />
            )}
            {whatsappMsg ? <Text style={styles.successText}>{whatsappMsg}</Text> : null}
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Fechar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Salvar" onPress={save} loading={saving} style={styles.flex1} />
        </View>
      </ModalFormLayout>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  restricted: { textAlign: 'center', marginTop: 40, fontFamily: fontFamily.regular, color: colors.textMuted },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.textPrimary },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  newButtonText: { fontFamily: fontFamily.bold, color: colors.textOnPrimary, fontSize: fontSize.sm },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  tableHeader: { borderBottomWidth: 2, borderBottomColor: colors.border, paddingVertical: spacing.sm },
  tableHeaderText: { fontFamily: fontFamily.bold, color: colors.textSecondary, fontSize: fontSize.xs, textTransform: 'uppercase' },
  tableCell: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.textSecondary },
  tableCellStrong: { fontFamily: fontFamily.semibold, color: colors.textPrimary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  name: { fontFamily: fontFamily.semibold, fontSize: fontSize.base, color: colors.textPrimary },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  hint: { marginTop: spacing.lg, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center' },
  modalContainer: { flexGrow: 1, padding: spacing.xl, paddingTop: 60, backgroundColor: colors.background },
  modalTitle: { fontFamily: fontFamily.extrabold, fontSize: fontSize.xl, marginBottom: spacing.lg, color: colors.textPrimary },
  label: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  hintSmall: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  optionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { fontFamily: fontFamily.semibold, color: colors.textSecondary, fontSize: fontSize.sm },
  optionTextActive: { color: colors.textOnPrimary },
  unblockButton: {
    backgroundColor: colors.successLight,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  unblockButtonText: { fontFamily: fontFamily.semibold, color: '#15803D' },
  confirmRow: { backgroundColor: colors.dangerLight, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  confirmText: { fontFamily: fontFamily.medium, color: '#991B1B', fontSize: fontSize.sm },
  confirmButtonsRow: { flexDirection: 'row', gap: spacing.sm },
  error: { fontFamily: fontFamily.medium, color: colors.danger, marginTop: spacing.md, fontSize: fontSize.sm },
  successText: { fontFamily: fontFamily.medium, color: colors.success, marginTop: spacing.sm, fontSize: fontSize.sm },
  modalButtonsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  flex1: { flex: 1 },
});
