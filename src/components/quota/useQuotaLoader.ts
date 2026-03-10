/**
 * Generic hook for quota data fetching and management.
 */

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CredentialItem } from '@/types';
import { useQuotaStore } from '@/stores';
import { getStatusFromError } from '@/utils/quota';
import type { QuotaConfig } from './quotaConfigs';

type QuotaScope = 'page' | 'all';
type LoadQuotaOptions = {
  force?: boolean;
  maxTargets?: number;
  batchSize?: number;
  concurrency?: number;
};

type QuotaUpdater<T> = T | ((prev: T) => T);

type QuotaSetter<T> = (updater: QuotaUpdater<T>) => void;

interface LoadQuotaResult<TData> {
  name: string;
  status: 'success' | 'error';
  data?: TData;
  error?: string;
  errorStatus?: number;
}

const MAX_CONCURRENT_QUOTA_REQUESTS = 12;
const MAX_BATCHED_QUOTA_REQUESTS = 24;

export interface QuotaLoadProgress {
  active: boolean;
  completed: number;
  total: number;
  scope: QuotaScope | null;
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput) => Promise<TOutput>
): Promise<TOutput[]> {
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  };

  const workerCount = Math.min(Math.max(concurrency, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export function useQuotaLoader<TState extends { status: string }, TData>(
  config: QuotaConfig<TState, TData>
) {
  const { t } = useTranslation();
  const quota = useQuotaStore(config.storeSelector);
  const setQuota = useQuotaStore((state) => state[config.storeSetter]) as QuotaSetter<
    Record<string, TState>
  >;

  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);
  const batchSupportedRef = useRef(Boolean(config.fetchQuotaBatch));
  const lastSetLoadingRef = useRef<((loading: boolean, scope?: QuotaScope | null) => void) | null>(
    null
  );
  const [progress, setProgress] = useState<QuotaLoadProgress>({
    active: false,
    completed: 0,
    total: 0,
    scope: null,
  });

  const loadQuota = useCallback(
    async (
      targets: CredentialItem[],
      scope: QuotaScope,
      setLoading: (loading: boolean, scope?: QuotaScope | null) => void,
      options: LoadQuotaOptions = {}
    ) => {
      if (loadingRef.current) return;
      const force = options.force === true;
      const maxTargets = options.maxTargets;
      const batchSizeOverride = options.batchSize;
      const concurrencyOverride = options.concurrency;
      loadingRef.current = true;
      const requestId = ++requestIdRef.current;
      lastSetLoadingRef.current = setLoading;

      try {
        if (targets.length === 0) return;

        const pendingTargets = (force
          ? targets
          : targets.filter((file) => {
              const state = quota[file.name];
              return !state || state.status === 'idle';
            }))
          .filter(Boolean);
        if (pendingTargets.length === 0) {
          return;
        }
        const limitedTargets =
          typeof maxTargets === 'number' && maxTargets > 0
            ? pendingTargets.slice(0, maxTargets)
            : pendingTargets;

        setLoading(true, scope);
        setProgress({
          active: true,
          completed: 0,
          total: limitedTargets.length,
          scope,
        });

        setQuota((prev) => {
          const nextState = { ...prev };
          limitedTargets.forEach((file) => {
            nextState[file.name] = config.buildLoadingState();
          });
          return nextState;
        });

        const batchSize =
          batchSizeOverride && batchSizeOverride > 0
            ? batchSizeOverride
            : scope === 'all'
              ? MAX_BATCHED_QUOTA_REQUESTS
              : limitedTargets.length;
        let completed = 0;

        for (let start = 0; start < limitedTargets.length; start += batchSize) {
          const batch = limitedTargets.slice(start, start + batchSize);
          let results: LoadQuotaResult<TData>[];
          const effectiveConcurrency =
            typeof concurrencyOverride === 'number' && concurrencyOverride > 0
              ? Math.min(concurrencyOverride, batch.length)
              : Math.min(MAX_CONCURRENT_QUOTA_REQUESTS, batch.length);

          if (config.fetchQuotaBatch && batchSupportedRef.current && batch.length > 1) {
            try {
              results = await config.fetchQuotaBatch(batch, t);
            } catch {
              batchSupportedRef.current = false;
              results = await mapWithConcurrency(
                batch,
                effectiveConcurrency,
                async (file): Promise<LoadQuotaResult<TData>> => {
                  try {
                    const data = await config.fetchQuota(file, t);
                    return { name: file.name, status: 'success', data };
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : t('common.unknown_error');
                    const errorStatus = getStatusFromError(err);
                    return { name: file.name, status: 'error', error: message, errorStatus };
                  }
                }
              );
            }
          } else {
            results = await mapWithConcurrency(
              batch,
              effectiveConcurrency,
              async (file): Promise<LoadQuotaResult<TData>> => {
                try {
                  const data = await config.fetchQuota(file, t);
                  return { name: file.name, status: 'success', data };
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : t('common.unknown_error');
                  const errorStatus = getStatusFromError(err);
                  return { name: file.name, status: 'error', error: message, errorStatus };
                }
              }
            );
          }

          if (requestId !== requestIdRef.current) return;

          setQuota((prev) => {
            const nextState = { ...prev };
            results.forEach((result) => {
              if (result.status === 'success') {
                nextState[result.name] = config.buildSuccessState(result.data as TData);
              } else {
                nextState[result.name] = config.buildErrorState(
                  result.error || t('common.unknown_error'),
                  result.errorStatus
                );
              }
            });
            return nextState;
          });

          completed += results.length;
          setProgress({
            active: true,
            completed,
            total: limitedTargets.length,
            scope,
          });
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          loadingRef.current = false;
          setProgress({
            active: false,
            completed: 0,
            total: 0,
            scope: null,
          });
        }
      }
    },
    [config, quota, setQuota, t]
  );

  const cancel = useCallback(() => {
    requestIdRef.current += 1;
    loadingRef.current = false;
    setProgress({
      active: false,
      completed: 0,
      total: 0,
      scope: null,
    });
    lastSetLoadingRef.current?.(false, null);
  }, []);

  return { quota, loadQuota, progress, cancel };
}
