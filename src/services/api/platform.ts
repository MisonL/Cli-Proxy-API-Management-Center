import { apiClient } from './client';

export interface PlatformStatusResponse {
  enabled: boolean;
  role: string;
  database_schema: string;
  tenant_slug: string;
  workspace_slug: string;
  nats_stream: string;
  cache_prefix: string;
  connected_at: string;
}

export interface PlatformWindowStat {
  id: string;
  label: string;
  request_count: number;
  token_count: number;
  failure_count: number;
  failure_rate: number;
  active_credential_count: number;
  active_pool_percent: number;
  avg_daily_requests: number;
  avg_daily_tokens: number;
}

export interface PlatformHistogramDataset {
  id: string;
  label: string;
  color: string;
  counts: number[];
  average_remaining?: number | null;
  bucket_items?: Array<
    Array<{
      credential_id: string;
      credential_name?: string;
      remaining_percent: number;
      reset_at?: string | null;
    }>
  >;
}

export interface HistogramBucketItemRow {
  credential_id: string;
  credential_name?: string;
  remaining_percent: number;
  reset_at?: string | null;
  disabled: boolean;
  unavailable: boolean;
  quota_exceeded: boolean;
}

export interface HistogramBucketItemsResponse {
  provider: string;
  dataset_id: string;
  bucket_index: number;
  total: number;
  page: number;
  page_size: number;
  items: HistogramBucketItemRow[];
  generated_at: string;
}

export interface ProviderOverviewResponse {
  provider: string;
  mode: string;
  total_credentials: number;
  active_credentials: number;
  disabled_credentials: number;
  unavailable_credentials: number;
  loaded_credentials: number;
  failed_quota_credentials: number;
  histogram_labels: string[];
  histogram_datasets: PlatformHistogramDataset[];
  window_stats: PlatformWindowStat[];
  conservative_health?: number | null;
  average_health?: number | null;
  operational_health?: number | null;
  conservative_risk_days?: number | null;
  average_risk_days?: number | null;
  avg_daily_quota_burn_percent?: number | null;
  active_pool_percent_7d: number;
  note: string;
  warnings: Array<{ id: string; level: string; message: string }>;
  generated_at: string;
}

export interface ProviderCredentialRow {
  id: string;
  runtime_id?: string;
  credential_name?: string;
  selection_key?: string;
  provider: string;
  label: string;
  account_key: string;
  account_email: string;
  status: string;
  status_message: string;
  disabled: boolean;
  unavailable: boolean;
  runtime_only: boolean;
  quota_exceeded: boolean;
  last_refresh_at?: string | null;
  last_seen_at?: string | null;
  updated_at: string;
  requests_24h: number;
  requests_7d: number;
  failures_24h?: number;
  failure_rate_24h: number;
  total_tokens_24h: number;
  total_tokens_7d: number;
  health_percent?: number | null;
  conservative_risk_days?: number | null;
  avg_daily_quota_burn_percent?: number | null;
  snapshot_mode: string;
}

export interface ProviderFacetRow {
  provider: string;
  count: number;
}

export interface ProviderCredentialListResponse {
  items: ProviderCredentialRow[];
  page: number;
  page_size: number;
  total: number;
  provider_facets?: ProviderFacetRow[];
}

export interface CredentialDetailResponse extends ProviderCredentialRow {
  secret_version: number;
  metadata: Record<string, unknown>;
  dimensions: Array<{
    id: string;
    label: string;
    remaining_ratio?: number | null;
    reset_at?: string | null;
    window_seconds?: number | null;
    state: string;
    observed_at: string;
  }>;
}

export interface RequestTraceEvent {
  event_key: string;
  request_id: string;
  provider: string;
  model: string;
  runtime_id?: string;
  selection_key?: string;
  source: string;
  source_display_name: string;
  source_type: string;
  credential_id?: string;
  credential_name?: string;
  label?: string;
  requested_at: string;
  failed: boolean;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
}

export interface RequestTraceResponse {
  request_id: string;
  items: RequestTraceEvent[];
}

export interface CredentialImportResponse {
  status: string;
  credential_id: string;
  credential_name?: string;
  runtime_id?: string;
}

export interface CredentialStatusResponse {
  status: string;
  disabled: boolean;
}

