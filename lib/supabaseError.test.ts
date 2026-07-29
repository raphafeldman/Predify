import { describe, expect, it } from 'vitest';
import { supabaseErrorMessage } from './supabaseError';
import type { PostgrestError } from '@supabase/supabase-js';

function fakePostgrestError(message: string): PostgrestError {
  return { name: 'PostgrestError', message, details: '', hint: '', code: '' } as unknown as PostgrestError;
}

describe('supabaseErrorMessage', () => {
  it('retorna null quando não há erro', () => {
    expect(supabaseErrorMessage(null, 'fallback')).toBeNull();
  });

  it('retorna a mensagem do erro quando ela existe', () => {
    expect(supabaseErrorMessage(fakePostgrestError('linha duplicada'), 'fallback')).toBe(
      'linha duplicada'
    );
  });

  it('usa o fallback quando error.message vem vazio', () => {
    expect(supabaseErrorMessage(fakePostgrestError(''), 'fallback')).toBe('fallback');
  });
});
