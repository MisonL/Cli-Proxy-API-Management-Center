/**
 * Quota configuration definitions.
 */

import React from 'react';
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import type {
  AntigravityQuotaGroup,
  AntigravityModelsPayload,
  AntigravityQuotaState,
  CredentialItem,
  ClaudeExtraUsage,
  ClaudeProfileResponse,
  ClaudeQuotaState,
  ClaudeQuotaWindow,
  ClaudeUsagePayload,
  CodexRateLimitInfo,
  CodexQuotaState,
  CodexUsageWindow,
  CodexQuotaWindow,
  CodexUsagePayload,
  GeminiCliParsedBucket,
  GeminiCliQuotaBucketState,
  GeminiCliQuotaState,
  KimiQuotaRow,
  KimiQuotaState,
} from '@/types';
import type { ApiCallBatchResult, ApiCallRequest, ApiCallResult } from '@/services/api';
import { apiCallApi, apiCallBatchApi, credentialsApi, getApiCallErrorMessage } from '@/services/api';
import {
  ANTIGRAVITY_QUOTA_URLS,
  ANTIGRAVITY_REQUEST_HEADERS,
  CLAUDE_PROFILE_URL,
  CLAUDE_USAGE_URL,
  CLAUDE_REQUEST_HEADERS,
  CLAUDE_USAGE_WINDOW_KEYS,
  CODEX_USAGE_URL,
  CODEX_REQUEST_HEADERS,
  GEMINI_CLI_QUOTA_URL,
  GEMINI_CLI_REQUEST_HEADERS,
  KIMI_USAGE_URL,
  KIMI_REQUEST_HEADERS,
  normalizeGeminiCliModelId,
  normalizeNumberValue,
  normalizePlanType,
  normalizeQuotaFraction,
  normalizeStringValue,
  parseAntigravityPayload,
  parseClaudeUsagePayload,
  parseCodexUsagePayload,
  parseGeminiCliQuotaPayload,
  parseKimiUsagePayload,
  resolveCodexChatgptAccountId,
  resolveCodexPlanType,
  resolveGeminiCliProjectId,
  formatCodexResetLabel,
  formatQuotaResetTime,
  formatKimiResetHint,
  buildAntigravityQuotaGroups,
  buildGeminiCliQuotaBuckets,
  buildKimiQuotaRows,
  createStatusError,
  getStatusFromError,
  isAntigravityFile,
  isClaudeFile,
  isCodexFile,
  isDisabledCredential,
  isGeminiCliFile,
  isKimiFile,
  isRuntimeOnlyCredential,
} from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/usage';
import type { QuotaRenderHelpers } from './QuotaCard';
import styles from '@/pages/QuotaPage.module.scss';

type QuotaUpdater<T> = T | ((prev: T) => T);

type QuotaType = 'antigravity' | 'claude' | 'codex' | 'gemini-cli' | 'kimi';

const DEFAULT_ANTIGRAVITY_PROJECT_ID = 'bamboo-precept-lgxtn';
const antigravityProjectIdCache = new Map<string, string>();

const normalizeResetAt = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const ms = numeric < 1e12 ? numeric * 1000 : numeric;
      return new Date(ms).toISOString();
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? trimmed : new Date(parsed).toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  return undefined;
};

const windowHoursFromSeconds = (value: unknown): number | null => {
  const seconds = normalizeNumberValue(value);
  if (seconds === null || seconds <= 0) return null;
  return seconds / 3600;
};

export interface QuotaStore {
  antigravityQuota: Record<string, AntigravityQuotaState>;
  claudeQuota: Record<string, ClaudeQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
  geminiCliQuota: Record<string, GeminiCliQuotaState>;
  kimiQuota: Record<string, KimiQuotaState>;
  setAntigravityQuota: (updater: QuotaUpdater<Record<string, AntigravityQuotaState>>) => void;
  setClaudeQuota: (updater: QuotaUpdater<Record<string, ClaudeQuotaState>>) => void;
  setCodexQuota: (updater: QuotaUpdater<Record<string, CodexQuotaState>>) => void;
  setGeminiCliQuota: (updater: QuotaUpdater<Record<string, GeminiCliQuotaState>>) => void;
  setKimiQuota: (updater: QuotaUpdater<Record<string, KimiQuotaState>>) => void;
  clearQuotaCache: () => void;
}

export interface QuotaConfig<TState, TData> {
  type: QuotaType;
  i18nPrefix: string;
  cardIdleMessageKey?: string;
  filterFn: (file: CredentialItem) => boolean;
  fetchQuota: (file: CredentialItem, t: TFunction) => Promise<TData>;
  fetchQuotaBatch?: (files: CredentialItem[], t: TFunction) => Promise<QuotaBatchLoadResult<TData>[]>;
  storeSelector: (state: QuotaStore) => Record<string, TState>;
  storeSetter: keyof QuotaStore;
  buildLoadingState: () => TState;
  buildSuccessState: (data: TData) => TState;
  buildErrorState: (message: string, status?: number) => TState;
  cardClassName: string;
  controlsClassName: string;
  controlClassName: string;
  gridClassName: string;
  renderQuotaItems: (quota: TState, t: TFunction, helpers: QuotaRenderHelpers) => ReactNode;
}

export interface QuotaBatchLoadResult<TData> {
  name: string;
  status: 'success' | 'error';
  data?: TData;
  error?: string;
  errorStatus?: number;
}

interface BatchRequestEntry {
  key: string;
  request: ApiCallRequest;
}

type BatchResponseParser<TData> = (
  file: CredentialItem,
  result: ApiCallResult,
  t: TFunction
) => TData;

const toBatchErrorResult = <TData>(
  name: string,
  error: string,
  errorStatus?: number
): QuotaBatchLoadResult<TData> => ({
  name,
  status: 'error',
  error,
  errorStatus,
});

const toBatchSuccessResult = <TData>(name: string, data: TData): QuotaBatchLoadResult<TData> => ({
  name,
  status: 'success',
  data,
});

