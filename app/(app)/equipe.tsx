import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import type { Profile, Role } from '../../lib/types';

export default function EquipeScreen() {
  const { profile: myProfile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Profile | null>(null);

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
      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => setEditing(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.full_name}</Text>
              <Text style={styles.meta}>
                {item.role === 'sindico' ? 'Síndico' : 'Funcionário'}
                {item.phone ? ` • ${item.phone}` : ''}
              </Text>
            </View>
            <View style={[styles.badge, item.active ? styles.badgeActive : styles.badgeBlocked]}>
              <Text style={styles.badgeText}>{item.active ? 'Ativo' : 'Bloqueado'}</Text>
            </View>
          </Pressable>
        )}
      />

      <Text style={styles.hint}>
        Para cadastrar uma pessoa nova, use o painel do Supabase (Authentication → Add user).
        Aqui você edita e bloqueia quem já existe.
      </Text>

      <EditProfileModal
        profile={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </View>
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
  const [active, setActive] = useState(true);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name);
      setPhone(profile.phone ?? '');
      setRole(profile.role);
      setActive(profile.active);
      setConfirmingBlock(false);
      setError(null);
    }
  }, [profile]);

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
    <Modal visible={Boolean(profile)} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Editar usuário</Text>

        <Text style={styles.label}>Nome</Text>
        <TextInput style={styles.input} value={fullName} onChangeText={setFullName} />

        <Text style={styles.label}>Telefone</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="(11) 90000-0000" />

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

        <Text style={styles.label}>Status</Text>
        {active ? (
          confirmingBlock ? (
            <View style={styles.confirmRow}>
              <Text style={styles.confirmText}>Bloquear {profile.full_name}? Ela não vai conseguir mais entrar no app.</Text>
              <View style={styles.confirmButtonsRow}>
                <Pressable style={styles.cancelButton} onPress={() => setConfirmingBlock(false)}>
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={styles.blockButton}
                  onPress={() => {
                    setActive(false);
                    setConfirmingBlock(false);
                  }}
                >
                  <Text style={styles.blockButtonText}>Confirmar bloqueio</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              style={styles.blockButton}
              onPress={() => (isSelf ? null : setConfirmingBlock(true))}
              disabled={isSelf}
            >
              <Text style={styles.blockButtonText}>Bloquear usuário</Text>
            </Pressable>
          )
        ) : (
          <Pressable style={styles.unblockButton} onPress={() => setActive(true)}>
            <Text style={styles.unblockButtonText}>Desbloquear usuário</Text>
          </Pressable>
        )}
        {isSelf && <Text style={styles.hintSmall}>Você não pode bloquear a si mesmo.</Text>}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Fechar</Text>
          </Pressable>
          <Pressable style={styles.saveButton} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Salvar</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  restricted: { textAlign: 'center', marginTop: 40, color: '#9CA3AF' },
  listContent: { padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  name: { fontSize: 15, fontWeight: '600', color: '#111827' },
  meta: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeActive: { backgroundColor: '#ECFDF5' },
  badgeBlocked: { backgroundColor: '#FEF2F2' },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  hint: { padding: 16, fontSize: 12, color: '#9CA3AF', textAlign: 'center' },
  modalContainer: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#fff' },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16, color: '#111827' },
  label: { fontSize: 13, color: '#374151', marginTop: 12, marginBottom: 4 },
  hintSmall: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  optionsRow: { flexDirection: 'row', gap: 8 },
  option: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  optionActive: { backgroundColor: '#1F6FEB', borderColor: '#1F6FEB' },
  optionText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  optionTextActive: { color: '#fff' },
  blockButton: {
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  blockButtonText: { color: '#DC2626', fontWeight: '600' },
  unblockButton: {
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  unblockButtonText: { color: '#059669', fontWeight: '600' },
  confirmRow: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 12, gap: 10 },
  confirmText: { color: '#991B1B', fontSize: 13 },
  confirmButtonsRow: { flexDirection: 'row', gap: 10 },
  error: { color: '#DC2626', marginTop: 12, fontSize: 13 },
  modalButtonsRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelButtonText: { color: '#374151', fontWeight: '600' },
  saveButton: {
    flex: 1,
    backgroundColor: '#1F6FEB',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontWeight: '700' },
});
