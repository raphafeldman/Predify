import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import type { Comment, RecordType } from '../lib/types';

interface Props {
  recordType: RecordType;
  recordId: string;
}

interface CommentWithAuthor extends Comment {
  profiles: { full_name: string } | null;
}

export function CommentsThread({ recordType, recordId }: Props) {
  const { session } = useAuth();
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(full_name)')
      .eq('record_type', recordType)
      .eq('record_id', recordId)
      .order('created_at', { ascending: true });
    if (data) setComments(data as unknown as CommentWithAuthor[]);
  }, [recordType, recordId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`comments-${recordType}-${recordId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `record_id=eq.${recordId}` },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, recordId, recordType]);

  async function send() {
    if (!body.trim() || !session) return;
    setSending(true);
    const { error } = await supabase.from('comments').insert({
      record_type: recordType,
      record_id: recordId,
      author_id: session.user.id,
      body: body.trim(),
    });
    setSending(false);
    if (!error) {
      setBody('');
      load();
    }
  }

  return (
    <View style={styles.container}>
      {comments.map((comment) => (
        <View key={comment.id} style={styles.commentRow}>
          <Text style={styles.commentAuthor}>{comment.profiles?.full_name ?? 'Usuário'}</Text>
          <Text style={styles.commentBody}>{comment.body}</Text>
        </View>
      ))}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Escrever um comentário..."
          value={body}
          onChangeText={setBody}
          multiline
        />
        <Pressable style={styles.sendButton} onPress={send} disabled={sending}>
          <Text style={styles.sendButtonText}>Enviar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 10 },
  commentRow: { marginBottom: 8 },
  commentAuthor: { fontSize: 12, fontWeight: '700', color: '#374151' },
  commentBody: { fontSize: 14, color: '#1F2937' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 6 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 90,
  },
  sendButton: {
    backgroundColor: '#1F6FEB',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  sendButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