const loadBatchApiResults = async (
  entries: BatchRequestEntry[]
): Promise<Map<string, ApiCallBatchResult>> => {
  if (entries.length === 0) return new Map();

  const results = await apiCallBatchApi.request({
    items: entries.map(({ key, request }) => ({
      key,
      ...request,
    })),
  });

  return new Map(results.map((item) => [item.key, item] as const));
};

const createSingleRequestBatchFetcher = <TData>(options: {
  buildRequest: (file: CredentialItem, t: TFunction) => Promise<ApiCallRequest>;
  parseResponse: BatchResponseParser<TData>;
}) => {
  return async (files: CredentialItem[], t: TFunction): Promise<QuotaBatchLoadResult<TData>[]> => {
    const pendingEntries: BatchRequestEntry[] = [];
    const localErrors = new Map<string, QuotaBatchLoadResult<TData>>();

    await Promise.all(
      files.map(async (file) => {
        try {
          const request = await options.buildRequest(file, t);
          pendingEntries.push({
            key: file.name,
            request,
          });
        } catch (err: unknown) {
          localErrors.set(
            file.name,
            toBatchErrorResult<TData>(
              file.name,
              err instanceof Error ? err.message : t('common.unknown_error'),
              getStatusFromError(err)
            )
          );
        }
      })
    );

    const batchResults = await loadBatchApiResults(pendingEntries);

    return files.map((file) => {
      const localError = localErrors.get(file.name);
      if (localError) return localError;

      const result = batchResults.get(file.name);
      if (!result) {
        return toBatchErrorResult<TData>(file.name, t('common.unknown_error'));
      }
      if (result.statusCode < 200 || result.statusCode >= 300) {
        return toBatchErrorResult<TData>(
          file.name,
          getApiCallErrorMessage(result),
          result.statusCode
        );
      }

      try {
        return toBatchSuccessResult(file.name, options.parseResponse(file, result, t));
      } catch (err: unknown) {
        return toBatchErrorResult<TData>(
          file.name,
          err instanceof Error ? err.message : t('common.unknown_error'),
          getStatusFromError(err)
        );
      }
    });
  };
};

const resolveAntigravityProjectId = async (file: CredentialItem): Promise<string> => {
  const cached = antigravityProjectIdCache.get(file.name);
  if (cached) return cached;

  try {
    const text = await credentialsApi.downloadText(file);
    const trimmed = text.trim();
    if (!trimmed) return DEFAULT_ANTIGRAVITY_PROJECT_ID;

    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const topLevel = normalizeStringValue(parsed.project_id ?? parsed.projectId);
    if (topLevel) {
      antigravityProjectIdCache.set(file.name, topLevel);
      return topLevel;
    }

    const installed =
      parsed.installed && typeof parsed.installed === 'object' && parsed.installed !== null
        ? (parsed.installed as Record<string, unknown>)
        : null;
    const installedProjectId = installed
      ? normalizeStringValue(installed.project_id ?? installed.projectId)
      : null;
    if (installedProjectId) {
      antigravityProjectIdCache.set(file.name, installedProjectId);
      return installedProjectId;
    }

    const web =
      parsed.web && typeof parsed.web === 'object' && parsed.web !== null
        ? (parsed.web as Record<string, unknown>)
        : null;
    const webProjectId = web ? normalizeStringValue(web.project_id ?? web.projectId) : null;
    if (webProjectId) {
      antigravityProjectIdCache.set(file.name, webProjectId);
      return webProjectId;
    }
  } catch {
    return DEFAULT_ANTIGRAVITY_PROJECT_ID;
  }

  antigravityProjectIdCache.set(file.name, DEFAULT_ANTIGRAVITY_PROJECT_ID);
  return DEFAULT_ANTIGRAVITY_PROJECT_ID;
};

const buildAntigravityRequest = async (
  file: CredentialItem,
  t: TFunction,
  url: string
): Promise<ApiCallRequest> => {
  const selectionKey = normalizeAuthIndex(file.selectionKey);
  if (!selectionKey) {
    throw new Error(t('antigravity_quota.missing_auth_index'));
  }

  const projectId = await resolveAntigravityProjectId(file);
  return {
    selectionKey,
    method: 'POST',
    url,
    header: { ...ANTIGRAVITY_REQUEST_HEADERS },
    data: JSON.stringify({ project: projectId }),
  };
};

const parseAntigravityQuotaResponse = (
  result: ApiCallResult,
  t: TFunction
): AntigravityQuotaGroup[] => {
  const payload = parseAntigravityPayload(result.body ?? result.bodyText);
  const models = payload?.models;
  if (!models || typeof models !== 'object' || Array.isArray(models)) {
    throw new Error(t('antigravity_quota.empty_models'));
  }

  const groups = buildAntigravityQuotaGroups(models as AntigravityModelsPayload);
  if (groups.length === 0) {
    throw new Error(t('antigravity_quota.empty_models'));
  }

  return groups;
};

const fetchAntigravityQuota = async (
  file: CredentialItem,
  t: TFunction
): Promise<AntigravityQuotaGroup[]> => {
  let lastError = '';
  let lastStatus: number | undefined;
  let priorityStatus: number | undefined;
  let hadSuccess = false;

  for (const url of ANTIGRAVITY_QUOTA_URLS) {
    try {
      const result = await apiCallApi.request(await buildAntigravityRequest(file, t, url));

      if (result.statusCode < 200 || result.statusCode >= 300) {
        lastError = getApiCallErrorMessage(result);
        lastStatus = result.statusCode;
        if (result.statusCode === 403 || result.statusCode === 404) {
          priorityStatus ??= result.statusCode;
        }
        continue;
      }

      hadSuccess = true;
      return parseAntigravityQuotaResponse(result, t);
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : t('common.unknown_error');
      const status = getStatusFromError(err);
      if (status) {
        lastStatus = status;
        if (status === 403 || status === 404) {
          priorityStatus ??= status;
        }
      }
    }
  }

  if (hadSuccess) {
    return [];
  }

  throw createStatusError(lastError || t('common.unknown_error'), priorityStatus ?? lastStatus);
};

