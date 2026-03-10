/**
 * 凭证与 OAuth 排除模型相关 API
 */

import { apiClient } from './client';
import { platformApi } from './platform';
import type { CredentialItem, CredentialsResponse } from '@/types/credential';
import type { OAuthModelAliasEntry } from '@/types';

type StatusError = { status?: number };
type CredentialStatusResponse = { status: string; disabled: boolean };
export type CredentialApiTarget = Pick<
  CredentialItem,
  'name' | 'id' | 'runtimeId' | 'platformBacked'
>;
export type CredentialsListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  provider?: string;
  status?: string;
  activity?: string;
  sort?: string;
};

export const CREDENTIAL_INVALID_JSON_OBJECT_ERROR = 'CREDENTIAL_INVALID_JSON_OBJECT';

const getStatusCode = (err: unknown): number | undefined => {
  if (!err || typeof err !== 'object') return undefined;
  if ('status' in err) return (err as StatusError).status;
  return undefined;
};

const parseCredentialJsonObject = (rawText: string): Record<string, unknown> => {
  const trimmed = rawText.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(CREDENTIAL_INVALID_JSON_OBJECT_ERROR);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(CREDENTIAL_INVALID_JSON_OBJECT_ERROR);
  }

  return { ...(parsed as Record<string, unknown>) };
};

const normalizePlatformCredentialRow = (value: Record<string, unknown>): CredentialItem | null => {
  const id = String(value.id ?? '').trim();
  const name = String(value.credential_name ?? '').trim();
  if (!id || !name) return null;

  const updatedAtRaw = String(value.updated_at ?? '').trim();
  const updatedAtMs = updatedAtRaw ? Date.parse(updatedAtRaw) : Number.NaN;
  const lastRefreshRaw = String(value.last_refresh_at ?? '').trim();
  const lastSeenValue = value.last_seen_at;
  const runtimeOnlyValue = value.runtime_only;
  const selectionKeyValue = value.selection_key;
  const runtimeID =
    typeof value.runtime_id === 'string' && value.runtime_id.trim()
      ? value.runtime_id.trim()
      : undefined;

  return {
    id,
    name,
    runtimeId: runtimeID,
    type: String(value.provider ?? '').trim() || String(value.type ?? '').trim() || 'unknown',
    provider: String(value.provider ?? '').trim() || 'unknown',
    label: value.label,
    selectionKey:
      typeof selectionKeyValue === 'string' || typeof selectionKeyValue === 'number'
        ? selectionKeyValue
        : selectionKeyValue === null
          ? null
          : undefined,
    disabled: value.disabled === true,
    unavailable: value.unavailable === true,
    runtimeOnly:
      typeof runtimeOnlyValue === 'boolean' || typeof runtimeOnlyValue === 'string'
        ? runtimeOnlyValue
        : undefined,
    status: typeof value.status === 'string' ? value.status : undefined,
    statusMessage: typeof value.status_message === 'string' ? value.status_message : undefined,
    quotaExceeded: value.quota_exceeded === true,
    lastRefresh: lastRefreshRaw || undefined,
    lastActiveAt:
      typeof lastSeenValue === 'string' || typeof lastSeenValue === 'number'
        ? lastSeenValue
        : lastSeenValue === null
          ? null
          : undefined,
    modified: Number.isNaN(updatedAtMs) ? undefined : updatedAtMs,
    requests24h: Number(value.requests_24h ?? 0) || 0,
    requests7d: Number(value.requests_7d ?? 0) || 0,
    failures24h: Number(value.failures_24h ?? 0) || 0,
    failureRate24h: Number(value.failure_rate_24h ?? 0) || 0,
    totalTokens24h: Number(value.total_tokens_24h ?? 0) || 0,
    totalTokens7d: Number(value.total_tokens_7d ?? 0) || 0,
    healthPercent:
      value.health_percent === null || value.health_percent === undefined
        ? null
        : Number(value.health_percent),
    conservativeRiskDays:
      value.conservative_risk_days === null || value.conservative_risk_days === undefined
        ? null
        : Number(value.conservative_risk_days),
    avgDailyQuotaBurnPercent:
      value.avg_daily_quota_burn_percent === null ||
      value.avg_daily_quota_burn_percent === undefined
        ? null
        : Number(value.avg_daily_quota_burn_percent),
    snapshotMode: typeof value.snapshot_mode === 'string' ? value.snapshot_mode : undefined,
    accountKey: typeof value.account_key === 'string' ? value.account_key : undefined,
    accountEmail: typeof value.account_email === 'string' ? value.account_email : undefined,
    platformBacked: true,
  };
};

