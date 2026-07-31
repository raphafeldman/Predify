export type Role = 'sindico' | 'funcionario';

export type RecordType =
  | 'occurrence'
  | 'maintenance_record'
  | 'task'
  | 'checklist_entry'
  | 'document'
  | 'service_request'
  // Fase 2 — convivem com os antigos durante a migração.
  | 'incident'
  | 'work_order'
  | 'asset'
  | 'maintenance_plan'
  | 'location';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  job_title: string | null;
  phone: string | null;
  avatar_url: string | null;
  active: boolean;
  condominio_id: string;
  created_at: string;
}

export type BillingStatus = 'trialing' | 'active' | 'exempt' | 'suspended';
export type Plan = 'free' | 'paid';

export interface Condominio {
  id: string;
  name: string | null;
  cnpj: string | null;
  address: string | null;
  phone: string | null;
  administradora: string | null;
  plan: Plan;
  paid_seats: number;
  billing_status: BillingStatus;
  created_by: string | null;
  created_at: string;
}

export interface CondominioUsageStats {
  condominio_id: string;
  users_count: number;
  occurrences_count: number;
  tasks_count: number;
  maintenance_items_count: number;
  maintenance_records_count: number;
  documents_count: number;
  checklist_entries_count: number;
  service_requests_count: number;
  photos_count: number;
  photos_bytes: number;
}

export type MaintenanceFrequency =
  | 'diaria'
  | 'semanal'
  | 'mensal'
  | 'trimestral'
  | 'semestral'
  | 'anual';