const fetchAntigravityQuotaBatch = async (
  files: CredentialItem[],
  t: TFunction
): Promise<QuotaBatchLoadResult<AntigravityQuotaGroup[]>[]> => {
  const requestEntries: BatchRequestEntry[] = [];
  const requestKeysByFile = new Map<string, string[]>();
  const localErrors = new Map<string, QuotaBatchLoadResult<AntigravityQuotaGroup[]>>();

  await Promise.all(
    files.map(async (file) => {
      try {
        const keys: string[] = [];
        for (const [index, url] of ANTIGRAVITY_QUOTA_URLS.entries()) {
          const key = `${file.name}::${index}`;
          keys.push(key);
          requestEntries.push({
            key,
            request: await buildAntigravityRequest(file, t, url),
          });
        }
        requestKeysByFile.set(file.name, keys);
      } catch (err: unknown) {
        localErrors.set(
          file.name,
          toBatchErrorResult<AntigravityQuotaGroup[]>(
            file.name,
            err instanceof Error ? err.message : t('common.unknown_error'),
            getStatusFromError(err)
          )
        );
      }
    })
  );

  const batchResults = await loadBatchApiResults(requestEntries);

  return files.map((file) => {
    const localError = localErrors.get(file.name);
    if (localError) return localError;

    const keys = requestKeysByFile.get(file.name) ?? [];
    let lastError = '';
    let lastStatus: number | undefined;
    let priorityStatus: number | undefined;
    let hadSuccess = false;

    for (const key of keys) {
      const result = batchResults.get(key);
      if (!result) continue;

      if (result.statusCode < 200 || result.statusCode >= 300) {
        lastError = getApiCallErrorMessage(result);
        lastStatus = result.statusCode;
        if (result.statusCode === 403 || result.statusCode === 404) {
          priorityStatus ??= result.statusCode;
        }
        continue;
      }

      hadSuccess = true;
      try {
        return toBatchSuccessResult(file.name, parseAntigravityQuotaResponse(result, t));
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : t('common.unknown_error');
        const status = getStatusFromError(err);
        if (status) {
          lastStatus = status;
        }
      }
    }

    if (hadSuccess) {
      return toBatchSuccessResult(file.name, []);
    }

    return toBatchErrorResult<AntigravityQuotaGroup[]>(
      file.name,
      lastError || t('common.unknown_error'),
      priorityStatus ?? lastStatus
    );
  });
};

const buildCodexQuotaWindows = (payload: CodexUsagePayload, t: TFunction): CodexQuotaWindow[] => {
  const FIVE_HOUR_SECONDS = 18000;
  const WEEK_SECONDS = 604800;
  const WINDOW_META = {
    codeFiveHour: { id: 'five-hour', labelKey: 'codex_quota.primary_window' },
    codeWeekly: { id: 'weekly', labelKey: 'codex_quota.secondary_window' },
    codeReviewFiveHour: {
      id: 'code-review-five-hour',
      labelKey: 'codex_quota.code_review_primary_window',
    },
    codeReviewWeekly: {
      id: 'code-review-weekly',
      labelKey: 'codex_quota.code_review_secondary_window',
    },
  } as const;

  const rateLimit = payload.rate_limit ?? payload.rateLimit ?? undefined;
  const codeReviewLimit =
    payload.code_review_rate_limit ?? payload.codeReviewRateLimit ?? undefined;
  const additionalRateLimits = payload.additional_rate_limits ?? payload.additionalRateLimits ?? [];
  const windows: CodexQuotaWindow[] = [];

  const addWindow = (
    id: string,
    label: string,
    labelKey: string | undefined,
    labelParams: Record<string, string | number> | undefined,
    window?: CodexUsageWindow | null,
    limitReached?: boolean,
    allowed?: boolean
  ) => {
    if (!window) return;
    const resetLabel = formatCodexResetLabel(window);
    const usedPercentRaw = normalizeNumberValue(window.used_percent ?? window.usedPercent);
    const isLimitReached = Boolean(limitReached) || allowed === false;
    const usedPercent = usedPercentRaw ?? (isLimitReached && resetLabel !== '-' ? 100 : null);
    const resetAt =
      normalizeResetAt(window.reset_at ?? window.resetAt) ??
      (() => {
        const resetAfterSeconds = normalizeNumberValue(
          window.reset_after_seconds ?? window.resetAfterSeconds
        );
        if (resetAfterSeconds === null) return undefined;
        return new Date(Date.now() + resetAfterSeconds * 1000).toISOString();
      })();
    windows.push({
      id,
      label,
      labelKey,
      labelParams,
      usedPercent,
      resetLabel,
      resetAt,
      windowHours: windowHoursFromSeconds(window.limit_window_seconds ?? window.limitWindowSeconds),
    });
  };

  const getWindowSeconds = (window?: CodexUsageWindow | null): number | null => {
    if (!window) return null;
    return normalizeNumberValue(window.limit_window_seconds ?? window.limitWindowSeconds);
  };

  const rawLimitReached = rateLimit?.limit_reached ?? rateLimit?.limitReached;
  const rawAllowed = rateLimit?.allowed;

  const pickClassifiedWindows = (
    limitInfo?: CodexRateLimitInfo | null,
    options?: { allowOrderFallback?: boolean }
  ): { fiveHourWindow: CodexUsageWindow | null; weeklyWindow: CodexUsageWindow | null } => {
    const allowOrderFallback = options?.allowOrderFallback ?? true;
    const primaryWindow = limitInfo?.primary_window ?? limitInfo?.primaryWindow ?? null;
    const secondaryWindow = limitInfo?.secondary_window ?? limitInfo?.secondaryWindow ?? null;
    const rawWindows = [primaryWindow, secondaryWindow];

    let fiveHourWindow: CodexUsageWindow | null = null;
    let weeklyWindow: CodexUsageWindow | null = null;

    for (const window of rawWindows) {
      if (!window) continue;
      const seconds = getWindowSeconds(window);
      if (seconds === FIVE_HOUR_SECONDS && !fiveHourWindow) {
        fiveHourWindow = window;
      } else if (seconds === WEEK_SECONDS && !weeklyWindow) {
        weeklyWindow = window;
      }
    }

    // For legacy payloads without window duration, fallback to primary/secondary ordering.
    if (allowOrderFallback) {
      if (!fiveHourWindow) {
        fiveHourWindow = primaryWindow && primaryWindow !== weeklyWindow ? primaryWindow : null;
      }
      if (!weeklyWindow) {
        weeklyWindow =
          secondaryWindow && secondaryWindow !== fiveHourWindow ? secondaryWindow : null;
      }
    }

    return { fiveHourWindow, weeklyWindow };
  };

  const rateWindows = pickClassifiedWindows(rateLimit);
  addWindow(
    WINDOW_META.codeFiveHour.id,
    t(WINDOW_META.codeFiveHour.labelKey),
    WINDOW_META.codeFiveHour.labelKey,
    undefined,
    rateWindows.fiveHourWindow,
    rawLimitReached,
    rawAllowed
  );
  addWindow(
    WINDOW_META.codeWeekly.id,
    t(WINDOW_META.codeWeekly.labelKey),
    WINDOW_META.codeWeekly.labelKey,
    undefined,
    rateWindows.weeklyWindow,
    rawLimitReached,
    rawAllowed
  );

  const codeReviewWindows = pickClassifiedWindows(codeReviewLimit);
  const codeReviewLimitReached = codeReviewLimit?.limit_reached ?? codeReviewLimit?.limitReached;
  const codeReviewAllowed = codeReviewLimit?.allowed;
  addWindow(
    WINDOW_META.codeReviewFiveHour.id,
    t(WINDOW_META.codeReviewFiveHour.labelKey),
    WINDOW_META.codeReviewFiveHour.labelKey,
    undefined,
    codeReviewWindows.fiveHourWindow,
    codeReviewLimitReached,
    codeReviewAllowed
  );
  addWindow(
    WINDOW_META.codeReviewWeekly.id,
    t(WINDOW_META.codeReviewWeekly.labelKey),
    WINDOW_META.codeReviewWeekly.labelKey,
    undefined,
    codeReviewWindows.weeklyWindow,
    codeReviewLimitReached,
    codeReviewAllowed
  );

  const normalizeWindowId = (raw: string) =>
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  if (Array.isArray(additionalRateLimits)) {
    additionalRateLimits.forEach((limitItem, index) => {
      const rateInfo = limitItem?.rate_limit ?? limitItem?.rateLimit ?? null;
      if (!rateInfo) return;

      const limitName =
        normalizeStringValue(limitItem?.limit_name ?? limitItem?.limitName) ??
        normalizeStringValue(limitItem?.metered_feature ?? limitItem?.meteredFeature) ??
        `additional-${index + 1}`;

      const idPrefix = normalizeWindowId(limitName) || `additional-${index + 1}`;
      const additionalPrimaryWindow = rateInfo.primary_window ?? rateInfo.primaryWindow ?? null;
      const additionalSecondaryWindow =
        rateInfo.secondary_window ?? rateInfo.secondaryWindow ?? null;
      const additionalLimitReached = rateInfo.limit_reached ?? rateInfo.limitReached;
      const additionalAllowed = rateInfo.allowed;

      addWindow(
        `${idPrefix}-five-hour-${index}`,
        t('codex_quota.additional_primary_window', { name: limitName }),
        'codex_quota.additional_primary_window',
        { name: limitName },
        additionalPrimaryWindow,
        additionalLimitReached,
        additionalAllowed
      );
      addWindow(
        `${idPrefix}-weekly-${index}`,
        t('codex_quota.additional_secondary_window', { name: limitName }),
        'codex_quota.additional_secondary_window',
        { name: limitName },
        additionalSecondaryWindow,
        additionalLimitReached,
        additionalAllowed
      );
    });
  }

  return windows;
};