const requirePlatformTarget = (
  target: CredentialApiTarget
): Pick<CredentialItem, 'name' | 'id' | 'runtimeId' | 'platformBacked'> => {
  if (!target.platformBacked) {
    throw new Error('PLATFORM_CREDENTIAL_TARGET_REQUIRED');
  }
  return target;
};

const getPlatformCredentialID = (target: CredentialApiTarget): string => {
  const normalized = requirePlatformTarget(target);
  const credentialID = String(normalized.id ?? '').trim();
  if (!credentialID) {
    throw new Error('PLATFORM_CREDENTIAL_ID_REQUIRED');
  }
  return credentialID;
};

const resolveDownloadText = async (target: CredentialApiTarget): Promise<string> => {
  return platformApi.downloadCredentialText(getPlatformCredentialID(target));
};

const normalizeProviderFacets = (value: unknown): Record<string, number> => {
  if (!Array.isArray(value)) return {};

  return value.reduce<Record<string, number>>((acc, item) => {
    if (!item || typeof item !== 'object') return acc;
    const record = item as Record<string, unknown>;
    const provider = String(record.provider ?? '')
      .trim()
      .toLowerCase();
    if (!provider) return acc;
    const count = Number(record.count ?? 0);
    acc[provider] = Number.isFinite(count) && count >= 0 ? count : 0;
    return acc;
  }, {});
};

export const isCredentialInvalidJsonObjectError = (err: unknown): boolean =>
  err instanceof Error && err.message === CREDENTIAL_INVALID_JSON_OBJECT_ERROR;

const normalizeOauthExcludedModels = (payload: unknown): Record<string, string[]> => {
  if (!payload || typeof payload !== 'object') return {};

  const record = payload as Record<string, unknown>;
  const source = record['oauth-excluded-models'] ?? record.items ?? payload;
  if (!source || typeof source !== 'object') return {};

  const result: Record<string, string[]> = {};

  Object.entries(source as Record<string, unknown>).forEach(([provider, models]) => {
    const key = String(provider ?? '')
      .trim()
      .toLowerCase();
    if (!key) return;

    const rawList = Array.isArray(models)
      ? models
      : typeof models === 'string'
        ? models.split(/[\n,]+/)
        : [];

    const seen = new Set<string>();
    const normalized: string[] = [];
    rawList.forEach((item) => {
      const trimmed = String(item ?? '').trim();
      if (!trimmed) return;
      const modelKey = trimmed.toLowerCase();
      if (seen.has(modelKey)) return;
      seen.add(modelKey);
      normalized.push(trimmed);
    });

    result[key] = normalized;
  });

  return result;
};

const normalizeOauthModelAlias = (payload: unknown): Record<string, OAuthModelAliasEntry[]> => {
  if (!payload || typeof payload !== 'object') return {};

  const record = payload as Record<string, unknown>;
  const source = record['oauth-model-alias'] ?? record.items ?? payload;
  if (!source || typeof source !== 'object') return {};

  const result: Record<string, OAuthModelAliasEntry[]> = {};

  Object.entries(source as Record<string, unknown>).forEach(([channel, mappings]) => {
    const key = String(channel ?? '')
      .trim()
      .toLowerCase();
    if (!key) return;
    if (!Array.isArray(mappings)) return;

    const seen = new Set<string>();
    const normalized = mappings
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const entry = item as Record<string, unknown>;
        const name = String(entry.name ?? entry.id ?? entry.model ?? '').trim();
        const alias = String(entry.alias ?? '').trim();
        if (!name || !alias) return null;
        const fork = entry.fork === true;
        return fork ? { name, alias, fork } : { name, alias };
      })
      .filter(Boolean)
      .filter((entry) => {
        const aliasEntry = entry as OAuthModelAliasEntry;
        const dedupeKey = `${aliasEntry.name.toLowerCase()}::${aliasEntry.alias.toLowerCase()}::${aliasEntry.fork ? '1' : '0'}`;
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      }) as OAuthModelAliasEntry[];

    if (normalized.length) {
      result[key] = normalized;
    }
  });

  return result;
};

const OAUTH_MODEL_ALIAS_ENDPOINT = '/oauth-model-alias';

