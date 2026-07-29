-- ============================================================
-- Fase 1 (Confiabilidade) — índices de performance.
--
-- O schema não tinha nenhum índice em condominio_id, apesar de ser o
-- filtro usado por praticamente toda policy de RLS (toda leitura passa
-- por "condominio_id = current_condominio_id()"). Sem índice, isso vira
-- um sequential scan por tabela à medida que o volume de dados cresce.
--
-- "if not exists" e sem "concurrently" (migrations do Supabase às
-- vezes rodam dentro de uma transação, e CREATE INDEX CONCURRENTLY não
-- pode rodar dentro de uma transação) — em tabelas do tamanho atual
-- isso é rápido; se o volume já estiver grande na hora de aplicar,
-- rodar CONCURRENTLY manualmente fora de transação é mais seguro.
-- ============================================================

create index if not exists occurrences_condominio_id_idx on public.occurrences (condominio_id);
create index if not exists tasks_condominio_id_idx on public.tasks (condominio_id);
create index if not exists documents_condominio_id_idx on public.documents (condominio_id);
create index if not exists comments_condominio_id_idx on public.comments (condominio_id);
create index if not exists notifications_condominio_id_idx on public.notifications (condominio_id);
create index if not exists maintenance_records_condominio_id_idx on public.maintenance_records (condominio_id);
create index if not exists checklist_entries_condominio_id_idx on public.checklist_entries (condominio_id);
create index if not exists service_requests_condominio_id_idx on public.service_requests (condominio_id);
create index if not exists maintenance_items_condominio_id_idx on public.maintenance_items (condominio_id);
create index if not exists checklist_templates_condominio_id_idx on public.checklist_templates (condominio_id);
create index if not exists fornecedores_condominio_id_idx on public.fornecedores (condominio_id);
create index if not exists whatsapp_messages_condominio_id_idx on public.whatsapp_messages (condominio_id);
create index if not exists profiles_condominio_id_idx on public.profiles (condominio_id);

-- Índices auxiliares pras novas colunas de soft delete, já que o
-- select agora filtra por deleted_at is null na maioria dos casos.
create index if not exists occurrences_deleted_at_idx on public.occurrences (deleted_at);
create index if not exists tasks_deleted_at_idx on public.tasks (deleted_at);
create index if not exists documents_deleted_at_idx on public.documents (deleted_at);
create index if not exists maintenance_records_deleted_at_idx on public.maintenance_records (deleted_at);
create index if not exists service_requests_deleted_at_idx on public.service_requests (deleted_at);
create index if not exists fornecedores_deleted_at_idx on public.fornecedores (deleted_at);
create index if not exists maintenance_items_deleted_at_idx on public.maintenance_items (deleted_at);
create index if not exists checklist_templates_deleted_at_idx on public.checklist_templates (deleted_at);
