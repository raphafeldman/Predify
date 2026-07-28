// Edge Function: redefine a senha de outro usuário a pedido do síndico
// (do próprio condomínio) ou do administrador da plataforma. Usa a
// service role / secret key do projeto — o app nunca vê nem manipula
// senha de terceiro diretamente, só através daqui.
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

    const [{ data: callerProfile }, { data: adminRow }] = await Promise.all([
      callerClient.from('profiles').select('role, condominio_id').eq('id', userData.user.id).maybeSingle(),
      callerClient.from('platform_admins').select('user_id').eq('user_id', userData.user.id).maybeSingle(),
    ]);

    const isPlatformAdmin = Boolean(adminRow);
    const isSindico = callerProfile?.role === 'sindico';

    if (!isPlatformAdmin && !isSindico) {
      return jsonResponse(
        { error: 'Apenas o síndico do condomínio ou o administrador da plataforma podem redefinir senhas.' },
        403
      );
    }

    const body = await req.json().catch(() => null);
    const targetUserId = body?.user_id;
    const password = body?.password;

    if (!targetUserId || !password) {
      return jsonResponse({ error: 'Informe o usuário e a nova senha.' }, 400);
    }
    if (password.length < 8) {
      return jsonResponse({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400);
    }

    const adminClient = createClient(supabaseUrl, getServiceRoleKey());

    // Síndico só redefine senha de gente do próprio condomínio; admin da
    // plataforma pode qualquer um.
    if (!isPlatformAdmin) {
      const { data: targetProfile } = await adminClient
        .from('profiles')
        .select('condominio_id')
        .eq('id', targetUserId)
        .maybeSingle();

      if (!targetProfile || targetProfile.condominio_id !== callerProfile?.condominio_id) {
        return jsonResponse({ error: 'Esse usuário não pertence ao seu condomínio.' }, 403);
      }
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, { password });
    if (updateError) {
      return jsonResponse({ error: updateError.message }, 400);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500);
  }
});