export const credentialsApi = {
  async list(params: CredentialsListParams = {}): Promise<CredentialsResponse> {
    const payload = await platformApi.listCredentials({
      page: params.page,
      pageSize: params.pageSize ?? 500,
      search: params.search,
      provider: params.provider,
      status: params.status,
      activity: params.activity,
      sort: params.sort,
    });
    const files = Array.isArray(payload?.items)
      ? payload.items
          .map((item) => normalizePlatformCredentialRow(item as unknown as Record<string, unknown>))
          .filter((item): item is CredentialItem => item !== null)
      : [];
    return {
      files,
      total: Number(payload?.total ?? files.length),
      page: Number(payload?.page ?? params.page ?? 1),
      pageSize: Number(payload?.page_size ?? params.pageSize ?? files.length),
      providerFacets: normalizeProviderFacets(payload?.provider_facets),
      platformBacked: true,
    };
  },

  async setStatus(
    target: CredentialApiTarget,
    disabled: boolean
  ): Promise<CredentialStatusResponse> {
    return platformApi.updateCredentialStatus(getPlatformCredentialID(target), disabled);
  },

  upload: (file: File) => platformApi.importCredential(file),

  deleteFile: (target: CredentialApiTarget) =>
    platformApi.deleteCredential(getPlatformCredentialID(target)),

  deleteAll: () => {
    throw new Error('PLATFORM_DELETE_ALL_UNSUPPORTED');
  },

  downloadText: (target: CredentialApiTarget) => resolveDownloadText(target),

  async downloadJsonObject(target: CredentialApiTarget): Promise<Record<string, unknown>> {
    const rawText = await credentialsApi.downloadText(target);
    return parseCredentialJsonObject(rawText);
  },

  saveText: (target: CredentialApiTarget, text: string) =>
    platformApi.updateCredentialText(getPlatformCredentialID(target), text),

  saveJsonObject: (target: CredentialApiTarget, json: Record<string, unknown>) =>
    credentialsApi.saveText(target, JSON.stringify(json)),

  // OAuth 排除模型
  async getOauthExcludedModels(): Promise<Record<string, string[]>> {
    const data = await apiClient.get('/oauth-excluded-models');
    return normalizeOauthExcludedModels(data);
  },

  saveOauthExcludedModels: (provider: string, models: string[]) =>
    apiClient.patch('/oauth-excluded-models', { provider, models }),

  deleteOauthExcludedEntry: (provider: string) =>
    apiClient.delete(`/oauth-excluded-models?provider=${encodeURIComponent(provider)}`),

  replaceOauthExcludedModels: (map: Record<string, string[]>) =>
    apiClient.put('/oauth-excluded-models', normalizeOauthExcludedModels(map)),

  // OAuth 模型别名
  async getOauthModelAlias(): Promise<Record<string, OAuthModelAliasEntry[]>> {
    const data = await apiClient.get(OAUTH_MODEL_ALIAS_ENDPOINT);
    return normalizeOauthModelAlias(data);
  },

  saveOauthModelAlias: async (channel: string, aliases: OAuthModelAliasEntry[]) => {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();
    const normalizedAliases =
      normalizeOauthModelAlias({ [normalizedChannel]: aliases })[normalizedChannel] ?? [];
    await apiClient.patch(OAUTH_MODEL_ALIAS_ENDPOINT, {
      channel: normalizedChannel,
      aliases: normalizedAliases,
    });
  },

  deleteOauthModelAlias: async (channel: string) => {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();

    try {
      await apiClient.patch(OAUTH_MODEL_ALIAS_ENDPOINT, {
        channel: normalizedChannel,
        aliases: [],
      });
    } catch (err: unknown) {
      const status = getStatusCode(err);
      if (status !== 405) throw err;
      await apiClient.delete(
        `${OAUTH_MODEL_ALIAS_ENDPOINT}?channel=${encodeURIComponent(normalizedChannel)}`
      );
    }
  },

  // 获取认证凭证支持的模型
  async getModelsForCredential(
    target: CredentialApiTarget
  ): Promise<{ id: string; display_name?: string; type?: string; owned_by?: string }[]> {
    return platformApi.getCredentialModels(getPlatformCredentialID(target));
  },

  // 获取指定 channel 的模型定义
  async getModelDefinitions(
    channel: string
  ): Promise<{ id: string; display_name?: string; type?: string; owned_by?: string }[]> {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();
    if (!normalizedChannel) return [];
    const data = await apiClient.get<Record<string, unknown>>(
      `/model-definitions/${encodeURIComponent(normalizedChannel)}`
    );
    const models = data.models ?? data['models'];
    return Array.isArray(models)
      ? (models as { id: string; display_name?: string; type?: string; owned_by?: string }[])
      : [];
  },
};
