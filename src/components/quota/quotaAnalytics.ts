import type { TFunction } from 'i18next';
import type { CredentialItem } from '@/types/credential';
import type {
  AntigravityQuotaGroup,
  AntigravityQuotaState,
  ClaudeQuotaState,
  ClaudeQuotaWindow,
  CodexQuotaState,
  CodexQuotaWindow,
  GeminiCliQuotaBucketState,
  GeminiCliQuotaState,
  KimiQuotaRow,
  KimiQuotaState,
} from '@/types/quota';
import {
  extractTotalTokens,
  normalizeAuthIndex,
  normalizeUsageSourceId,
  type UsageDetail,
} from '@/utils/usage';
import type { ProviderOverviewResponse } from '@/services/api/platform';

export const QUOTA_ANALYTICS_BUCKET_LABELS = [
  '90-100%',
  '80-90%',
  '70-80%',
  '60-70%',
  '50-60%',
  '40-50%',
  '30-40%',
  '20-30%',
  '10-20%',
  '0-10%',
] as const;

const WINDOW_DEFINITIONS = [
  { id: '5h', labelKey: 'quota_management.analytics.window_5h', hours: 5 },
  { id: '24h', labelKey: 'quota_management.analytics.window_24h', hours: 24 },
  { id: '3d', labelKey: 'quota_management.analytics.window_3d', hours: 72 },
  { id: '7d', labelKey: 'quota_management.analytics.window_7d', hours: 168 },
] as const;

const DATASET_COLORS = [
  '#8b8680',
  '#c65746',
  '#22c55e',
  '#d97706',
  '#2563eb',
  '#8b5cf6',
  '#0f766e',
  '#be185d',
] as const;

type SupportedQuotaProvider = 'antigravity' | 'claude' | 'codex' | 'gemini-cli' | 'kimi';

type QuotaMetricObservation = {
  fileName: string;
  metricId: string;
  metricLabel: string;
  remainingPercent: number;
  resetAt?: string;
  windowHours?: number | null;
};

export type AnalyticsBucketItem = {
  credentialId?: string;
  fileName: string;
  remainingPercent: number;
  resetAt?: string;
};

export type AnalyticsHistogramDataset = {
  id: string;
  label: string;
  color: string;
  counts: number[];
  averageRemaining: number | null;
  bucketItems: AnalyticsBucketItem[][];
};

export type AnalyticsWindowStat = {
  id: string;
  label: string;
  requestCount: number;
  tokenCount: number;
  failureCount: number;
  failureRate: number;
  activeCredentialCount: number;
  activePoolPercent: number;
  avgDailyRequests: number;
  avgDailyTokens: number;
};

export type ProviderWarning = {
  id: string;
  level: 'warning' | 'danger';
  message: string;
};

export type QuotaWarningThresholds = {
  healthLowPercent: number;
  riskDays: number;
  snapshotCoveragePercent: number;
  failureRate24hPercent: number;
  activePoolPercent7d: number;
};

export const DEFAULT_QUOTA_WARNING_THRESHOLDS: QuotaWarningThresholds = {
  healthLowPercent: 40,
  riskDays: 3,
  snapshotCoveragePercent: 50,
  failureRate24hPercent: 20,
  activePoolPercent7d: 25,
};

export type ProviderAnalytics = {
  providerKey: string;
  mode: 'quota' | 'usage-only';
  totalFiles: number;
  activeFiles: number;
  disabledFiles: number;
  unavailableFiles: number;
  loadedFiles: number;
  failedQuotaFiles: number;
  histogramLabels: string[];
  histogramDatasets: AnalyticsHistogramDataset[];
  windowStats: AnalyticsWindowStat[];
  conservativeHealth: number | null;
  averageHealth: number | null;
  operationalHealth: number | null;
  conservativeRiskDays: number | null;
  averageRiskDays: number | null;
  avgDailyQuotaBurnPercent: number | null;
  activePoolPercent7d: number;
  note: string;
  warnings: ProviderWarning[];
};

type QuotaStateMap =
  | Record<string, AntigravityQuotaState>
  | Record<string, ClaudeQuotaState>
  | Record<string, CodexQuotaState>
  | Record<string, GeminiCliQuotaState>
  | Record<string, KimiQuotaState>;

const clampPercent = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
};

