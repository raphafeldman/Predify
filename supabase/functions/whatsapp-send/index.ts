// Edge Function: síndico manda um aviso avulso pra um funcionário do
// próprio condomínio por WhatsApp. Mesmo padrão de autenticação de
// admin-reset-password — confere quem está chamando antes de fazer
// qualquer coisa privilegiada.
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

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length <= 11 ? `55${digits}` : digits;
}

async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  params: string[]
): Promise<{ ok: boolean; error?: string }> {
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não configurado.' };
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'pt_BR' },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return { ok: false, error: `Meta respondeu ${res.status}: ${errBody.slice(0, 300)}` };
  }
  return { ok: true };
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
      return jsonResponse({ error: 'Apenas o síndico pode enviar avisos pelo WhatsApp.' }, 403);
    }

    const body = await req.json().catch(() => null);
    const targetUserId = body?.user_id;
    const message = body?.message?.trim();

    if (!targetUserId || !message) {
      return jsonResponse({ error: 'Informe o destinatário e a mensagem.' }, 400);
    }

    const adminClient = createClient(supabaseUrl, getServiceRoleKey());

    const { data: targetProfile } = await adminClient
      .from('profiles')
      .select('phone, condominio_id')
      .eq('id', targetUserId)
      .maybeSingle();

    if (!targetProfile) {
      return jsonResponse({ error: 'Usuário não encontrado.' }, 404);
    }
    if (!isPlatformAdmin && targetProfile.condominio_id !== callerProfile?.condominio_id) {
      return jsonResponse({ error: 'Esse usuário não pertence ao seu condomínio.' }, 403);
    }
    if (!targetProfile.phone) {
      return jsonResponse({ error: 'Esse usuário não tem telefone cadastrado.' }, 400);
    }

    const phone = normalizePhone(targetProfile.phone);
    const result = await sendWhatsAppTemplate(phone, 'aviso_sindico_pt', [message]);

    await adminClient.from('whatsapp_messages').insert({
      condominio_id: targetProfile.condominio_id,
      user_id: targetUserId,
      phone,
      kind: 'aviso_sindico',
      body: message,
      status: result.ok ? 'enviado' : 'falha',
      error: result.error ?? null,
    });

    if (!result.ok) {
      return jsonResponse({ error: result.error }, 502);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500);
  }
});