const buildCodexQuotaRequest = async (
  file: CredentialItem,
  t: TFunction
): Promise<ApiCallRequest> => {
  const rawAuthIndex = file.selectionKey;
  const selectionKey = normalizeAuthIndex(rawAuthIndex);
  if (!selectionKey) {
    throw new Error(t('codex_quota.missing_auth_index'));
  }

  const accountId = resolveCodexChatgptAccountId(file);
  if (!accountId) {
    throw new Error(t('codex_quota.missing_account_id'));
  }

  return {
    selectionKey,
    method: 'GET',
    url: CODEX_USAGE_URL,
    header: {
      ...CODEX_REQUEST_HEADERS,
      'Chatgpt-Account-Id': accountId,
    },
  };
};

const parseCodexQuotaResponse = (
  file: CredentialItem,
  result: ApiCallResult,
  t: TFunction
): { planType: string | null; windows: CodexQuotaWindow[] } => {
  const planTypeFromFile = resolveCodexPlanType(file);
  const payload = parseCodexUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('codex_quota.empty_windows'));
  }

  const planTypeFromUsage = normalizePlanType(payload.plan_type ?? payload.planType);
  const windows = buildCodexQuotaWindows(payload, t);
  return { planType: planTypeFromUsage ?? planTypeFromFile, windows };
};

const fetchCodexQuota = async (
  file: CredentialItem,
  t: TFunction
): Promise<{ planType: string | null; windows: CodexQuotaWindow[] }> => {
  const request = await buildCodexQuotaRequest(file, t);
  const result = await apiCallApi.request(request);

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  return parseCodexQuotaResponse(file, result, t);
};

const fetchCodexQuotaBatch = createSingleRequestBatchFetcher<{
  planType: string | null;
  windows: CodexQuotaWindow[];
}>({
  buildRequest: buildCodexQuotaRequest,
  parseResponse: parseCodexQuotaResponse,
});

const buildGeminiCliQuotaRequest = async (
  file: CredentialItem,
  t: TFunction
): Promise<ApiCallRequest> => {
  const rawAuthIndex = file.selectionKey;
  const selectionKey = normalizeAuthIndex(rawAuthIndex);
  if (!selectionKey) {
    throw new Error(t('gemini_cli_quota.missing_auth_index'));
  }

  const projectId = resolveGeminiCliProjectId(file);
  if (!projectId) {
    throw new Error(t('gemini_cli_quota.missing_project_id'));
  }

  return {
    selectionKey,
    method: 'POST',
    url: GEMINI_CLI_QUOTA_URL,
    header: { ...GEMINI_CLI_REQUEST_HEADERS },
    data: JSON.stringify({ project: projectId }),
  };
};