const parseDateMs = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const getSelectionKeySet = (files: CredentialItem[]) =>
  new Set(
    files
      .map((file) => normalizeAuthIndex(file.selectionKey))
      .filter((value): value is string => Boolean(value))
  );

const getSourceIdSet = (files: CredentialItem[]) => {
  const sourceIds = new Set<string>();
  files.forEach((file) => {
    const name = String(file.name || '').trim();
    if (!name) return;
    sourceIds.add(normalizeUsageSourceId(name));
    const withoutExt = name.replace(/\.[^/.]+$/, '');
    if (withoutExt && withoutExt !== name) {
      sourceIds.add(normalizeUsageSourceId(withoutExt));
    }
  });
  return sourceIds;
};

const collectProviderUsage = (files: CredentialItem[], usageDetails: UsageDetail[]) => {
  const selectionKeySet = getSelectionKeySet(files);
  const sourceIdSet = getSourceIdSet(files);

  return usageDetails.filter((detail) => {
    const detailAuthIndex = normalizeAuthIndex(detail.selection_key);
    if (detailAuthIndex && selectionKeySet.has(detailAuthIndex)) {
      return true;
    }
    return Boolean(detail.source) && sourceIdSet.has(detail.source);
  });
};

const translateLabel = (
  t: TFunction,
  label: string | undefined,
  labelKey: string | undefined,
  labelParams: Record<string, string | number> | undefined,
  fallback: string
) => {
  if (label && label.trim()) return label;
  if (labelKey) return t(labelKey, labelParams as Record<string, unknown>);
  return fallback;
};

const hoursUntilReset = (resetAt: string | undefined, nowMs: number): number | null => {
  const resetMs = parseDateMs(resetAt);
  if (resetMs === null) return null;
  return Math.max(0, (resetMs - nowMs) / (60 * 60 * 1000));
};

const estimateDailyBurnPercent = (
  observation: QuotaMetricObservation,
  nowMs: number
): number | null => {
  if (!observation.windowHours || observation.windowHours <= 0) return null;
  const remainingPercent = clampPercent(observation.remainingPercent);
  if (remainingPercent === null) return null;
  const usedPercent = 100 - remainingPercent;
  if (usedPercent <= 0) return 0;
  const resetHours = hoursUntilReset(observation.resetAt, nowMs);
  const minElapsedHours = observation.windowHours * 0.15;
  const elapsedHours =
    resetHours === null
      ? Math.max(observation.windowHours / 2, minElapsedHours)
      : Math.max(observation.windowHours - resetHours, minElapsedHours);
  const dailyBurn = (usedPercent / elapsedHours) * 24;
  return Number.isFinite(dailyBurn) && dailyBurn >= 0 ? dailyBurn : null;
};

const estimateRiskDays = (observation: QuotaMetricObservation, nowMs: number): number | null => {
  const remainingPercent = clampPercent(observation.remainingPercent);
  if (remainingPercent === null) return null;
  const burnPerDay = estimateDailyBurnPercent(observation, nowMs);
  if (burnPerDay === null || burnPerDay <= 0) return null;
  const predictedDays = remainingPercent / burnPerDay;
  const resetHours = hoursUntilReset(observation.resetAt, nowMs);
  if (resetHours !== null && predictedDays * 24 > resetHours) {
    return null;
  }
  return Number.isFinite(predictedDays) && predictedDays >= 0 ? predictedDays : null;
};

const bucketIndexForPercent = (percent: number) => {
  const normalized = clampPercent(percent) ?? 0;
  const index = 9 - Math.floor(normalized / 10);
  return Math.min(9, Math.max(0, index));
};

const buildHistogramDatasets = (
  observations: QuotaMetricObservation[]
): AnalyticsHistogramDataset[] => {
  const grouped = new Map<
    string,
    {
      label: string;
      values: number[];
      bucketItems: AnalyticsBucketItem[][];
    }
  >();

  observations.forEach((observation) => {
    const current = grouped.get(observation.metricId) ?? {
      label: observation.metricLabel,
      values: [],
      bucketItems: QUOTA_ANALYTICS_BUCKET_LABELS.map(() => [] as AnalyticsBucketItem[]),
    };
    current.values.push(observation.remainingPercent);
    current.bucketItems[bucketIndexForPercent(observation.remainingPercent)]?.push({
      fileName: observation.fileName,
      remainingPercent: observation.remainingPercent,
      resetAt: observation.resetAt,
    });
    grouped.set(observation.metricId, current);
  });

  return Array.from(grouped.entries()).map(([metricId, group], index) => {
    const counts = new Array(QUOTA_ANALYTICS_BUCKET_LABELS.length).fill(0);
    group.values.forEach((value) => {
      counts[bucketIndexForPercent(value)] += 1;
    });
    const averageRemaining =
      group.values.length > 0
        ? group.values.reduce((sum, value) => sum + value, 0) / group.values.length
        : null;
    return {
      id: metricId,
      label: group.label,
      color: DATASET_COLORS[index % DATASET_COLORS.length],
      counts,
      averageRemaining,
      bucketItems: group.bucketItems,
    };
  });
};

