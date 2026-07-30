import { readFileSync } from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Carrega .env.test manualmente (sem depender de pacote novo nem de uma
// versão específica do Node) — só preenche variáveis que ainda não
// existem no processo, pra não pisar em algo já exportado no shell.
export function loadDotEnvTest() {
  let content: string;
  try {
    content = readFileSync('.env.test', 'utf8');
  } catch {
    return;
  }
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].trim();
    }
  }
}
loadDotEnvTest();

export const TEST_URL = process.env.TEST_SUPABASE_URL;
export const TEST_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY;
export const hasTestEnv = Boolean(TEST_URL && TEST_ANON_KEY);

export function freshClient(): SupabaseClient {
  return createClient(TEST_URL as string, TEST_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// Cria uma conta nova via o mesmo fluxo self-service real do app.
// mailinator.com é um domínio real de caixa descartável — o Supabase
// recusa domínios sem registro MX (example.com etc.) como "inválido".
export async function signUpUser(label: string) {
  const client = freshClient();
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `rls-test-${label}-${unique}@mailinator.com`;
  const password = 'SenhaTeste123!';

  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) {
    throw new Error(
      'signUp não retornou sessão — confirme "Confirm email" DESLIGADO e o provider de ' +
        'e-mail habilitado em Authentication > Sign In / Providers > Email no projeto de teste.'
    );
  }
  return { client, userId: data.session.user.id, email, unique };
}

// Conta que também vira síndico do próprio condomínio (fluxo completo
// de onboarding: signup -> create_own_condominio).
export async function signUpSindico(label: string) {
  const base = await signUpUser(label);
  const { data: condominioId, error } = await base.client.rpc('create_own_condominio', {
    p_name: `Condomínio Teste ${label} ${base.unique}`,
  });
  if (error) throw error;
  return { ...base, condominioId: condominioId as string };
}