const parseGeminiCliQuotaResponse = (
  _file: CredentialItem,
  result: ApiCallResult,
  _t: TFunction
): GeminiCliQuotaBucketState[] => {
  const payload = parseGeminiCliQuotaPayload(result.body ?? result.bodyText);
  const buckets = Array.isArray(payload?.buckets) ? payload?.buckets : [];
  if (buckets.length === 0) return [];

  const parsedBuckets = buckets
    .map((bucket) => {
      const modelId = normalizeGeminiCliModelId(bucket.modelId ?? bucket.model_id);
      if (!modelId) return null;
      const tokenType = normalizeStringValue(bucket.tokenType ?? bucket.token_type);
      const remainingFractionRaw = normalizeQuotaFraction(
        bucket.remainingFraction ?? bucket.remaining_fraction
      );
      const remainingAmount = normalizeNumberValue(
        bucket.remainingAmount ?? bucket.remaining_amount
      );
      const resetTime = normalizeStringValue(bucket.resetTime ?? bucket.reset_time) ?? undefined;
      let fallbackFraction: number | null = null;
      if (remainingAmount !== null) {
        fallbackFraction = remainingAmount <= 0 ? 0 : null;
      } else if (resetTime) {
        fallbackFraction = 0;
      }
      const remainingFraction = remainingFractionRaw ?? fallbackFraction;
      return {
        modelId,
        tokenType,
        remainingFraction,
        remainingAmount,
        resetTime,
      };
    })
    .filter((bucket): bucket is GeminiCliParsedBucket => bucket !== null);

  return buildGeminiCliQuotaBuckets(parsedBuckets);
};

const fetchGeminiCliQuotaBatch = createSingleRequestBatchFetcher<GeminiCliQuotaBucketState[]>({
  buildRequest: buildGeminiCliQuotaRequest,
  parseResponse: parseGeminiCliQuotaResponse,
});

const fetchGeminiCliQuota = async (
  file: CredentialItem,
  t: TFunction
): Promise<GeminiCliQuotaBucketState[]> => {
  const result = await apiCallApi.request(await buildGeminiCliQuotaRequest(file, t));

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  return parseGeminiCliQuotaResponse(file, result, t);
};

const buildClaudeUsageRequest = async (
  file: CredentialItem,
  t: TFunction
): Promise<ApiCallRequest> => {
  const rawAuthIndex = file.selectionKey;
  const selectionKey = normalizeAuthIndex(rawAuthIndex);
  if (!selectionKey) {
    throw new Error(t('claude_quota.missing_auth_index'));
  }

  return {
    selectionKey,
    method: 'GET',
    url: CLAUDE_USAGE_URL,
    header: { ...CLAUDE_REQUEST_HEADERS },
  };
};

const buildClaudeProfileRequest = async (
  file: CredentialItem,
  t: TFunction
): Promise<ApiCallRequest> => {
  const rawAuthIndex = file.selectionKey;
  const selectionKey = normalizeAuthIndex(rawAuthIndex);
  if (!selectionKey) {
    throw new Error(t('claude_quota.missing_auth_index'));
  }

  return {
    selectionKey,
    method: 'GET',
    url: CLAUDE_PROFILE_URL,
    header: { ...CLAUDE_REQUEST_HEADERS },
  };
};

const buildClaudeQuotaData = (
  usageResult: ApiCallResult,
  profileResult: ApiCallResult | undefined,
  t: TFunction
): {
  windows: ClaudeQuotaWindow[];
  extraUsage?: ClaudeExtraUsage | null;
  planType?: string | null;
} => {
  const payload = parseClaudeUsagePayload(usageResult.body ?? usageResult.bodyText);
  if (!payload) {
    throw new Error(t('claude_quota.empty_windows'));
  }

  const windows = buildClaudeQuotaWindows(payload, t);
  const planType =
    profileResult && profileResult.statusCode >= 200 && profileResult.statusCode < 300
      ? resolveClaudePlanType(
          parseClaudeProfilePayload(profileResult.body ?? profileResult.bodyText)
        )
      : null;

  return { windows, extraUsage: payload.extra_usage, planType };
};

const fetchClaudeQuotaBatch = async (
  files: CredentialItem[],
  t: TFunction
): Promise<
  QuotaBatchLoadResult<{
    windows: ClaudeQuotaWindow[];
    extraUsage?: ClaudeExtraUsage | null;
    planType?: string | null;
  }>[]
> => {
  const requestEntries: BatchRequestEntry[] = [];
  const localErrors = new Map<
    string,
    QuotaBatchLoadResult<{
      windows: ClaudeQuotaWindow[];
      extraUsage?: ClaudeExtraUsage | null;
      planType?: string | null;
    }>
  >();

  await Promise.all(
    files.map(async (file) => {
      try {
        requestEntries.push({
          key: `${file.name}::usage`,
          request: await buildClaudeUsageRequest(file, t),
        });
        requestEntries.push({
          key: `${file.name}::profile`,
          request: await buildClaudeProfileRequest(file, t),
        });
      } catch (err: unknown) {
        localErrors.set(
          file.name,
          toBatchErrorResult(
            file.name,
            err instanceof Error ? err.message : t('common.unknown_error'),
            getStatusFromError(err)
          )
        );
      }
    })
  );

  const batchResults = await loadBatchApiResults(requestEntries);

  return files.map((file) => {
    const localError = localErrors.get(file.name);
    if (localError) return localError;

    const usageResult = batchResults.get(`${file.name}::usage`);
    if (!usageResult) {
      return toBatchErrorResult(file.name, t('common.unknown_error'));
    }
    if (usageResult.statusCode < 200 || usageResult.statusCode >= 300) {
      return toBatchErrorResult(
        file.name,
        getApiCallErrorMessage(usageResult),
        usageResult.statusCode
      );
    }

    try {
      return toBatchSuccessResult(
        file.name,
        buildClaudeQuotaData(usageResult, batchResults.get(`${file.name}::profile`), t)
      );
    } catch (err: unknown) {
      return toBatchErrorResult(
        file.name,
        err instanceof Error ? err.message : t('common.unknown_error'),
        getStatusFromError(err)
      );
    }
  });
};