const buildWindowStats = (
  t: TFunction,
  files: CredentialItem[],
  usageDetails: UsageDetail[]
): AnalyticsWindowStat[] => {
  const totalFiles = files.length;
  const nowMs = Date.now();
  const selectionKeySet = getSelectionKeySet(files);
  const sourceIdSet = getSourceIdSet(files);
  const preparedWindows = WINDOW_DEFINITIONS.map((windowDef) => ({
    ...windowDef,
    startMs: nowMs - windowDef.hours * 60 * 60 * 1000,
    requestCount: 0,
    tokenCount: 0,
    failureCount: 0,
    activeCredentials: new Set<string>(),
  }));

  usageDetails.forEach((detail) => {
    const detailTs =
      typeof detail.__timestampMs === 'number'
        ? detail.__timestampMs
        : parseDateMs(detail.timestamp);
    if (detailTs === null || detailTs > nowMs) {
      return;
    }

    const detailTokenCount = extractTotalTokens(detail);
    const selectionKey = normalizeAuthIndex(detail.selection_key);
    const activeCredential =
      selectionKey && selectionKeySet.has(selectionKey)
        ? selectionKey
        : detail.source && sourceIdSet.has(detail.source)
          ? detail.source
          : null;

    preparedWindows.forEach((windowDef) => {
      if (detailTs < windowDef.startMs) {
        return;
      }

      windowDef.requestCount += 1;
      windowDef.tokenCount += detailTokenCount;
      if (detail.failed) {
        windowDef.failureCount += 1;
      }
      if (activeCredential) {
        windowDef.activeCredentials.add(activeCredential);
      }
    });
  });

  return preparedWindows.map((windowDef) => {
    const days = windowDef.hours / 24;
    return {
      id: windowDef.id,
      label: t(windowDef.labelKey),
      requestCount: windowDef.requestCount,
      tokenCount: windowDef.tokenCount,
      failureCount: windowDef.failureCount,
      failureRate:
        windowDef.requestCount > 0 ? (windowDef.failureCount / windowDef.requestCount) * 100 : 0,
      activeCredentialCount: windowDef.activeCredentials.size,
      activePoolPercent: totalFiles > 0 ? (windowDef.activeCredentials.size / totalFiles) * 100 : 0,
      avgDailyRequests: days > 0 ? windowDef.requestCount / days : windowDef.requestCount,
      avgDailyTokens: days > 0 ? windowDef.tokenCount / days : windowDef.tokenCount,
    };
  });
};

const getSupportedProviderDefaultWindowHours = (
  providerKey: SupportedQuotaProvider,
  observation: Pick<QuotaMetricObservation, 'metricId'>
): number | null => {
  switch (providerKey) {
    case 'claude':
      return observation.metricId.includes('five-hour')
        ? 5
        : observation.metricId.includes('seven-day')
          ? 168
          : 24 * 30;
    case 'codex':
      return observation.metricId.includes('five-hour')
        ? 5
        : observation.metricId.includes('weekly')
          ? 168
          : 24;
    case 'gemini-cli':
    case 'antigravity':
      return 24;
    case 'kimi':
      return observation.metricId.includes('summary') ? 168 : 24;
    default:
      return null;
  }
};

