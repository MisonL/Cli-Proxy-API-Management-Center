import type { UsagePersistenceStatus } from '@/types';

export type UsagePersistenceSnapshot = {
  enabled: boolean;
  filePath: string;
  fileExists: boolean;
  fileSizeBytes: number;
  lastLoadAdded: number;
  lastLoadSkipped: number;
  lastError: string;
};

export const normalizeUsagePersistenceStatus = (
  input: UsagePersistenceStatus | null | undefined
): UsagePersistenceSnapshot => ({
  enabled: Boolean(input?.enabled),
  filePath: typeof input?.file_path === 'string' && input.file_path.trim() ? input.file_path : '--',
  fileExists: Boolean(input?.file_exists),
  fileSizeBytes:
    typeof input?.file_size_bytes === 'number' && Number.isFinite(input.file_size_bytes)
      ? input.file_size_bytes
      : 0,
  lastLoadAdded:
    typeof input?.last_load_added === 'number' && Number.isFinite(input.last_load_added)
      ? input.last_load_added
      : 0,
  lastLoadSkipped:
    typeof input?.last_load_skipped === 'number' && Number.isFinite(input.last_load_skipped)
      ? input.last_load_skipped
      : 0,
  lastError: typeof input?.last_error === 'string' ? input.last_error.trim() : '',
});

export const formatUsageDateTime = (value?: string, locale?: string): string => {
  if (!value) return '--';
  if (value.startsWith('0001-01-01T00:00:00')) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1 ? '--' : date.toLocaleString(locale);
};

export const formatUsageSize = (value?: number): string => {
  if (!value || !Number.isFinite(value) || value <= 0) return '--';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
};

export const getUsagePersistenceTone = (
  persistenceStatus: UsagePersistenceStatus | null | undefined
): 'success' | 'warning' | 'muted' => {
  if (!persistenceStatus?.enabled) {
    return 'muted';
  }
  return persistenceStatus.last_error ? 'warning' : 'success';
};

export const formatUsageLoadResult = (
  persistenceStatus:
    | Pick<UsagePersistenceStatus, 'last_load_added' | 'last_load_skipped'>
    | null
    | undefined
): string => `+${persistenceStatus?.last_load_added ?? 0} / ${persistenceStatus?.last_load_skipped ?? 0}`;
