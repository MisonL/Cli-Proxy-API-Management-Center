import type { TFunction } from 'i18next';
import type { UsageTimeRange } from '@/utils/usage';

export const CHART_LINES_STORAGE_KEY = 'cli-proxy-usage-chart-lines-v1';
export const TIME_RANGE_STORAGE_KEY = 'cli-proxy-usage-time-range-v1';
export const DEFAULT_CHART_LINES = ['all'];
export const DEFAULT_TIME_RANGE: UsageTimeRange = '24h';
export const MAX_CHART_LINES = 9;
export const HOUR_WINDOW_BY_TIME_RANGE: Record<Exclude<UsageTimeRange, 'all'>, number> = {
  '7h': 7,
  '24h': 24,
  '7d': 7 * 24,
};

const TIME_RANGE_OPTIONS: ReadonlyArray<{ value: UsageTimeRange; labelKey: string }> = [
  { value: 'all', labelKey: 'usage_stats.range_all' },
  { value: '7h', labelKey: 'usage_stats.range_7h' },
  { value: '24h', labelKey: 'usage_stats.range_24h' },
  { value: '7d', labelKey: 'usage_stats.range_7d' },
];

export const isUsageTimeRange = (value: unknown): value is UsageTimeRange =>
  value === '7h' || value === '24h' || value === '7d' || value === 'all';

export const normalizeUsageChartLines = (value: unknown, maxLines = MAX_CHART_LINES): string[] => {
  if (!Array.isArray(value)) {
    return DEFAULT_CHART_LINES;
  }

  const filtered = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxLines);

  return filtered.length ? filtered : DEFAULT_CHART_LINES;
};

export const loadStoredUsageChartLines = (): string[] => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_CHART_LINES;
    }
    const raw = localStorage.getItem(CHART_LINES_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CHART_LINES;
    }
    return normalizeUsageChartLines(JSON.parse(raw));
  } catch {
    return DEFAULT_CHART_LINES;
  }
};

export const saveStoredUsageChartLines = (chartLines: string[]): void => {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(
      CHART_LINES_STORAGE_KEY,
      JSON.stringify(normalizeUsageChartLines(chartLines))
    );
  } catch {
    // Ignore storage errors.
  }
};

export const loadStoredUsageTimeRange = (): UsageTimeRange => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_TIME_RANGE;
    }
    const raw = localStorage.getItem(TIME_RANGE_STORAGE_KEY);
    return isUsageTimeRange(raw) ? raw : DEFAULT_TIME_RANGE;
  } catch {
    return DEFAULT_TIME_RANGE;
  }
};

export const saveStoredUsageTimeRange = (timeRange: UsageTimeRange): void => {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(TIME_RANGE_STORAGE_KEY, timeRange);
  } catch {
    // Ignore storage errors.
  }
};

export const buildUsageTimeRangeOptions = (t: TFunction) =>
  TIME_RANGE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
  }));
