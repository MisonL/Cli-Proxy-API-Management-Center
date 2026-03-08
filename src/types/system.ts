export type SelfCheckStatus = 'ok' | 'warn' | 'error';

export interface SelfCheckItem {
  id: string;
  status: SelfCheckStatus;
  title: string;
  message: string;
  details?: string;
  suggestion?: string;
}

export interface SelfCheckResponse {
  summary?: {
    ok?: number;
    warn?: number;
    error?: number;
  };
  checks?: SelfCheckItem[];
}

export interface UsagePersistenceStatus {
  enabled?: boolean;
  file_path?: string;
  file_exists?: boolean;
  file_size_bytes?: number;
  last_modified_at?: string;
  last_flush_at?: string;
  last_load_at?: string;
  last_load_added?: number;
  last_load_skipped?: number;
  last_error?: string;
  last_error_at?: string;
}