export interface MaintenanceItem {
  id: string;
  name: string;
  category: string;
  frequency: MaintenanceFrequency;
  next_due_date: string;
  notes: string | null;
  location: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export type MaintenanceRecordType = 'preventiva' | 'corretiva';
export type MaintenanceRecordStatus = 'aberta' | 'em_andamento' | 'concluida';

export interface MaintenanceRecord {
  id: string;
  maintenance_item_id: string | null;
  type: MaintenanceRecordType;
  status: MaintenanceRecordStatus;
  description: string;
  photo_urls: string[];
  performed_by: string | null;
  performed_at: string;
  created_at: string;
  fornecedor_id: string | null;
  om_file_url: string | null;
  om_file_name: string | null;
  om_mime_type: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export interface Fornecedor {
  id: string;
  name: string;
  service_type: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  maintenance_item_id: string | null;
  contract_notes: string | null;
  active: boolean;
  contract_file_url: string | null;
  contract_file_name: string | null;
  contract_file_mime_type: string | null;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export interface ChecklistTemplate {
  id: string;
  title: string;
  description: string | null;
  frequency: MaintenanceFrequency;
  assigned_to: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export interface ChecklistEntry {
  id: string;
  template_id: string;
  entry_date: string;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  notes: string | null;
  photo_urls: string[];
  created_at: string;
}

export type TaskStatus = 'pendente' | 'concluida';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  photo_urls: string[];
  created_by: string | null;
  assigned_to: string | null;
  scheduled_for: string | null;
  created_at: string;
  completed_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export type OccurrenceSeverity = 'baixa' | 'media' | 'alta';
export type OccurrenceStatus = 'aberta' | 'em_andamento' | 'concluida' | 'cancelada';

// "Ocorrência" é o nome interno (tabela/tipo) da Ordem de Serviço — ver
// lib/categories.ts para o dicionário de categorias.
export interface Occurrence {
  id: string;
  os_number: number;
  title: string;
  description: string;
  severity: OccurrenceSeverity;
  status: OccurrenceStatus;
  category: string;
  estimated_cost: number | null;
  photo_urls: string[];
  created_by: string | null;
  assigned_to: string | null;
  created_at: string;
  resolved_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export interface DocumentItem {
  id: string;
  title: string;
  category: string;
  file_url: string;
  file_name: string | null;
  mime_type: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export interface Comment {
  id: string;
  record_type: RecordType;
  record_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  record_type: RecordType | null;
  record_id: string | null;
  read: boolean;
  created_at: string;
}

export interface PushToken {
  id: string;
  user_id: string;
  expo_push_token: string;
  created_at: string;
}

export type ServiceRequestStatus =
  | 'aberta'
  | 'orcamento_solicitado'
  | 'orcado'
  | 'aprovado'
  | 'concluido'
  | 'cancelado';

export interface ServiceRequest {
  id: string;
  occurrence_id: string | null;
  title: string;
  category: string;
  status: ServiceRequestStatus;
  provider_name: string | null;
  provider_contact: string | null;
  quote_value: number | null;
  notes: string | null;
  photo_urls: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export type AuditEventAction =
  | 'created'
  | 'status_changed'
  | 'assignee_changed'
  | 'due_date_changed'
  | 'cost_changed'
  | 'deleted'
  | 'restored';

export interface AuditEvent {
  id: string;
  condominio_id: string;
  record_type: RecordType;
  record_id: string;
  action: AuditEventAction;
  actor_id: string | null;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

// ============================================================
// Fase 2 — Domínio de Manutenção
//
// Estas entidades convivem com as antigas (MaintenanceItem, Occurrence,
// MaintenanceRecord) durante toda a migração. As tabelas antigas seguem
// sendo a fonte da verdade até a Fase 2D cortar cada tela.
// ============================================================

export type LocationKind = 'bloco' | 'pavimento' | 'area' | 'ambiente';

export interface Location {
  id: string;
  condominio_id: string;
  parent_id: string | null;
  name: string;
  kind: LocationKind;
  code: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export type AssetCriticality = 'baixa' | 'media' | 'alta' | 'critica';
export type AssetOperationalStatus = 'operando' | 'parado' | 'manutencao' | 'desativado';

export interface Asset {
  id: string;
  condominio_id: string;
  asset_code: string | null;
  name: string;
  description: string | null;
  category: string;
  location_id: string | null;
  /** Texto livre herdado de MaintenanceItem.location, preservado na migração. */
  location_text: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  installation_date: string | null;
  warranty_until: string | null;
  criticality: AssetCriticality;
  operational_status: AssetOperationalStatus;
  responsible_user_id: string | null;
  supplier_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export type MaintenancePlanType = 'preventiva' | 'preditiva' | 'inspecao';

/** Além das 6 frequências herdadas, inclui gatilhos não-temporais que
 * ainda não têm interface — disponíveis no banco para fases futuras. */
export type MaintenanceFrequencyType =
  | 'diaria'
  | 'semanal'
  | 'quinzenal'
  | 'mensal'
  | 'bimestral'
  | 'trimestral'
  | 'semestral'
  | 'anual'
  | 'data_especifica'
  | 'medidor'
  | 'horas_funcionamento';

export interface MaintenancePlan {
  id: string;
  condominio_id: string;
  asset_id: string | null;
  location_id: string | null;
  name: string;
  description: string | null;
  maintenance_type: MaintenancePlanType;
  frequency_type: MaintenanceFrequencyType;
  frequency_interval: number;
  next_due_at: string | null;
  lead_time_days: number;
  responsible_user_id: string | null;
  supplier_id: string | null;
  estimated_duration_minutes: number | null;
  estimated_cost: number | null;
  active: boolean;
  // Preenchido só nos planos nascidos da migração da Fase 2B: aponta
  // para o maintenance_items de origem. Nulo em plano criado pelo app.
  legacy_maintenance_item_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export type StepResponseType =
  | 'confirmacao'
  | 'sim_nao'
  | 'texto'
  | 'numero'
  | 'medidor'
  | 'selecao'
  | 'foto'
  | 'arquivo'
  | 'assinatura';

export interface MaintenancePlanStep {
  id: string;
  plan_id: string;
  order_index: number;
  title: string;
  instruction: string | null;
  response_type: StepResponseType;
  options: string[];
  required: boolean;
  min_value: number | null;
  max_value: number | null;
  requires_evidence: boolean;
  creates_nonconformity: boolean;
  created_at: string;
}

export type IncidentStatus =
  | 'nova'
  | 'em_triagem'
  | 'aguardando_info'
  | 'encaminhada'
  | 'resolvida_sem_os'
  | 'convertida_em_os'
  | 'encerrada'
  | 'cancelada'
  | 'reaberta';

export interface Incident {
  id: string;
  condominio_id: string;
  number: number | null;
  title: string;
  description: string;
  category: string;
  severity: OccurrenceSeverity;
  status: IncidentStatus;
  asset_id: string | null;
  location_id: string | null;
  photo_urls: string[];
  reported_by: string | null;
  triaged_by: string | null;
  triaged_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export type WorkOrderOrigin = 'incidente' | 'preventiva' | 'inspecao' | 'solicitacao_direta';
export type WorkOrderPriority = 'baixa' | 'media' | 'alta' | 'urgente';

/** O banco aceita 16 estados; a interface expõe os 8 principais mais
 * cancelada/reaberta. Os demais ficam disponíveis para ativação futura
 * sem nova migration. */
export type WorkOrderStatus =
  | 'rascunho'
  | 'aberta'
  | 'em_triagem'
  | 'aguardando_aprovacao'
  | 'aguardando_orcamento'
  | 'aprovada'
  | 'programada'
  | 'em_execucao'
  | 'pausada'
  | 'aguardando_material'
  | 'aguardando_fornecedor'
  | 'concluida'
  | 'aguardando_validacao'
  | 'encerrada'
  | 'cancelada'
  | 'reaberta';

export interface WorkOrder {
  id: string;
  condominio_id: string;
  number: number | null;
  origin_type: WorkOrderOrigin;
  incident_id: string | null;
  maintenance_plan_id: string | null;
  asset_id: string | null;
  location_id: string | null;
  title: string;
  description: string;
  category: string;
  priority: WorkOrderPriority;
  criticality: AssetCriticality;
  status: WorkOrderStatus;
  requested_by: string | null;
  assigned_user_id: string | null;
  supplier_id: string | null;
  due_at: string | null;
  sla_minutes: number | null;
  started_at: string | null;
  completed_at: string | null;
  validated_at: string | null;
  validated_by: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  cancellation_reason: string | null;
  reopening_reason: string | null;
  // De qual tabela antiga esta ordem foi migrada na Fase 2B; nulo
  // quando foi criada direto no modelo novo.
  legacy_table: 'occurrences' | 'maintenance_records' | null;
  // Para qual vencimento do plano esta ordem foi gerada. É o que impede
  // o gerador de criar duas ordens do mesmo ciclo.
  plan_cycle_date: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export type EvidenceKind =
  | 'foto_antes'
  | 'foto_durante'
  | 'foto_depois'
  | 'om_fornecedor'
  | 'nota_fiscal'
  | 'relatorio'
  | 'laudo'
  | 'assinatura'
  | 'outro';

export interface WorkOrderEvidence {
  id: string;
  work_order_id: string;
  kind: EvidenceKind;
  file_url: string;
  file_name: string | null;
  mime_type: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
}

// Resposta de uma etapa do checklist numa ordem concreta.
// maintenance_plan_steps é o modelo; isto é o que foi de fato
// respondido. Guarda cópia de título e tipo porque o plano pode ser
// editado depois — um laudo não muda retroativamente porque alguém
// renomeou a etapa.
export interface WorkOrderStepResult {
  id: string;
  work_order_id: string;
  plan_step_id: string | null;
  order_index: number;
  title: string;
  response_type: StepResponseType;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  file_urls: string[];
  // Falso quando a resposta viola a faixa configurada na etapa; é o que
  // dispara a não conformidade.
  conforme: boolean;
  notes: string | null;
  answered_by: string | null;
  answered_at: string;
}
