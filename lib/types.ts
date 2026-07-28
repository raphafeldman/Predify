export type Role = 'sindico' | 'funcionario';

export type RecordType =
  | 'occurrence'
  | 'maintenance_record'
  | 'task'
  | 'checklist_entry'
  | 'document'
  | 'service_request';

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
  created_by: string | null;
  created_at: string;
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
}
