// Edge Function: cria uma conta nova (auth + profiles) a pedido do síndico
// (para o próprio condomínio dele) ou do administrador da plataforma (para
// qualquer condomínio, por exemplo pra criar o síndico de um condomínio que
// acabou de cadastrar). Usa a service role / secret key do projeto, que o
// Supabase injeta automaticamente no ambiente da função (nunca fica no
// app/celular).
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

// O Supabase está migrando de SUPABASE_SERVICE_ROLE_KEY (string simples,
// legado) para SUPABASE_SECRET_KEYS (JSON com múltiplas chaves nomeadas).
// Aceita os dois formatos pra não quebrar dependendo de quando o projeto
// foi criado.
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

    // Cliente com o token de quem chamou, só pra descobrir quem é e
    // confirmar que é síndico ou administrador da plataforma (RLS normal
    // se aplica aqui, sem privilégio).
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
        { error: 'Apenas o síndico do condomínio ou o administrador da plataforma podem cadastrar usuários.' },
        403
      );
    }

    const body = await req.json().catch(() => null);
    const email = body?.email?.trim();
    const password = body?.password;
    const fullName = body?.full_name?.trim();
    const role = body?.role === 'sindico' ? 'sindico' : 'funcionario';
    const phone = body?.phone?.trim() || undefined;

    // Síndico só cadastra gente pro próprio condomínio (nunca vem do
    // cliente). Administrador da plataforma precisa indicar pra qual
    // condomínio é — normalmente pra criar/repor o síndico de alguém.
    let targetCondominioId: string;
    if (isPlatformAdmin) {
      const requestedCondominioId = body?.condominio_id;
      if (!requestedCondominioId) {
        return jsonResponse({ error: 'Informe o condomínio para o qual criar o usuário.' }, 400);
      }
      targetCondominioId = requestedCondominioId;
    } else {
      if (!callerProfile?.condominio_id) {
        return jsonResponse({ error: 'Sua conta não está associada a um condomínio.' }, 400);
      }
      targetCondominioId = callerProfile.condominio_id;
    }

    if (!email || !password || !fullName) {
      return jsonResponse({ error: 'Preencha e-mail, senha e nome.' }, 400);
    }
    if (password.length < 6) {
      return jsonResponse({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400);
    }

    const adminClient = createClient(supabaseUrl, getServiceRoleKey());

    if (isPlatformAdmin) {
      const { data: condominioExists } = await adminClient
        .from('condominios')
        .select('id')
        .eq('id', targetCondominioId)
        .maybeSingle();
      if (!condominioExists) {
        return jsonResponse({ error: 'Condomínio não encontrado.' }, 400);
      }
    } else {
      // Paywall: o primeiro síndico de um condomínio é criado direto pelo
      // administrador da plataforma (ou pelo próprio dono ao criar seu
      // condomínio) e é sempre grátis. Todo usuário cadastrado por aqui —
      // síndico adicional ou funcionário — conta contra os assentos pagos.
      const { data: condominio, error: condominioError } = await adminClient
        .from('condominios')
        .select('paid_seats, billing_status')
        .eq('id', targetCondominioId)
        .single();

      if (condominioError || !condominio) {
        return jsonResponse({ error: 'Não foi possível verificar o plano do condomínio.' }, 400);
      }
      if (condominio.billing_status === 'suspended') {
        return jsonResponse(
          { error: 'A assinatura do condomínio está suspensa. Fale com o administrador da plataforma.' },
          402
        );
      }

      const { count, error: countError } = await adminClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('condominio_id', targetCondominioId)
        .eq('active', true);

      if (countError) {
        return jsonResponse({ error: 'Não foi possível verificar o limite de usuários.' }, 400);
      }
      if ((count ?? 0) >= condominio.paid_seats) {
        return jsonResponse(
          {
            error:
              'Limite de usuários do plano atingido. Peça ao administrador da plataforma para liberar mais assentos.',
          },
          402
        );
      }
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role, phone, condominio_id: targetCondominioId },
    });

    if (createError) {
      return jsonResponse({ error: createError.message }, 400);
    }

    return jsonResponse({ user: created.user });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500);
  }
});