const buildClaudeObservations = (
  t: TFunction,
  files: CredentialItem[],
  quotaMap: Record<string, ClaudeQuotaState>
): { observations: QuotaMetricObservation[]; loadedFiles: number; failedFiles: number } => {
  const observations: QuotaMetricObservation[] = [];
  let loadedFiles = 0;
  let failedFiles = 0;

  files.forEach((file) => {
    const quota = quotaMap[file.name];
    if (!quota || quota.status === 'idle') return;
    loadedFiles += 1;
    if (quota.status === 'error') {
      failedFiles += 1;
      return;
    }
    (quota.windows || []).forEach((window: ClaudeQuotaWindow) => {
      const remainingPercent = clampPercent(
        window.usedPercent === null ? null : 100 - window.usedPercent
      );
      if (remainingPercent === null) return;
      observations.push({
        fileName: file.name,
        metricId: window.id,
        metricLabel: translateLabel(t, window.label, window.labelKey, undefined, window.id),
        remainingPercent,
        resetAt: window.resetAt,
        windowHours:
          window.windowHours ??
          getSupportedProviderDefaultWindowHours('claude', { metricId: window.id }),
      });
    });
    if (
      quota.extraUsage &&
      quota.extraUsage.utilization !== null &&
      quota.extraUsage.utilization !== undefined
    ) {
      const remainingPercent = clampPercent(100 - quota.extraUsage.utilization);
      if (remainingPercent !== null) {
        observations.push({
          fileName: file.name,
          metricId: 'extra-usage',
          metricLabel: t('quota_management.analytics.metric_extra_usage'),
          remainingPercent,
          windowHours: 24 * 30,
        });
      }
    }
  });

  return { observations, loadedFiles, failedFiles };
};

const buildCodexObservations = (
  t: TFunction,
  files: CredentialItem[],
  quotaMap: Record<string, CodexQuotaState>
) => {
  const observations: QuotaMetricObservation[] = [];
  let loadedFiles = 0;
  let failedFiles = 0;

  files.forEach((file) => {
    const quota = quotaMap[file.name];
    if (!quota || quota.status === 'idle') return;
    loadedFiles += 1;
    if (quota.status === 'error') {
      failedFiles += 1;
      return;
    }
    (quota.windows || []).forEach((window: CodexQuotaWindow) => {
      const remainingPercent = clampPercent(
        window.usedPercent === null ? null : 100 - window.usedPercent
      );
      if (remainingPercent === null) return;
      observations.push({
        fileName: file.name,
        metricId: window.id,
        metricLabel: translateLabel(
          t,
          window.label,
          window.labelKey,
          window.labelParams,
          window.id
        ),
        remainingPercent,
        resetAt: window.resetAt,
        windowHours:
          window.windowHours ??
          getSupportedProviderDefaultWindowHours('codex', { metricId: window.id }),
      });
    });
  });

  return { observations, loadedFiles, failedFiles };
};

const buildAntigravityObservations = (
  t: TFunction,
  files: CredentialItem[],
  quotaMap: Record<string, AntigravityQuotaState>
) => {
  const observations: QuotaMetricObservation[] = [];
  let loadedFiles = 0;
  let failedFiles = 0;

  files.forEach((file) => {
    const quota = quotaMap[file.name];
    if (!quota || quota.status === 'idle') return;
    loadedFiles += 1;
    if (quota.status === 'error') {
      failedFiles += 1;
      return;
    }
    (quota.groups || []).forEach((group: AntigravityQuotaGroup) => {
      const remainingPercent = clampPercent(group.remainingFraction * 100);
      if (remainingPercent === null) return;
      observations.push({
        fileName: file.name,
        metricId: group.id,
        metricLabel: group.label || t('quota_management.analytics.metric_group'),
        remainingPercent,
        resetAt: group.resetTime,
        windowHours:
          group.windowHours ??
          getSupportedProviderDefaultWindowHours('antigravity', { metricId: group.id }),
      });
    });
  });

  return { observations, loadedFiles, failedFiles };
};

const buildGeminiCliObservations = (
  files: CredentialItem[],
  quotaMap: Record<string, GeminiCliQuotaState>
) => {
  const observations: QuotaMetricObservation[] = [];
  let loadedFiles = 0;
  let failedFiles = 0;

  files.forEach((file) => {
    const quota = quotaMap[file.name];
    if (!quota || quota.status === 'idle') return;
    loadedFiles += 1;
    if (quota.status === 'error') {
      failedFiles += 1;
      return;
    }
    (quota.buckets || []).forEach((bucket: GeminiCliQuotaBucketState) => {
      const remainingPercent = clampPercent(
        bucket.remainingFraction === null ? null : bucket.remainingFraction * 100
      );
      if (remainingPercent === null) return;
      observations.push({
        fileName: file.name,
        metricId: bucket.id,
        metricLabel: bucket.tokenType ? `${bucket.label} · ${bucket.tokenType}` : bucket.label,
        remainingPercent,
        resetAt: bucket.resetTime,
        windowHours:
          bucket.windowHours ??
          getSupportedProviderDefaultWindowHours('gemini-cli', { metricId: bucket.id }),
      });
    });
  });

  return { observations, loadedFiles, failedFiles };
};