const fetchClaudeQuota = async (
  file: CredentialItem,
  t: TFunction
): Promise<{
  windows: ClaudeQuotaWindow[];
  extraUsage?: ClaudeExtraUsage | null;
  planType?: string | null;
}> => {
  const [usageResult, profileResult] = await Promise.allSettled([
    apiCallApi.request(await buildClaudeUsageRequest(file, t)),
    apiCallApi.request(await buildClaudeProfileRequest(file, t)),
  ]);

  if (usageResult.status === 'rejected') {
    throw usageResult.reason;
  }

  const result = usageResult.value;

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  return buildClaudeQuotaData(
    result,
    profileResult.status === 'fulfilled' ? profileResult.value : undefined,
    t
  );
};

const buildKimiQuotaRequest = async (file: CredentialItem, t: TFunction): Promise<ApiCallRequest> => {
  const rawAuthIndex = file.selectionKey;
  const selectionKey = normalizeAuthIndex(rawAuthIndex);
  if (!selectionKey) {
    throw new Error(t('kimi_quota.missing_auth_index'));
  }

  return {
    selectionKey,
    method: 'GET',
    url: KIMI_USAGE_URL,
    header: { ...KIMI_REQUEST_HEADERS },
  };
};

const parseKimiQuotaResponse = (
  _file: CredentialItem,
  result: ApiCallResult,
  t: TFunction
): KimiQuotaRow[] => {
  const payload = parseKimiUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('kimi_quota.empty_data'));
  }

  return buildKimiQuotaRows(payload);
};

const fetchKimiQuotaBatch = createSingleRequestBatchFetcher<KimiQuotaRow[]>({
  buildRequest: buildKimiQuotaRequest,
  parseResponse: parseKimiQuotaResponse,
});

const fetchKimiQuota = async (file: CredentialItem, t: TFunction): Promise<KimiQuotaRow[]> => {
  const result = await apiCallApi.request(await buildKimiQuotaRequest(file, t));

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  return parseKimiQuotaResponse(file, result, t);
};

const renderAntigravityItems = (
  quota: AntigravityQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h } = React;
  const groups = quota.groups ?? [];

  if (groups.length === 0) {
    return h('div', { className: styleMap.quotaMessage }, t('antigravity_quota.empty_models'));
  }

  return groups.map((group) => {
    const clamped = Math.max(0, Math.min(1, group.remainingFraction));
    const percent = Math.round(clamped * 100);
    const resetLabel = formatQuotaResetTime(group.resetTime);

    return h(
      'div',
      { key: group.id, className: styleMap.quotaRow },
      h(
        'div',
        { className: styleMap.quotaRowHeader },
        h('span', { className: styleMap.quotaModel, title: group.models.join(', ') }, group.label),
        h(
          'div',
          { className: styleMap.quotaMeta },
          h('span', { className: styleMap.quotaPercent }, `${percent}%`),
          h('span', { className: styleMap.quotaReset }, resetLabel)
        )
      ),
      h(QuotaProgressBar, { percent, highThreshold: 60, mediumThreshold: 20 })
    );
  });
};

const renderCodexItems = (
  quota: CodexQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h, Fragment } = React;
  const windows = quota.windows ?? [];
  const planType = quota.planType ?? null;

  const getPlanLabel = (pt?: string | null): string | null => {
    const normalized = normalizePlanType(pt);
    if (!normalized) return null;
    if (normalized === 'plus') return t('codex_quota.plan_plus');
    if (normalized === 'team') return t('codex_quota.plan_team');
    if (normalized === 'free') return t('codex_quota.plan_free');
    return pt || normalized;
  };

  const planLabel = getPlanLabel(planType);
  const nodes: ReactNode[] = [];

  if (planLabel) {
    nodes.push(
      h(
        'div',
        { key: 'plan', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('codex_quota.plan_label')),
        h('span', { className: styleMap.codexPlanValue }, planLabel)
      )
    );
  }

  if (windows.length === 0) {
    nodes.push(
      h('div', { key: 'empty', className: styleMap.quotaMessage }, t('codex_quota.empty_windows'))
    );
    return h(Fragment, null, ...nodes);
  }

  nodes.push(
    ...windows.map((window) => {
      const used = window.usedPercent;
      const clampedUsed = used === null ? null : Math.max(0, Math.min(100, used));
      const remaining = clampedUsed === null ? null : Math.max(0, Math.min(100, 100 - clampedUsed));
      const percentLabel = remaining === null ? '--' : `${Math.round(remaining)}%`;
      const windowLabel = window.labelKey
        ? t(window.labelKey, window.labelParams as Record<string, string | number>)
        : window.label;

      return h(
        'div',
        { key: window.id, className: styleMap.quotaRow },
        h(
          'div',
          { className: styleMap.quotaRowHeader },
          h('span', { className: styleMap.quotaModel }, windowLabel),
          h(
            'div',
            { className: styleMap.quotaMeta },
            h('span', { className: styleMap.quotaPercent }, percentLabel),
            h('span', { className: styleMap.quotaReset }, window.resetLabel)
          )
        ),
        h(QuotaProgressBar, { percent: remaining, highThreshold: 80, mediumThreshold: 50 })
      );
    })
  );

  return h(Fragment, null, ...nodes);
};

