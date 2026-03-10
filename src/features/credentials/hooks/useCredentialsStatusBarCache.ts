import { useMemo } from 'react';
import type { CredentialItem } from '@/types';
import {
  calculateStatusBarData,
  normalizeAuthIndex,
  type StatusBarData,
  type UsageDetail,
} from '@/utils/usage';

export type CredentialStatusBarData = ReturnType<typeof calculateStatusBarData>;

const resolveTimestamp = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export function useCredentialsStatusBarCache(files: CredentialItem[], usageDetails: UsageDetail[]) {
  return useMemo(() => {
    const cache = new Map<string, CredentialStatusBarData>();

    const buildSyntheticStatusBar = (file: CredentialItem): StatusBarData => {
      const total = Math.max(Number(file.requests24h ?? 0) || 0, 0);
      const failure = Math.max(Number(file.failures24h ?? 0) || 0, 0);
      const success = Math.max(total - failure, 0);
      const now =
        resolveTimestamp(file.lastActiveAt) ??
        resolveTimestamp(file.lastRefresh) ??
        resolveTimestamp(file.modified) ??
        24 * 60 * 60 * 1000;
      const blockDurationMs = 10 * 60 * 1000;
      const blockDetails = Array.from({ length: 20 }, (_, index) => {
        const startTime = now - (20 - index) * blockDurationMs;
        const endTime = startTime + blockDurationMs;
        const isLast = index === 19;
        return {
          success: isLast ? success : 0,
          failure: isLast ? failure : 0,
          rate: isLast ? (total > 0 ? success / total : -1) : -1,
          startTime,
          endTime,
        };
      });
      return {
        blocks: blockDetails.map((detail) =>
          detail.rate < 0
            ? 'idle'
            : detail.failure === 0
              ? 'success'
              : detail.success === 0
                ? 'failure'
                : 'mixed'
        ),
        blockDetails,
        successRate: total > 0 ? (success / total) * 100 : 100,
        totalSuccess: success,
        totalFailure: failure,
      };
    };

    files.forEach((file) => {
      const selectionKeyKey = normalizeAuthIndex(file.selectionKey);

      if (selectionKeyKey) {
        if (file.platformBacked) {
          cache.set(selectionKeyKey, buildSyntheticStatusBar(file));
          return;
        }
        const filteredDetails = usageDetails.filter((detail) => {
          const detailAuthIndex = normalizeAuthIndex(detail.selection_key);
          return detailAuthIndex !== null && detailAuthIndex === selectionKeyKey;
        });
        cache.set(selectionKeyKey, calculateStatusBarData(filteredDetails));
      }
    });

    return cache;
  }, [files, usageDetails]);
}
