import type { PostgrestError } from '@supabase/supabase-js';

// Mesmo cuidado do getInvokeErrorMessage (lib/supabase.ts): error.message
// pode vir vazio dependendo do tipo de erro do Postgrest, por isso sempre
// cai num fallback legível em vez de mostrar nada ou "undefined".
export function supabaseErrorMessage(
  error: PostgrestError | null,
  fallback: string
): string | null {
  if (!error) return null;
  return error.message || fallback;
}
