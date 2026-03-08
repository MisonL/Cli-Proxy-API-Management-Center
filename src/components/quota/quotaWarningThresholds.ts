import { DEFAULT_QUOTA_WARNING_THRESHOLDS, type QuotaWarningThresholds } from './quotaAnalytics';
import { STORAGE_KEY_QUOTA_WARNING_THRESHOLDS } from '@/utils/constants';

const QUOTA_WARNING_THRESHOLD_KEYS: Array<keyof QuotaWarningThresholds> = [
  'healthLowPercent',
  'riskDays',
  'snapshotCoveragePercent',
  'failureRate24hPercent',
  'activePoolPercent7d',
];

const clampThresholdValue = (value: unknown, key: keyof QuotaWarningThresholds): number => {
  const fallback = DEFAULT_QUOTA_WARNING_THRESHOLDS[key];
  const raw = Number(value);
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  const max = key === 'riskDays' ? 30 : 100;
  return Math.max(0, Math.min(max, raw));
};

export const normalizeQuotaWarningThresholds = (value: unknown): QuotaWarningThresholds => {
  if (!value || typeof value !== 'object') {
    return DEFAULT_QUOTA_WARNING_THRESHOLDS;
  }

  const record = value as Record<string, unknown>;
  return {
    healthLowPercent: clampThresholdValue(record.healthLowPercent, 'healthLowPercent'),
    riskDays: clampThresholdValue(record.riskDays, 'riskDays'),
    snapshotCoveragePercent: clampThresholdValue(
      record.snapshotCoveragePercent,
      'snapshotCoveragePercent'
    ),
    failureRate24hPercent: clampThresholdValue(
      record.failureRate24hPercent,
      'failureRate24hPercent'
    ),
    activePoolPercent7d: clampThresholdValue(record.activePoolPercent7d, 'activePoolPercent7d'),
  };
};

export const updateQuotaWarningThreshold = (
  current: QuotaWarningThresholds,
  key: keyof QuotaWarningThresholds,
  value: unknown
): QuotaWarningThresholds => ({
  ...current,
  [key]: clampThresholdValue(value, key),
});

export const serializeQuotaWarningThresholds = (
  thresholds: QuotaWarningThresholds,
  exportedAt = new Date()
) => ({
  version: 1,
  exported_at: exportedAt.toISOString(),
  thresholds: normalizeQuotaWarningThresholds(thresholds),
});

const parseQuotaWarningThresholdRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('无效的配额预警阈值文件');
  }

  const record = value as Record<string, unknown>;
  if (record.version !== undefined && Number(record.version) !== 1) {
    throw new Error('不支持的配额预警阈值版本');
  }

  const source = record.thresholds ?? record;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('无效的配额预警阈值文件');
  }

  const thresholdRecord = source as Record<string, unknown>;
  QUOTA_WARNING_THRESHOLD_KEYS.forEach((key) => {
    if (!(key in thresholdRecord)) {
      throw new Error(`缺少阈值字段: ${key}`);
    }
    if (!Number.isFinite(Number(thresholdRecord[key]))) {
      throw new Error(`阈值字段无效: ${key}`);
    }
  });

  return thresholdRecord;
};

export const parseImportedQuotaWarningThresholds = (value: unknown): QuotaWarningThresholds => {
  return normalizeQuotaWarningThresholds(parseQuotaWarningThresholdRecord(value));
};

export const loadStoredQuotaWarningThresholds = (): QuotaWarningThresholds => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_QUOTA_WARNING_THRESHOLDS;
    }
    const raw = localStorage.getItem(STORAGE_KEY_QUOTA_WARNING_THRESHOLDS);
    if (!raw) {
      return DEFAULT_QUOTA_WARNING_THRESHOLDS;
    }
    return parseImportedQuotaWarningThresholds(JSON.parse(raw));
  } catch {
    return DEFAULT_QUOTA_WARNING_THRESHOLDS;
  }
};

export const saveStoredQuotaWarningThresholds = (thresholds: QuotaWarningThresholds): void => {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(
      STORAGE_KEY_QUOTA_WARNING_THRESHOLDS,
      JSON.stringify(normalizeQuotaWarningThresholds(thresholds))
    );
  } catch {
    // Ignore storage errors.
  }
};