export interface QuotaRefreshPolicy {
  provider: string;
  enabled: boolean;
  interval_seconds: number;
  timeout_seconds: number;
  max_parallelism: number;
  stale_after_seconds: number;
  failure_backoff_seconds: number;
}

export interface QuotaRefreshPoliciesResponse {
  policies: QuotaRefreshPolicy[];
  updated_at: string;
  source: string;
}

type ListProviderCredentialsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
};

type ListCredentialsParams = ListProviderCredentialsParams & {
  provider?: string;
  status?: string;
  activity?: string;
  sort?: string;
};

export const platformApi = {
  getStatus: () => apiClient.get<PlatformStatusResponse>('/v2/system/platform'),

  getProviderOverview: (provider: string) =>
    apiClient.get<ProviderOverviewResponse>(
      `/v2/providers/${encodeURIComponent(provider)}/overview`
    ),

  getHistogramBucketItems: (
    provider: string,
    datasetId: string,
    bucketIndex: number,
    params: { page?: number; pageSize?: number } = {}
  ) =>
    apiClient.get<HistogramBucketItemsResponse>(
      `/v2/providers/${encodeURIComponent(provider)}/histogram-bucket-items`,
      {
        params: {
          dataset_id: datasetId,
          bucket_index: bucketIndex,
          page: params.page ?? 1,
          page_size: params.pageSize ?? 200,
        },
      }
    ),

  listProviderCredentials: (provider: string, params: ListProviderCredentialsParams = {}) =>
    apiClient.get<ProviderCredentialListResponse>(
      `/v2/providers/${encodeURIComponent(provider)}/credentials`,
      {
        params: {
          page: params.page ?? 1,
          page_size: params.pageSize ?? 50,
          search: params.search ?? '',
        },
      }
    ),

  listCredentials: (params: ListCredentialsParams = {}) =>
    apiClient.get<ProviderCredentialListResponse>('/v2/credentials', {
      params: {
        page: params.page ?? 1,
        page_size: params.pageSize ?? 50,
        search: params.search ?? '',
        provider: params.provider ?? '',
        status: params.status ?? '',
        activity: params.activity ?? '',
        sort: params.sort ?? '',
      },
    }),

  getCredential: (credentialID: string) =>
    apiClient.get<CredentialDetailResponse>(`/v2/credentials/${encodeURIComponent(credentialID)}`),

  getTraceByRequestID: (requestID: string) =>
    apiClient.get<RequestTraceResponse>(`/v2/traces/${encodeURIComponent(requestID)}`),

  downloadCredentialText: async (credentialID: string): Promise<string> => {
    const response = await apiClient.getRaw(
      `/v2/credentials/${encodeURIComponent(credentialID)}/download`,
      { responseType: 'blob' }
    );
    return (response.data as Blob).text();
  },

  getCredentialModels: async (credentialID: string) => {
    const response = await apiClient.get<{
      models?: Array<{ id: string; display_name?: string; type?: string; owned_by?: string }>;
    }>(`/v2/credentials/${encodeURIComponent(credentialID)}/models`);
    return Array.isArray(response?.models) ? response.models : [];
  },

  importCredential: (file: File) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return apiClient.postForm<CredentialImportResponse>('/v2/credentials/import', formData);
  },

  updateCredentialText: (credentialID: string, text: string) =>
    apiClient.put<{ status: string }>(
      `/v2/credentials/${encodeURIComponent(credentialID)}/content`,
      text,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    ),

  updateCredentialStatus: (credentialID: string, disabled: boolean) =>
    apiClient.patch<CredentialStatusResponse>(
      `/v2/credentials/${encodeURIComponent(credentialID)}/status`,
      { disabled }
    ),

  deleteCredential: (credentialID: string) =>
    apiClient.delete<{ status: string }>(`/v2/credentials/${encodeURIComponent(credentialID)}`),

  getQuotaRefreshPolicies: () =>
    apiClient.get<QuotaRefreshPoliciesResponse>('/v2/system/quota-refresh-policies'),

  updateQuotaRefreshPolicies: (policies: QuotaRefreshPolicy[]) =>
    apiClient.put<QuotaRefreshPoliciesResponse>('/v2/system/quota-refresh-policies', { policies }),

  refreshProvider: (provider: string) =>
    apiClient.post<{ status: string }>(`/v2/providers/${encodeURIComponent(provider)}/refresh`),
};
