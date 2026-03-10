/**
 * Generic quota section component.
 */

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { triggerHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useQuotaStore, useThemeStore } from '@/stores';
import type { CredentialItem, ResolvedTheme } from '@/types';
import type { UsageDetail } from '@/utils/usage';
import { QuotaCard } from './QuotaCard';
import type { QuotaStatusState } from './QuotaCard';
import { useQuotaLoader } from './useQuotaLoader';
import type { QuotaConfig } from './quotaConfigs';
import { useGridColumns } from './useGridColumns';
import { IconRefreshCw } from '@/components/ui/icons';
import { QuotaAnalyticsView } from './QuotaAnalyticsView';
import type { QuotaWarningThresholds } from './quotaAnalytics';
import styles from '@/pages/QuotaPage.module.scss';

type QuotaUpdater<T> = T | ((prev: T) => T);

type QuotaSetter<T> = (updater: QuotaUpdater<T>) => void;

type ViewMode = 'paged' | 'all';

const MAX_ITEMS_PER_PAGE = 25;
const ALL_VIEW_BASE_BATCH = 24;
const ANALYTICS_AUTO_LOAD_LIMIT = 200;
const ANALYTICS_BATCH_SIZE = 40;
const ANALYTICS_CONCURRENCY = 8;

interface QuotaPaginationState<T> {
  pageSize: number;
  totalPages: number;
  currentPage: number;
  pageItems: T[];
  setPageSize: (size: number) => void;
  goToPrev: () => void;
  goToNext: () => void;
  loading: boolean;
  loadingScope: 'page' | 'all' | null;
  setLoading: (loading: boolean, scope?: 'page' | 'all' | null) => void;
}

