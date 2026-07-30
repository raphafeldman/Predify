import { defineConfig } from 'vitest/config';

// lib/**: testes unitários de lógica pura, sem depender de nada externo.
// supabase/tests/**: testes de integração/RLS contra um projeto Supabase
// de teste — pulados automaticamente (describe.skipIf) quando .env.test
// não existe, então não quebram `npm test` em máquinas sem esse projeto
// configurado. Ver supabase/tests/rls-isolation.test.ts e .env.test.example.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'supabase/tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});
