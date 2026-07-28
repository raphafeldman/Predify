// Edge Function: apaga um condomínio inteiro — todas as contas de
// usuário (síndicos e funcionários), todos os arquivos no Storage, e
// então a linha do condomínio, que arrasta (cascade) o resto do banco.
// Só o administrador da plataforma pode chamar.
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

// Estrutura de pasta do bucket "photos" é condominioId/categoria/usuarioId/arquivo
// (3 níveis) — dá pra limpar com uma varredura simples, sem recursão genérica.
async function deleteCondominioPhotos(
  adminClient: ReturnType<typeof createClient>,
  condominioId: string
): Promise<{ removed: number; error?: string }> {
  try {
    const bucket = adminClient.storage.from('photos');
    const { data: categorias } = await bucket.list(condominioId, { limit: 1000 });
    const allPaths: string[] = [];

    for (const categoria of categorias ?? []) {
      if (categoria.id !== null) continue; // é arquivo solto, não pasta — ignora
      const categoriaPath = `${condominioId}/${categoria.name}`;
      const { data: usuarios } = await bucket.list(categoriaPath, { limit: 1000 });

      for (const usuario of usuarios ?? []) {
        if (usuario.id !== null) continue;
        const usuarioPath = `${categoriaPath}/${usuario.name}`;
        const { data: arquivos } = await bucket.list(usuarioPath, { limit: 1000 });
        for (const arquivo of arquivos ?? []) {
          if (arquivo.id === null) continue; // pasta inesperada num nível a mais — ignora
          allPaths.push(`${usuarioPath}/${arquivo.name}`);
        }
      }
    }

    if (allPaths.length > 0) {
      await bucket.remove(allPaths);
    }
    return { removed: allPaths.length };
  } catch (err) {
    return { removed: 0, error: err instanceof Error ? err.message : 'Erro ao limpar arquivos.' };
  }
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
      return jsonResponse({ error: 'Apenas o administrador da plataforma pode excluir um condomínio.' }, 403);
    }

    const body = await req.json().catch(() => null);
    const condominioId = body?.condominio_id;
    if (!condominioId) {
      return jsonResponse({ error: 'Informe o condomínio a excluir.' }, 400);
    }

    const adminClient = createClient(supabaseUrl, getServiceRoleKey());

    const { data: condominio } = await adminClient
      .from('condominios')
      .select('id')
      .eq('id', condominioId)
      .maybeSingle();
    if (!condominio) {
      return jsonResponse({ error: 'Condomínio não encontrado.' }, 404);
    }

    const { data: perfis } = await adminClient.from('profiles').select('id').eq('condominio_id', condominioId);

    let usersDeleted = 0;
    const userErrors: string[] = [];
    for (const perfil of perfis ?? []) {
      const { error } = await adminClient.auth.admin.deleteUser(perfil.id);
      if (error) userErrors.push(`${perfil.id}: ${error.message}`);
      else usersDeleted++;
    }

    const storageResult = await deleteCondominioPhotos(adminClient, condominioId);

    const { error: deleteCondoError } = await adminClient.from('condominios').delete().eq('id', condominioId);
    if (deleteCondoError) {
      return jsonResponse(
        {
          error: `Contas e arquivos foram removidos, mas o condomínio em si não: ${deleteCondoError.message}`,
          usersDeleted,
          userErrors,
        },
        500
      );
    }

    return jsonResponse({ ok: true, usersDeleted, userErrors, photosRemoved: storageResult.removed });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500);
  }
});
