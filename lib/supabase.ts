import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, FunctionsHttpError } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY precisam estar definidos em um arquivo .env na raiz do projeto (veja .env.example).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// supabase.functions.invoke() não expõe a mensagem de erro que a Edge
// Function devolveu quando o status não é 2xx — o `error.message` vem
// sempre com o texto genérico "Edge Function returned a non-2xx status
// code". A mensagem de verdade (o `{ error: "..." }` que as functions
// deste projeto retornam) está em `error.context`, que é a Response bruta
// e precisa ser lida à parte.
export async function getInvokeErrorMessage(
  invokeError: unknown,
  data: unknown
): Promise<string | null> {
  if (invokeError) {
    if (invokeError instanceof FunctionsHttpError) {
      try {
        const body = await invokeError.context.json();
        if (body?.error) return body.error as string;
      } catch {
        // corpo não veio em JSON — cai pro fallback abaixo
      }
    }
    return (invokeError instanceof Error && invokeError.message) || 'Erro inesperado.';
  }
  return (data as { error?: string } | null)?.error ?? null;
}