const buildKimiObservations = (
  t: TFunction,
  files: CredentialItem[],
  quotaMap: Record<string, KimiQuotaState>
) => {
  const observations: QuotaMetricObservation[] = [];
  let loadedFiles = 0;
  let failedFiles = 0;

  files.forEach((file) => {
    const quota = quotaMap[file.name];
    if (!quota || quota.status === 'idle') return;
    loadedFiles += 1;
    if (quota.status === 'error') {
      failedFiles += 1;
      return;
    }
    (quota.rows || []).forEach((row: KimiQuotaRow) => {
      const remainingPercent =
        row.limit > 0 ? clampPercent(((row.limit - row.used) / row.limit) * 100) : null;
      if (remainingPercent === null) return;
      observations.push({
        fileName: file.name,
        metricId: row.id,
        metricLabel: translateLabel(t, row.label, row.labelKey, row.labelParams, row.id),
        remainingPercent,
        resetAt: row.resetAt,
        windowHours:
          row.windowHours ?? getSupportedProviderDefaultWindowHours('kimi', { metricId: row.id }),
      });
    });
  });

  return { observations, loadedFiles, failedFiles };
};

const buildQuotaObservations = (
  t: TFunction,
  providerKey: SupportedQuotaProvider,
  files: CredentialItem[],
  quotaMap: QuotaStateMap | undefined
) => {
  if (!quotaMap) {
    return { observations: [], loadedFiles: 0, failedFiles: 0 };
  }

  switch (providerKey) {
    case 'claude':
      return buildClaudeObservations(t, files, quotaMap as Record<string, ClaudeQuotaState>);
    case 'codex':
      return buildCodexObservations(t, files, quotaMap as Record<string, CodexQuotaState>);
    case 'antigravity':
      return buildAntigravityObservations(
        t,
        files,
        quotaMap as Record<string, AntigravityQuotaState>
      );
    case 'gemini-cli':
      return buildGeminiCliObservations(files, quotaMap as Record<string, GeminiCliQuotaState>);
    case 'kimi':
      return buildKimiObservations(t, files, quotaMap as Record<string, KimiQuotaState>);
    default:
      return { observations: [], loadedFiles: 0, failedFiles: 0 };
  }
};

const isSupportedQuotaProvider = (providerKey: string): providerKey is SupportedQuotaProvider =>
  providerKey === 'antigravity' ||
  providerKey === 'claude' ||
  providerKey === 'codex' ||
  providerKey === 'gemini-cli' ||
  providerKey === 'kimi';

const buildQuotaNote = (
  t: TFunction,
  loadedFiles: number,
  totalFiles: number,
  failedFiles: number
) => {
  if (totalFiles === 0) {
    return t('quota_management.analytics.note_empty');
  }
  if (loadedFiles === 0) {
    return t('quota_management.analytics.note_pending');
  }
  if (loadedFiles < totalFiles) {
    return t('quota_management.analytics.note_partial', {
      loaded: loadedFiles,
      total: totalFiles,
    });
  }
  if (failedFiles > 0) {
    return t('quota_management.analytics.note_failed', { count: failedFiles });
  }
  return t('quota_management.analytics.note_ready');
};