const renderGeminiCliItems = (
  quota: GeminiCliQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h } = React;
  const buckets = quota.buckets ?? [];

  if (buckets.length === 0) {
    return h('div', { className: styleMap.quotaMessage }, t('gemini_cli_quota.empty_buckets'));
  }

  return buckets.map((bucket) => {
    const fraction = bucket.remainingFraction;
    const clamped = fraction === null ? null : Math.max(0, Math.min(1, fraction));
    const percent = clamped === null ? null : Math.round(clamped * 100);
    const percentLabel = percent === null ? '--' : `${percent}%`;
    const remainingAmountLabel =
      bucket.remainingAmount === null || bucket.remainingAmount === undefined
        ? null
        : t('gemini_cli_quota.remaining_amount', {
            count: bucket.remainingAmount,
          });
    const titleBase =
      bucket.modelIds && bucket.modelIds.length > 0 ? bucket.modelIds.join(', ') : bucket.label;
    const title = bucket.tokenType ? `${titleBase} (${bucket.tokenType})` : titleBase;

    const resetLabel = formatQuotaResetTime(bucket.resetTime);

    return h(
      'div',
      { key: bucket.id, className: styleMap.quotaRow },
      h(
        'div',
        { className: styleMap.quotaRowHeader },
        h('span', { className: styleMap.quotaModel, title }, bucket.label),
        h(
          'div',
          { className: styleMap.quotaMeta },
          h('span', { className: styleMap.quotaPercent }, percentLabel),
          remainingAmountLabel
            ? h('span', { className: styleMap.quotaAmount }, remainingAmountLabel)
            : null,
          h('span', { className: styleMap.quotaReset }, resetLabel)
        )
      ),
      h(QuotaProgressBar, { percent, highThreshold: 60, mediumThreshold: 20 })
    );
  });
};

const buildClaudeQuotaWindows = (
  payload: ClaudeUsagePayload,
  t: TFunction
): ClaudeQuotaWindow[] => {
  const windows: ClaudeQuotaWindow[] = [];
  const windowHoursByKey: Partial<
    Record<(typeof CLAUDE_USAGE_WINDOW_KEYS)[number]['key'], number>
  > = {
    five_hour: 5,
    seven_day: 24 * 7,
    seven_day_oauth_apps: 24 * 7,
    seven_day_opus: 24 * 7,
    seven_day_sonnet: 24 * 7,
    seven_day_cowork: 24 * 7,
    iguana_necktie: 24 * 7,
  };

  for (const { key, id, labelKey } of CLAUDE_USAGE_WINDOW_KEYS) {
    const window = payload[key as keyof ClaudeUsagePayload];
    if (!window || typeof window !== 'object' || !('utilization' in window)) continue;
    const typedWindow = window as { utilization: number; resets_at: string };
    const usedPercent = normalizeNumberValue(typedWindow.utilization);
    const resetLabel = formatQuotaResetTime(typedWindow.resets_at);
    windows.push({
      id,
      label: t(labelKey),
      labelKey,
      usedPercent,
      resetLabel,
      resetAt: normalizeResetAt(typedWindow.resets_at),
      windowHours: windowHoursByKey[key] ?? null,
    });
  }

  return windows;
};

const CLAUDE_PLAN_TYPE_MAP: Record<string, string> = {
  default_claude_max_5x: 'plan_max5',
  default_claude_max_20x: 'plan_max20',
  default_claude_pro: 'plan_pro',
  default_claude_ai: 'plan_free',
};

const parseClaudeProfilePayload = (payload: unknown): ClaudeProfileResponse | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as ClaudeProfileResponse;
    } catch {
      return null;
    }
  }
  if (typeof payload === 'object') {
    return payload as ClaudeProfileResponse;
  }
  return null;
};

const resolveClaudePlanType = (profile: ClaudeProfileResponse | null): string | null => {
  if (!profile) return null;

  const tier = normalizeStringValue(profile.organization?.rate_limit_tier);
  if (!tier) return null;

  return CLAUDE_PLAN_TYPE_MAP[tier] ?? 'plan_unknown';
};

const renderClaudeItems = (
  quota: ClaudeQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h, Fragment } = React;
  const windows = quota.windows ?? [];
  const extraUsage = quota.extraUsage ?? null;
  const planType = quota.planType ?? null;
  const nodes: ReactNode[] = [];

  if (planType) {
    nodes.push(
      h(
        'div',
        { key: 'plan', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('claude_quota.plan_label')),
        h('span', { className: styleMap.codexPlanValue }, t(`claude_quota.${planType}`))
      )
    );
  }

  if (extraUsage && extraUsage.is_enabled) {
    const usedLabel = `$${(extraUsage.used_credits / 100).toFixed(2)} / $${(extraUsage.monthly_limit / 100).toFixed(2)}`;
    nodes.push(
      h(
        'div',
        { key: 'extra', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('claude_quota.extra_usage_label')),
        h('span', { className: styleMap.codexPlanValue }, usedLabel)
      )
    );
  }

  if (windows.length === 0) {
    nodes.push(
      h('div', { key: 'empty', className: styleMap.quotaMessage }, t('claude_quota.empty_windows'))
    );
    return h(Fragment, null, ...nodes);
  }

  nodes.push(
    ...windows.map((window) => {
      const used = window.usedPercent;
      const clampedUsed = used === null ? null : Math.max(0, Math.min(100, used));
      const remaining = clampedUsed === null ? null : Math.max(0, Math.min(100, 100 - clampedUsed));
      const percentLabel = remaining === null ? '--' : `${Math.round(remaining)}%`;
      const windowLabel = window.labelKey ? t(window.labelKey) : window.label;

      return h(
        'div',
        { key: window.id, className: styleMap.quotaRow },
        h(
          'div',
          { className: styleMap.quotaRowHeader },
          h('span', { className: styleMap.quotaModel }, windowLabel),
          h(
            'div',
            { className: styleMap.quotaMeta },
            h('span', { className: styleMap.quotaPercent }, percentLabel),
            h('span', { className: styleMap.quotaReset }, window.resetLabel)
          )
        ),
        h(QuotaProgressBar, { percent: remaining, highThreshold: 80, mediumThreshold: 50 })
      );
    })
  );

  return h(Fragment, null, ...nodes);
};

export const CLAUDE_CONFIG: QuotaConfig<
  ClaudeQuotaState,
  { windows: ClaudeQuotaWindow[]; extraUsage?: ClaudeExtraUsage | null; planType?: string | null }
