export type Role = 'sindico' | 'funcionario';

export type RecordType =
  | 'occurrence'
  | 'maintenance_record'
  | 'task'
  | 'checklist_entry'
  | 'document';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
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
  created_by: string;
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
  performed_by: string;
  performed_at: string;
  created_at: string;
}

export interface ChecklistTemplate {
  id: string;
  title: string;
  description: string | null;
  active: boolean;
  created_by: string;
  created_at: string;
}

export interface ChecklistEntry {
  id: string;
  template_id: string;
  entry_date: string;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  created_at: string;
}

export type TaskStatus = 'pendente' | 'concluida';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  photo_urls: string[];
  created_by: string;
  assigned_to: string | null;
  created_at: string;
  completed_at: string | null;
}

export type OccurrenceSeverity = 'baixa' | 'media' | 'alta';
export type OccurrenceStatus = 'aberta' | 'resolvida';

export interface Occurrence {
  id: string;
  title: string;
  description: string;
  severity: OccurrenceSeverity;
  status: OccurrenceStatus;
  photo_urls: string[];
  created_by: string;
  created_at: string;
  resolved_at: string | null;
}

export interface DocumentPhoto {
  id: string;
  title: string;
  category: string;
  photo_url: string;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface Comment {
  id: string;
  record_type: RecordType;
  record_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface PushToken {
  id: string;
  user_id: string;
  expo_push_token: string;
  created_at: string;
}