const buildProviderWarnings = (
  t: TFunction,
  analytics: Pick<
    ProviderAnalytics,
    | 'mode'
    | 'conservativeHealth'
    | 'conservativeRiskDays'
    | 'activePoolPercent7d'
    | 'loadedFiles'
    | 'totalFiles'
    | 'failedQuotaFiles'
    | 'windowStats'
  >,
  thresholds: QuotaWarningThresholds
): ProviderWarning[] => {
  const warnings: ProviderWarning[] = [];

  if (analytics.mode === 'quota') {
    if ((analytics.conservativeHealth ?? 100) < thresholds.healthLowPercent) {
      warnings.push({
        id: 'health-low',
        level: 'danger',
        message: t('quota_management.analytics.warning_health_low'),
      });
    }
    if (
      analytics.conservativeRiskDays !== null &&
      analytics.conservativeRiskDays !== undefined &&
      analytics.conservativeRiskDays < thresholds.riskDays
    ) {
      warnings.push({
        id: 'risk-near',
        level: 'danger',
        message: t('quota_management.analytics.warning_risk_near', {
          days: Number(analytics.conservativeRiskDays.toFixed(1)),
        }),
      });
    }
    if (
      analytics.totalFiles > 0 &&
      (analytics.loadedFiles / analytics.totalFiles) * 100 < thresholds.snapshotCoveragePercent
    ) {
      warnings.push({
        id: 'snapshot-low',
        level: 'warning',
        message: t('quota_management.analytics.warning_snapshot_low', {
          loaded: analytics.loadedFiles,
          total: analytics.totalFiles,
        }),
      });
    }
    if (analytics.failedQuotaFiles > 0) {
      warnings.push({
        id: 'snapshot-failed',
        level: 'warning',
        message: t('quota_management.analytics.warning_snapshot_failed', {
          count: analytics.failedQuotaFiles,
        }),
      });
    }
  }

  const window24h = analytics.windowStats.find((item) => item.id === '24h');
  if ((window24h?.failureRate ?? 0) >= thresholds.failureRate24hPercent) {
    warnings.push({
      id: 'failure-rate-high',
      level: 'warning',
      message: t('quota_management.analytics.warning_failure_rate_high', {
        rate: Number((window24h?.failureRate ?? 0).toFixed(1)),
      }),
    });
  }
  if ((analytics.activePoolPercent7d ?? 100) < thresholds.activePoolPercent7d) {
    warnings.push({
      id: 'pool-inactive',
      level: 'warning',
      message: t('quota_management.analytics.warning_pool_inactive', {
        percent: Number((analytics.activePoolPercent7d ?? 0).toFixed(1)),
      }),
    });
  }

  return warnings;
};

export function buildProviderAnalytics(
  t: TFunction,
  providerKey: string,
  files: CredentialItem[],
  allUsageDetails: UsageDetail[],
  quotaMap?: QuotaStateMap,
  thresholds: QuotaWarningThresholds = DEFAULT_QUOTA_WARNING_THRESHOLDS
): ProviderAnalytics {
  const providerFiles = files;
  const usageDetails = collectProviderUsage(providerFiles, allUsageDetails);
  const totalFiles = providerFiles.length;
  const disabledFiles = providerFiles.filter((file) => file.disabled === true).length;
  const unavailableFiles = providerFiles.filter((file) => file.unavailable === true).length;
  const activeFiles = Math.max(totalFiles - disabledFiles, 0);
  const windowStats = buildWindowStats(t, providerFiles, usageDetails);
  const activePoolPercent7d =
    windowStats.find((window) => window.id === '7d')?.activePoolPercent ?? 0;

  if (!isSupportedQuotaProvider(providerKey)) {
    const successRate7d =
      100 - (windowStats.find((window) => window.id === '7d')?.failureRate ?? 0);
    const availabilityRatio =
      activeFiles > 0 ? ((activeFiles - unavailableFiles) / activeFiles) * 100 : 100;
    const operationalHealth = clampPercent(availabilityRatio * 0.55 + successRate7d * 0.45);

    const result: ProviderAnalytics = {
      providerKey,
      mode: 'usage-only',
      totalFiles,
      activeFiles,
      disabledFiles,
      unavailableFiles,
      loadedFiles: 0,
      failedQuotaFiles: 0,
      histogramLabels: [],
      histogramDatasets: [],
      windowStats,
      conservativeHealth: null,
      averageHealth: null,
      operationalHealth,
      conservativeRiskDays: null,
      averageRiskDays: null,
      avgDailyQuotaBurnPercent: null,
      activePoolPercent7d,
      note: t('quota_management.analytics.note_usage_only'),
      warnings: [],
    };
    result.warnings = buildProviderWarnings(t, result, thresholds);
    return result;
  }

  const { observations, loadedFiles, failedFiles } = buildQuotaObservations(
    t,
    providerKey,
    providerFiles,
    quotaMap
  );
  const histogramDatasets = buildHistogramDatasets(observations);
  const remainingPercents = observations.map((item) => item.remainingPercent);
  const conservativeHealth = remainingPercents.length > 0 ? Math.min(...remainingPercents) : null;
  const averageHealth =
    remainingPercents.length > 0
      ? remainingPercents.reduce((sum, value) => sum + value, 0) / remainingPercents.length
      : null;
  const nowMs = Date.now();
  const burnValues = observations
    .map((observation) => estimateDailyBurnPercent(observation, nowMs))
    .filter((value): value is number => value !== null && value >= 0);
  const riskValues = observations
    .map((observation) => estimateRiskDays(observation, nowMs))
    .filter((value): value is number => value !== null && value >= 0);

  const result: ProviderAnalytics = {
    providerKey,
    mode: 'quota',
    totalFiles,
    activeFiles,
    disabledFiles,
    unavailableFiles,
    loadedFiles,
    failedQuotaFiles: failedFiles,
    histogramLabels: [...QUOTA_ANALYTICS_BUCKET_LABELS],
    histogramDatasets,
    windowStats,
    conservativeHealth,
    averageHealth,
    operationalHealth: null,
    conservativeRiskDays: riskValues.length > 0 ? Math.min(...riskValues) : null,
    averageRiskDays:
      riskValues.length > 0
        ? riskValues.reduce((sum, value) => sum + value, 0) / riskValues.length
        : null,
    avgDailyQuotaBurnPercent:
      burnValues.length > 0
        ? burnValues.reduce((sum, value) => sum + value, 0) / burnValues.length
        : null,
    activePoolPercent7d,
    note: buildQuotaNote(t, loadedFiles, totalFiles, failedFiles),
    warnings: [],
  };
  result.warnings = buildProviderWarnings(t, result, thresholds);
  return result;
}