const useQuotaPagination = <T,>(items: T[], defaultPageSize = 6): QuotaPaginationState<T> => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [loading, setLoadingState] = useState(false);
  const [loadingScope, setLoadingScope] = useState<'page' | 'all' | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(items.length / pageSize)),
    [items.length, pageSize]
  );

  const currentPage = useMemo(() => Math.min(page, totalPages), [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const goToPrev = useCallback(() => {
    setPage((prev) => Math.max(1, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setPage((prev) => Math.min(totalPages, prev + 1));
  }, [totalPages]);

  const setLoading = useCallback((isLoading: boolean, scope?: 'page' | 'all' | null) => {
    setLoadingState(isLoading);
    setLoadingScope(isLoading ? (scope ?? null) : null);
  }, []);

  return {
    pageSize,
    totalPages,
    currentPage,
    pageItems,
    setPageSize,
    goToPrev,
    goToNext,
    loading,
    loadingScope,
    setLoading
  };
};

interface QuotaSectionProps<TState extends QuotaStatusState, TData> {
  config: QuotaConfig<TState, TData>;
  files: CredentialItem[];
  loading: boolean;
  disabled: boolean;
  usageDetails: UsageDetail[];
  usageLoading?: boolean;
  warningThresholds?: QuotaWarningThresholds;
}

export function QuotaSection<TState extends QuotaStatusState, TData>({
  config,
  files,
  loading,
  disabled,
  usageDetails,
  usageLoading = false,
  warningThresholds,
}: QuotaSectionProps<TState, TData>) {
  const { t } = useTranslation();
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const setQuota = useQuotaStore((state) => state[config.storeSetter]) as QuotaSetter<
    Record<string, TState>
  >;

  const [columns, gridRef] = useGridColumns(380); // Min card width 380px matches SCSS
  const [viewMode, setViewMode] = useState<ViewMode>('paged');
  const [displayMode, setDisplayMode] = useState<'cards' | 'analytics'>('cards');
  const [allViewCount, setAllViewCount] = useState(ALL_VIEW_BASE_BATCH);
  const allViewLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const analyticsAutoLoadDoneRef = useRef(false);
  const analyticsFullLoadRequestedRef = useRef(false);

  const filteredFiles = useMemo(() => files.filter((file) => config.filterFn(file)), [
    files,
    config
  ]);
  const effectiveViewMode: ViewMode = viewMode;

  const {
    pageSize,
    totalPages,
    currentPage,
    pageItems,
    setPageSize,
    goToPrev,
    goToNext,
    loading: sectionLoading,
    setLoading
  } = useQuotaPagination(filteredFiles);

  // Update page size based on view mode and columns
  useEffect(() => {
    if (effectiveViewMode === 'all') {
      setPageSize(Math.max(1, filteredFiles.length));
    } else {
      // Paged mode: 3 rows * columns, capped to avoid oversized pages.
      setPageSize(Math.min(columns * 3, MAX_ITEMS_PER_PAGE));
    }
  }, [effectiveViewMode, columns, filteredFiles.length, setPageSize]);

  const { quota, loadQuota, progress, cancel } = useQuotaLoader(config);
  const allModePageSize = useMemo(() => Math.max(ALL_VIEW_BASE_BATCH, columns * 4), [columns]);
  const visibleCardItems = useMemo(() => {
    if (effectiveViewMode !== 'all') return pageItems;
    const effectiveCount = Math.max(allViewCount, allModePageSize);
    return filteredFiles.slice(0, Math.min(filteredFiles.length, effectiveCount));
  }, [allModePageSize, allViewCount, effectiveViewMode, filteredFiles, pageItems]);
  const remainingAllViewCount = Math.max(filteredFiles.length - visibleCardItems.length, 0);

  const analyticsHasIdle = useMemo(
    () =>
      filteredFiles.some((file) => {
        const state = quota[file.name];
        return !state || state.status === 'idle';
      }),
    [filteredFiles, quota]
  );
  const analyticsLoadedCount = useMemo(
    () =>
      filteredFiles.reduce((count, file) => {
        const state = quota[file.name];
        return state && state.status !== 'idle' && state.status !== 'loading' ? count + 1 : count;
      }, 0),
    [filteredFiles, quota]
  );
  const analyticsHasVisibleData = analyticsLoadedCount > 0;
  const analyticsShouldAutoLoadAll = filteredFiles.length <= ANALYTICS_AUTO_LOAD_LIMIT;
  const resolveAnalyticsTargetLimit = useCallback(
    () =>
      analyticsFullLoadRequestedRef.current || analyticsShouldAutoLoadAll
        ? undefined
        : ANALYTICS_AUTO_LOAD_LIMIT,
    [analyticsShouldAutoLoadAll]
  );
  const allViewRenderedPercent = useMemo(
    () =>
      filteredFiles.length > 0
        ? Math.min(100, (visibleCardItems.length / filteredFiles.length) * 100)
        : 0,
    [filteredFiles.length, visibleCardItems.length]
  );

  const pendingQuotaRefreshRef = useRef(false);
  const prevFilesLoadingRef = useRef(loading);

  const handleRefresh = useCallback(() => {
    cancel();
    pendingQuotaRefreshRef.current = true;
    void triggerHeaderRefresh();
  }, [cancel]);

  const handleRequestFullLoad = useCallback(() => {
    if (filteredFiles.length === 0) return;
    analyticsFullLoadRequestedRef.current = true;
    cancel();
    void loadQuota(filteredFiles, 'all', setLoading, {
      batchSize: ANALYTICS_BATCH_SIZE,
      concurrency: ANALYTICS_CONCURRENCY,
    });
  }, [cancel, filteredFiles, loadQuota, setLoading]);

  useEffect(() => {
    analyticsAutoLoadDoneRef.current = false;
    analyticsFullLoadRequestedRef.current = false;
  }, [files.length, config.type]);

  useEffect(() => {
    const wasLoading = prevFilesLoadingRef.current;
    prevFilesLoadingRef.current = loading;

    if (!pendingQuotaRefreshRef.current) return;
    if (loading) return;
    if (!wasLoading) return;

    pendingQuotaRefreshRef.current = false;
    const analyticsMode = displayMode === 'analytics';
    const scope = analyticsMode || effectiveViewMode === 'all' ? 'all' : 'page';
    const targets = analyticsMode ? filteredFiles : visibleCardItems;
    if (targets.length === 0) return;
    loadQuota(targets, scope, setLoading, {
      force: true,
      maxTargets: analyticsMode ? resolveAnalyticsTargetLimit() : undefined,
      batchSize: analyticsMode ? ANALYTICS_BATCH_SIZE : undefined,
      concurrency: analyticsMode ? ANALYTICS_CONCURRENCY : undefined,
    });
  }, [
    displayMode,
    effectiveViewMode,
    filteredFiles,
    loadQuota,
    loading,
    resolveAnalyticsTargetLimit,
    setLoading,
    visibleCardItems,
  ]);

  useEffect(() => {
    if (displayMode !== 'analytics' || loading || sectionLoading) return;
    if (filteredFiles.length === 0) return;
    if (!analyticsHasIdle) return;
    if (!analyticsFullLoadRequestedRef.current && !analyticsShouldAutoLoadAll) {
      if (analyticsAutoLoadDoneRef.current) return;
      analyticsAutoLoadDoneRef.current = true;
    }
    void loadQuota(filteredFiles, 'all', setLoading, {
      maxTargets: resolveAnalyticsTargetLimit(),
      batchSize: ANALYTICS_BATCH_SIZE,
      concurrency: ANALYTICS_CONCURRENCY,
    });
  }, [
    analyticsHasIdle,
    analyticsShouldAutoLoadAll,
    displayMode,
    filteredFiles,
    loadQuota,
    loading,
    resolveAnalyticsTargetLimit,
    sectionLoading,
    setLoading,
  ]);

  useEffect(() => {
    if (displayMode !== 'cards' || loading || sectionLoading) return;
    if (visibleCardItems.length === 0) return;
    void loadQuota(visibleCardItems, effectiveViewMode === 'all' ? 'all' : 'page', setLoading);
  }, [displayMode, effectiveViewMode, loadQuota, loading, sectionLoading, setLoading, visibleCardItems]);

  useEffect(() => {
    if (effectiveViewMode !== 'all') return;
    const node = allViewLoadMoreRef.current;
    if (!node || remainingAllViewCount <= 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        startTransition(() => {
          setAllViewCount((prev) => Math.min(filteredFiles.length, prev + allModePageSize));
        });
      },
      {
        rootMargin: '240px 0px',
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [allModePageSize, effectiveViewMode, filteredFiles.length, remainingAllViewCount]);

  useEffect(() => {
    if (loading) return;
    if (filteredFiles.length === 0) {
      setQuota({});
      return;
    }
    setQuota((prev) => {
      const nextState: Record<string, TState> = {};
      filteredFiles.forEach((file) => {
        const cached = prev[file.name];
        if (cached) {
          nextState[file.name] = cached;
        }
      });
      return nextState;
    });
  }, [filteredFiles, loading, setQuota]);

  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{t(`${config.i18nPrefix}.title`)}</span>
      {filteredFiles.length > 0 && (
        <span className={styles.countBadge}>
          {filteredFiles.length}
        </span>
      )}
    </div>
  );

  const isRefreshing = sectionLoading || loading;

  return (
    <Card
      title={titleNode}
      extra={
        <div className={styles.headerActions}>
          <div className={styles.viewModeToggle}>
            <Button
              variant={displayMode === 'cards' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                cancel();
                startTransition(() => setDisplayMode('cards'));
              }}
            >
              {t('quota_management.analytics.cards_view')}
            </Button>
            <Button
              variant={displayMode === 'analytics' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                cancel();
                startTransition(() => setDisplayMode('analytics'));
              }}
            >
              {t('quota_management.analytics.stats_view')}
            </Button>
          </div>
          {displayMode === 'cards' && (
            <div className={styles.viewModeToggle}>
              <Button
                variant={effectiveViewMode === 'paged' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setViewMode('paged')}
              >
                {t('credentials.view_mode_paged')}
              </Button>
              <Button
                variant={effectiveViewMode === 'all' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  setAllViewCount(Math.max(ALL_VIEW_BASE_BATCH, columns * 4));
                  setViewMode('all');
                }}
              >
                {t('credentials.view_mode_all')}
              </Button>
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={disabled || isRefreshing}
            loading={isRefreshing}
            title={t('quota_management.refresh_files_and_quota')}
            aria-label={t('quota_management.refresh_files_and_quota')}
          >
            {!isRefreshing && <IconRefreshCw size={16} />}
          </Button>
        </div>
      }
    >
      {filteredFiles.length === 0 ? (
        <EmptyState
          title={t(`${config.i18nPrefix}.empty_title`)}
          description={t(`${config.i18nPrefix}.empty_desc`)}
        />
      ) : displayMode === 'analytics' ? (
        <QuotaAnalyticsView
          providerKey={config.type}
          providerLabel={t(`${config.i18nPrefix}.title`)}
          files={filteredFiles}
          usageDetails={usageDetails}
          quotaMap={quota as unknown as Record<string, unknown>}
          loading={usageLoading || ((isRefreshing || progress.active) && !analyticsHasVisibleData)}
          hydrating={Boolean(progress.active && progress.scope === 'all')}
          hydrationCompleted={progress.completed}
          hydrationTotal={progress.total}
          warningThresholds={warningThresholds}
          onRequestFullLoad={handleRequestFullLoad}
          fullLoadBusy={Boolean(progress.active || isRefreshing || loading || disabled)}
        />
      ) : (
        <>
          <div ref={gridRef} className={config.gridClassName}>
            {visibleCardItems.map((item) => (
              <QuotaCard
                key={item.name}
                item={item}
                quota={quota[item.name]}
                resolvedTheme={resolvedTheme}
                i18nPrefix={config.i18nPrefix}
                cardIdleMessageKey={config.cardIdleMessageKey}
                cardClassName={config.cardClassName}
                defaultType={config.type}
                renderQuotaItems={config.renderQuotaItems}
              />
            ))}
          </div>
          {effectiveViewMode === 'all' && remainingAllViewCount > 0 && (
            <div ref={allViewLoadMoreRef} className={styles.analyticsHint}>
              {t('common.loading')} {visibleCardItems.length}/{filteredFiles.length} ·{' '}
              {allViewRenderedPercent.toFixed(1)}%
            </div>
          )}
          {filteredFiles.length > pageSize && effectiveViewMode === 'paged' && (
            <div className={styles.pagination}>
              <Button
                variant="secondary"
                size="sm"
                onClick={goToPrev}
                disabled={currentPage <= 1}
              >
                {t('credentials.pagination_prev')}
              </Button>
              <div className={styles.pageInfo}>
                {t('credentials.pagination_info', {
                  current: currentPage,
                  total: totalPages,
                  count: filteredFiles.length
                })}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={goToNext}
                disabled={currentPage >= totalPages}
              >
                {t('credentials.pagination_next')}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
