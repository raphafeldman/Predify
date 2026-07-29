import { defineConfig } from 'vitest/config';

// Testes unitários de lógica pura (lib/*.ts), sem montar componentes React
// Native nem depender de um Supabase real — ver supabase/migrations/README.md
// para o que fica de fora aqui (isolamento multi-tenant precisa de um banco).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
