-- ============================================================
-- Fase 2B — execução do backfill.
--
-- Separada da migration que define as funções por dois motivos:
--   1. mover dados é re-executável; criar função não precisa ser;
--   2. se a cópia falhar, o erro não leva junto a definição das
--      funções — dá para investigar chamando a RPC e lendo a mensagem
--      real do Postgres, em vez de um erro genérico de migration.
--
-- Reexecutar esta cópia a qualquer momento é seguro e esperado: até a
-- Fase 2D cortar as telas, as gravações continuam indo para as tabelas
-- antigas, e o espelho novo precisa ser atualizado antes de cada corte.
-- ============================================================

select public.fase2_backfill();
