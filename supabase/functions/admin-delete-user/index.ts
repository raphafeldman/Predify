// Edge Function: apaga a conta de um usuário — inclusive um síndico.
// Só o administrador da plataforma pode chamar (nem o próprio síndico do
// condomínio). O conteúdo que a pessoa criou (Ordens, Tarefas, Documentos,
// comentários...) continua existindo — só o vínculo com o nome dela some
// (vira "Usuário removido" no app), graças ao "on delete set null" das
// FKs pra profiles(id) na migração do schema.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getServiceRoleKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;

  const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeysRaw) {
    const parsed = JSON.parse(secretKeysRaw) as Record<string, string>;
    const key = parsed.default ?? Object.values(parsed)[0];
    if (key) return key;
  }

  throw new Error('Nenhuma service role/secret key disponível no ambiente da função.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Não autenticado.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: 'Sessão inválida.' }, 401);
    }

    const { data: adminRow } = await callerClient
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (!adminRow) {
      return jsonResponse({ error: 'Apenas o administrador da plataforma pode excluir uma conta.' }, 403);
    }

    const body = await req.json().catch(() => null);
    const targetUserId = body?.user_id;
    if (!targetUserId) {
      return jsonResponse({ error: 'Informe o usuário a excluir.' }, 400);
    }

    const adminClient = createClient(supabaseUrl, getServiceRoleKey());
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 400);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500);
  }
});
