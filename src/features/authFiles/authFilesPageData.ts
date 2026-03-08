import type { AuthFileItem } from '@/types';
import {
  hasAuthFileStatusMessage,
  normalizeProviderKey,
} from '@/features/authFiles/constants';
import {
  normalizeAuthIndex,
  normalizeUsageSourceId,
  type KeyStats,
  type UsageDetail,
} from '@/utils/usage';

export type AuthFilesStatusFilter =
  | 'all'
  | 'healthy'
  | 'disabled'
  | 'unavailable'
  | 'warning'
  | 'quota-limited';

export type AuthFilesActivityFilter = 'all' | '24h' | '7d';

export type AuthFilesSortBy =
  | 'name'
  | 'modified-desc'
  | 'active-desc'
  | 'success-desc'
  | 'failure-desc';

export type AuthFileActivityMap = Map<string, number>;

const resolveDetailTimestampMs = (detail: UsageDetail): number | null => {
  const value =
    typeof detail.__timestampMs === 'number' && Number.isFinite(detail.__timestampMs)
      ? detail.__timestampMs
      : Date.parse(detail.timestamp);
  return Number.isFinite(value) ? value : null;
};

const resolveFileActivityKeyValues = (file: AuthFileItem): string[] => {
  const keys: string[] = [];
  const authIndex = normalizeAuthIndex(file.authIndex ?? file['auth_index']);
  if (authIndex) {
    keys.push(`auth:${authIndex}`);
  }
  const sourceId = normalizeUsageSourceId(file.name);
  if (sourceId) {
    keys.push(`source:${sourceId}`);
  }
  return keys;
};

export const buildAuthFileActivityMap = (
  usageDetails: UsageDetail[]
): AuthFileActivityMap => {
  const lastSeen = new Map<string, number>();

  usageDetails.forEach((detail) => {
    const timestampMs = resolveDetailTimestampMs(detail);
    if (timestampMs === null) return;

    const authIndex = normalizeAuthIndex(detail.auth_index);
    if (authIndex) {
      const key = `auth:${authIndex}`;
      lastSeen.set(key, Math.max(lastSeen.get(key) ?? 0, timestampMs));
    }

    if (detail.source) {
      const source = normalizeUsageSourceId(detail.source);
      if (!source) return;
      const key = `source:${source}`;
      lastSeen.set(key, Math.max(lastSeen.get(key) ?? 0, timestampMs));
    }
  });

  return lastSeen;
};

export const getAuthFileLastActiveAt = (
  file: AuthFileItem,
  fileActivity: AuthFileActivityMap
): number =>
  resolveFileActivityKeyValues(file).reduce(
    (currentMax, key) => Math.max(currentMax, fileActivity.get(key) ?? 0),
    0
  );

export const buildAuthFileTypeCounts = (
  files: AuthFileItem[]
): Record<string, number> => {
  const counts: Record<string, number> = { all: files.length };

  files.forEach((file) => {
    const providerKey = normalizeProviderKey(String(file.type || ''));
    if (!providerKey) return;
    counts[providerKey] = (counts[providerKey] || 0) + 1;
  });

  return counts;
};

export type FilterAndSortAuthFilesOptions = {
  files: AuthFileItem[];
  filter: string;
  search: string;
  statusFilter: AuthFilesStatusFilter;
  activityFilter: AuthFilesActivityFilter;
  sortBy: AuthFilesSortBy;
  activityReferenceNow: number;
  fileActivity: AuthFileActivityMap;
  keyStats: KeyStats;
};

const resolveStatsForFile = (file: AuthFileItem, keyStats: KeyStats) => {
  const authIndex = normalizeAuthIndex(file.authIndex ?? file['auth_index']);
  return (
    keyStats.byAuthIndex[authIndex || ''] ??
    keyStats.bySource[normalizeUsageSourceId(file.name)] ?? {
      success: 0,
      failure: 0,
    }
  );
};

export const filterAndSortAuthFiles = ({
  files,
  filter,
  search,
  statusFilter,
  activityFilter,
  sortBy,
  activityReferenceNow,
  fileActivity,
  keyStats,
}: FilterAndSortAuthFilesOptions): AuthFileItem[] => {
  const normalizedFilter = normalizeProviderKey(filter);
  const term = search.trim().toLowerCase();
  const within24h = activityReferenceNow - 24 * 60 * 60 * 1000;
  const within7d = activityReferenceNow - 7 * 24 * 60 * 60 * 1000;

  const next = files.filter((item) => {
    const authIndex = normalizeAuthIndex(item.authIndex ?? item['auth_index']);
    const lastActiveAt = getAuthFileLastActiveAt(item, fileActivity);
    const matchType =
      normalizedFilter === 'all' ||
      normalizeProviderKey(String(item.type || '')) === normalizedFilter;
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'healthy' &&
        !item.disabled &&
        !item.unavailable &&
        !hasAuthFileStatusMessage(item) &&
        item.quotaExceeded !== true) ||
      (statusFilter === 'disabled' && item.disabled === true) ||
      (statusFilter === 'unavailable' && item.unavailable === true) ||
      (statusFilter === 'warning' && hasAuthFileStatusMessage(item)) ||
      (statusFilter === 'quota-limited' && item.quotaExceeded === true);
    const matchActivity =
      activityFilter === 'all' ||
      (activityFilter === '24h' && lastActiveAt >= within24h) ||
      (activityFilter === '7d' && lastActiveAt >= within7d);
    const matchSearch =
      !term ||
      item.name.toLowerCase().includes(term) ||
      String(item.type || '').toLowerCase().includes(term) ||
      String(item.provider || '').toLowerCase().includes(term) ||
      String(authIndex || '').toLowerCase().includes(term);

    return matchType && matchStatus && matchActivity && matchSearch;
  });

  next.sort((left, right) => {
    const leftStats = resolveStatsForFile(left, keyStats);
    const rightStats = resolveStatsForFile(right, keyStats);
    const leftActive = getAuthFileLastActiveAt(left, fileActivity);
    const rightActive = getAuthFileLastActiveAt(right, fileActivity);

    if (sortBy === 'name') {
      return left.name.localeCompare(right.name);
    }
    if (sortBy === 'active-desc') {
      return rightActive - leftActive || left.name.localeCompare(right.name);
    }
    if (sortBy === 'success-desc') {
      return rightStats.success - leftStats.success || left.name.localeCompare(right.name);
    }
    if (sortBy === 'failure-desc') {
      return rightStats.failure - leftStats.failure || left.name.localeCompare(right.name);
    }

    const leftModified = Number(left.modified ?? left['modtime'] ?? 0);
    const rightModified = Number(right.modified ?? right['modtime'] ?? 0);
    return rightModified - leftModified || left.name.localeCompare(right.name);
  });

  return next;
};