export function buildProviderAnalyticsFromOverview(
  t: TFunction,
  providerKey: string,
  overview: ProviderOverviewResponse,
  thresholds: QuotaWarningThresholds = DEFAULT_QUOTA_WARNING_THRESHOLDS
): ProviderAnalytics {
  const result: ProviderAnalytics = {
    providerKey,
    mode: overview.mode === 'quota' ? 'quota' : 'usage-only',
    totalFiles: overview.total_credentials,
    activeFiles: overview.active_credentials,
    disabledFiles: overview.disabled_credentials,
    unavailableFiles: overview.unavailable_credentials,
    loadedFiles: overview.loaded_credentials,
    failedQuotaFiles: overview.failed_quota_credentials,
    histogramLabels: overview.histogram_labels ?? [],
    histogramDatasets: (overview.histogram_datasets ?? []).map((dataset) => ({
      id: dataset.id,
      label: dataset.label,
      color: dataset.color,
      counts: dataset.counts ?? [],
      averageRemaining: dataset.average_remaining ?? null,
      bucketItems:
        dataset.bucket_items?.map((items) =>
          (items ?? []).map((item) => ({
            credentialId: item.credential_id,
            fileName: item.credential_name ?? item.credential_id,
            remainingPercent: item.remaining_percent,
            resetAt: item.reset_at ?? undefined,
          }))
        ) ?? [],
    })),
    windowStats: (overview.window_stats ?? []).map((window) => ({
      id: window.id,
      label: window.label,
      requestCount: window.request_count,
      tokenCount: window.token_count,
      failureCount: window.failure_count,
      failureRate: window.failure_rate,
      activeCredentialCount: window.active_credential_count,
      activePoolPercent: window.active_pool_percent,
      avgDailyRequests: window.avg_daily_requests,
      avgDailyTokens: window.avg_daily_tokens,
    })),
    conservativeHealth: overview.conservative_health ?? null,
    averageHealth: overview.average_health ?? null,
    operationalHealth: overview.operational_health ?? null,
    conservativeRiskDays: overview.conservative_risk_days ?? null,
    averageRiskDays: overview.average_risk_days ?? null,
    avgDailyQuotaBurnPercent: overview.avg_daily_quota_burn_percent ?? null,
    activePoolPercent7d: overview.active_pool_percent_7d ?? 0,
    note: overview.note,
    warnings: (overview.warnings ?? []).map((warning) => ({
      id: warning.id,
      level: warning.level === 'danger' ? 'danger' : 'warning',
      message: warning.message,
    })),
  };
  if (result.warnings.length === 0) {
    result.warnings = buildProviderWarnings(t, result, thresholds);
  }
  return result;
}
