/**
 * 凭证相关类型
 * 基于原项目凭证模块迁移并收口为 credentials 语义
 */

export type CredentialType =
  | 'qwen'
  | 'kimi'
  | 'gemini'
  | 'gemini-cli'
  | 'aistudio'
  | 'claude'
  | 'codex'
  | 'antigravity'
  | 'iflow'
  | 'vertex'
  | 'empty'
  | 'unknown';

export interface CredentialItem {
  id?: string;
  name: string;
  type?: CredentialType | string;
  provider?: string;
  runtimeId?: string;
  size?: number;
  selectionKey?: string | number | null;
  runtimeOnly?: boolean | string;
  disabled?: boolean;
  unavailable?: boolean;
  status?: string;
  statusMessage?: string;
  quotaExceeded?: boolean;
  quotaReason?: string;
  quotaNextRecoverAt?: string | number;
  quotaBackoffLevel?: number;
  lastRefresh?: string | number;
  lastActiveAt?: string | number | null;
  modified?: number;
  requests24h?: number;
  requests7d?: number;
  failures24h?: number;
  failureRate24h?: number;
  totalTokens24h?: number;
  totalTokens7d?: number;
  healthPercent?: number | null;
  conservativeRiskDays?: number | null;
  avgDailyQuotaBurnPercent?: number | null;
  snapshotMode?: string;
  accountKey?: string;
  accountEmail?: string;
  platformBacked?: boolean;
  [key: string]: unknown;
}

export interface CredentialsResponse {
  files: CredentialItem[];
  total?: number;
  page?: number;
  pageSize?: number;
  providerFacets?: Record<string, number>;
  platformBacked?: boolean;
}