> = {
  type: 'claude',
  i18nPrefix: 'claude_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) => isClaudeFile(file) && !isDisabledCredential(file),
  fetchQuota: fetchClaudeQuota,
  fetchQuotaBatch: fetchClaudeQuotaBatch,
  storeSelector: (state) => state.claudeQuota,
  storeSetter: 'setClaudeQuota',
  buildLoadingState: () => ({ status: 'loading', windows: [] }),
  buildSuccessState: (data) => ({
    status: 'success',
    windows: data.windows,
    extraUsage: data.extraUsage,
    planType: data.planType,
  }),
  buildErrorState: (message, status) => ({
    status: 'error',
    windows: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.claudeCard,
  controlsClassName: styles.claudeControls,
  controlClassName: styles.claudeControl,
  gridClassName: styles.claudeGrid,
  renderQuotaItems: renderClaudeItems,
};

export const ANTIGRAVITY_CONFIG: QuotaConfig<AntigravityQuotaState, AntigravityQuotaGroup[]> = {
  type: 'antigravity',
  i18nPrefix: 'antigravity_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) => isAntigravityFile(file) && !isDisabledCredential(file),
  fetchQuota: fetchAntigravityQuota,
  fetchQuotaBatch: fetchAntigravityQuotaBatch,
  storeSelector: (state) => state.antigravityQuota,
  storeSetter: 'setAntigravityQuota',
  buildLoadingState: () => ({ status: 'loading', groups: [] }),
  buildSuccessState: (groups) => ({ status: 'success', groups }),
  buildErrorState: (message, status) => ({
    status: 'error',
    groups: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.antigravityCard,
  controlsClassName: styles.antigravityControls,
  controlClassName: styles.antigravityControl,
  gridClassName: styles.antigravityGrid,
  renderQuotaItems: renderAntigravityItems,
};

export const CODEX_CONFIG: QuotaConfig<
  CodexQuotaState,
  { planType: string | null; windows: CodexQuotaWindow[] }
> = {
  type: 'codex',
  i18nPrefix: 'codex_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) => isCodexFile(file) && !isDisabledCredential(file),
  fetchQuota: fetchCodexQuota,
  fetchQuotaBatch: fetchCodexQuotaBatch,
  storeSelector: (state) => state.codexQuota,
  storeSetter: 'setCodexQuota',
  buildLoadingState: () => ({ status: 'loading', windows: [] }),
  buildSuccessState: (data) => ({
    status: 'success',
    windows: data.windows,
    planType: data.planType,
  }),
  buildErrorState: (message, status) => ({
    status: 'error',
    windows: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.codexCard,
  controlsClassName: styles.codexControls,
  controlClassName: styles.codexControl,
  gridClassName: styles.codexGrid,
  renderQuotaItems: renderCodexItems,
};

export const GEMINI_CLI_CONFIG: QuotaConfig<GeminiCliQuotaState, GeminiCliQuotaBucketState[]> = {
  type: 'gemini-cli',
  i18nPrefix: 'gemini_cli_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) =>
    isGeminiCliFile(file) && !isRuntimeOnlyCredential(file) && !isDisabledCredential(file),
  fetchQuota: fetchGeminiCliQuota,
  fetchQuotaBatch: fetchGeminiCliQuotaBatch,
  storeSelector: (state) => state.geminiCliQuota,
  storeSetter: 'setGeminiCliQuota',
  buildLoadingState: () => ({ status: 'loading', buckets: [] }),
  buildSuccessState: (buckets) => ({ status: 'success', buckets }),
  buildErrorState: (message, status) => ({
    status: 'error',
    buckets: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.geminiCliCard,
  controlsClassName: styles.geminiCliControls,
  controlClassName: styles.geminiCliControl,
  gridClassName: styles.geminiCliGrid,
  renderQuotaItems: renderGeminiCliItems,
};

const renderKimiItems = (
  quota: KimiQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h } = React;
  const rows = quota.rows ?? [];

  if (rows.length === 0) {
    return h('div', { className: styleMap.quotaMessage }, t('kimi_quota.empty_data'));
  }

  return rows.map((row) => {
    const limit = row.limit;
    const used = row.used;
    const remaining =
      limit > 0
        ? Math.max(0, Math.min(100, Math.round(((limit - used) / limit) * 100)))
        : used > 0
          ? 0
          : null;
    const percentLabel = remaining === null ? '--' : `${remaining}%`;
    const rowLabel = row.labelKey
      ? t(row.labelKey, (row.labelParams ?? {}) as Record<string, string | number>)
      : (row.label ?? '');
    const resetLabel = formatKimiResetHint(t, row.resetHint);

    return h(
      'div',
      { key: row.id, className: styleMap.quotaRow },
      h(
        'div',
        { className: styleMap.quotaRowHeader },
        h('span', { className: styleMap.quotaModel }, rowLabel),
        h(
          'div',
          { className: styleMap.quotaMeta },
          h('span', { className: styleMap.quotaPercent }, percentLabel),
          limit > 0 ? h('span', { className: styleMap.quotaAmount }, `${used} / ${limit}`) : null,
          resetLabel ? h('span', { className: styleMap.quotaReset }, resetLabel) : null
        )
      ),
      h(QuotaProgressBar, { percent: remaining, highThreshold: 60, mediumThreshold: 20 })
    );
  });
};

export const KIMI_CONFIG: QuotaConfig<KimiQuotaState, KimiQuotaRow[]> = {
  type: 'kimi',
  i18nPrefix: 'kimi_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) => isKimiFile(file) && !isDisabledCredential(file),
  fetchQuota: fetchKimiQuota,
  fetchQuotaBatch: fetchKimiQuotaBatch,
  storeSelector: (state) => state.kimiQuota,
  storeSetter: 'setKimiQuota',
  buildLoadingState: () => ({ status: 'loading', rows: [] }),
  buildSuccessState: (rows) => ({ status: 'success', rows }),
  buildErrorState: (message, status) => ({
    status: 'error',
    rows: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.kimiCard,
  controlsClassName: styles.kimiControls,
  controlClassName: styles.kimiControl,
  gridClassName: styles.kimiGrid,
  renderQuotaItems: renderKimiItems,
};
