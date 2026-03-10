import type { CredentialItem } from '@/types';
import { hasCredentialStatusMessage, normalizeProviderKey } from '@/features/credentials/constants';
import {
  normalizeAuthIndex,
  normalizeUsageSourceId,
  type KeyStats,
  type UsageDetail,
} from '@/utils/usage';

export type CredentialsStatusFilter =
  | 'all'
  | 'healthy'
  | 'disabled'
  | 'unavailable'
  | 'warning'
  | 'quota-limited';

export type CredentialsActivityFilter = 'all' | '24h' | '7d';

export type CredentialsSortBy =
  | 'name'
  | 'modified-desc'
  | 'active-desc'
  | 'success-desc'
  | 'failure-desc';

export type CredentialActivityMap = Map<string, number>;

const resolveDetailTimestampMs = (detail: UsageDetail): number | null => {
  const value =
    typeof detail.__timestampMs === 'number' && Number.isFinite(detail.__timestampMs)
      ? detail.__timestampMs
      : Date.parse(detail.timestamp);
  return Number.isFinite(value) ? value : null;
};

const resolveFileActivityKeyValues = (file: CredentialItem): string[] => {
  const keys: string[] = [];
  const selectionKey = normalizeAuthIndex(file.selectionKey);
  if (selectionKey) {
    keys.push(`auth:${selectionKey}`);
  }
  const sourceId = normalizeUsageSourceId(file.name);
  if (sourceId) {
    keys.push(`source:${sourceId}`);
  }
  return keys;
};

export const buildCredentialActivityMap = (usageDetails: UsageDetail[]): CredentialActivityMap => {
  const lastSeen = new Map<string, number>();

  usageDetails.forEach((detail) => {
    const timestampMs = resolveDetailTimestampMs(detail);
    if (timestampMs === null) return;

    const selectionKey = normalizeAuthIndex(detail.selection_key);
    if (selectionKey) {
      const key = `auth:${selectionKey}`;
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

export const buildCredentialActivityMapFromFiles = (
  files: CredentialItem[]
): CredentialActivityMap => {
  const lastSeen = new Map<string, number>();
  files.forEach((file) => {
    const lastSeenRaw = file.lastActiveAt;
    const timestampMs =
      typeof lastSeenRaw === 'number'
        ? lastSeenRaw
        : typeof lastSeenRaw === 'string'
          ? Date.parse(lastSeenRaw)
          : Number.NaN;
    if (!Number.isFinite(timestampMs) || timestampMs <= 0) return;
    resolveFileActivityKeyValues(file).forEach((key) => {
      lastSeen.set(key, Math.max(lastSeen.get(key) ?? 0, timestampMs));
    });
  });
  return lastSeen;
};

export const getCredentialLastActiveAt = (
  file: CredentialItem,
  fileActivity: CredentialActivityMap
): number =>
  resolveFileActivityKeyValues(file).reduce(
    (currentMax, key) => Math.max(currentMax, fileActivity.get(key) ?? 0),
    0
  );

export const buildCredentialTypeCounts = (files: CredentialItem[]): Record<string, number> => {
  const counts: Record<string, number> = { all: files.length };

  files.forEach((file) => {
    const providerKey = normalizeProviderKey(String(file.type || ''));
    if (!providerKey) return;
    counts[providerKey] = (counts[providerKey] || 0) + 1;
  });

  return counts;
};

export type FilterAndSortCredentialsOptions = {
  files: CredentialItem[];
  filter: string;
  search: string;
  statusFilter: CredentialsStatusFilter;
  activityFilter: CredentialsActivityFilter;
  sortBy: CredentialsSortBy;
  activityReferenceNow: number;
  fileActivity: CredentialActivityMap;
  keyStats: KeyStats;
};

const resolveStatsForFile = (file: CredentialItem, keyStats: KeyStats) => {
  if (
    typeof file.requests24h === 'number' ||
    typeof file.failures24h === 'number' ||
    typeof file.failureRate24h === 'number'
  ) {
    const failure = Number(file.failures24h ?? 0) || 0;
    const total = Number(file.requests24h ?? 0) || 0;
    return {
      success: Math.max(total - failure, 0),
      failure,
    };
  }
  const selectionKey = normalizeAuthIndex(file.selectionKey);
  return (
    keyStats.bySelectionKey[selectionKey || ''] ??
    keyStats.bySource[normalizeUsageSourceId(file.name)] ?? {
      success: 0,
      failure: 0,
    }
  );
};

export const filterAndSortCredentials = ({
  files,
  filter,
  search,
  statusFilter,
  activityFilter,
  sortBy,
  activityReferenceNow,
  fileActivity,
  keyStats,
}: FilterAndSortCredentialsOptions): CredentialItem[] => {
  const normalizedFilter = normalizeProviderKey(filter);
  const term = search.trim().toLowerCase();
  const within24h = activityReferenceNow - 24 * 60 * 60 * 1000;
  const within7d = activityReferenceNow - 7 * 24 * 60 * 60 * 1000;

  const next = files.filter((item) => {
    const lastActiveAt = getCredentialLastActiveAt(item, fileActivity);
    const matchType =
      normalizedFilter === 'all' ||
      normalizeProviderKey(String(item.type || '')) === normalizedFilter;
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'healthy' &&
        !item.disabled &&
        !item.unavailable &&
        !hasCredentialStatusMessage(item) &&
        item.quotaExceeded !== true) ||
      (statusFilter === 'disabled' && item.disabled === true) ||
      (statusFilter === 'unavailable' && item.unavailable === true) ||
      (statusFilter === 'warning' && hasCredentialStatusMessage(item)) ||
      (statusFilter === 'quota-limited' && item.quotaExceeded === true);
    const matchActivity =
      activityFilter === 'all' ||
      (activityFilter === '24h' && lastActiveAt >= within24h) ||
      (activityFilter === '7d' && lastActiveAt >= within7d);
    const matchSearch =
      !term ||
      item.name.toLowerCase().includes(term) ||
      String(item.type || '')
        .toLowerCase()
        .includes(term) ||
      String(item.provider || '')
        .toLowerCase()
        .includes(term) ||
      String(normalizeAuthIndex(item.selectionKey) || '')
        .toLowerCase()
        .includes(term) ||
      String(item.accountEmail || '')
        .toLowerCase()
        .includes(term);

    return matchType && matchStatus && matchActivity && matchSearch;
  });

  next.sort((left, right) => {
    const leftStats = resolveStatsForFile(left, keyStats);
    const rightStats = resolveStatsForFile(right, keyStats);
    const leftActive = getCredentialLastActiveAt(left, fileActivity);
    const rightActive = getCredentialLastActiveAt(right, fileActivity);

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

    const leftModified = Number(left.modified ?? 0);
    const rightModified = Number(right.modified ?? 0);
    return rightModified - leftModified || left.name.localeCompare(right.name);
  });

  return next;
};
