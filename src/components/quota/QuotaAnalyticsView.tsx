import { useDeferredValue, useMemo, useState } from 'react';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { useThemeStore } from '@/stores';
import type { CredentialItem } from '@/types/credential';
import type { UsageDetail } from '@/utils/usage';
import { formatCompactNumber } from '@/utils/usage';
import type { AntigravityQuotaState, ClaudeQuotaState, CodexQuotaState, GeminiCliQuotaState, KimiQuotaState } from '@/types/quota';
import {
  buildProviderAnalytics,
  type ProviderAnalytics,
  type QuotaWarningThresholds,
} from './quotaAnalytics';
import { QuotaBucketFilesModal } from './QuotaBucketFilesModal';
import {
  buildSelectedQuotaBucketState,
  getVisibleHistogramDatasets,
  sanitizeHiddenDatasetIds,
  toggleHiddenDatasetId,
  type SelectedQuotaBucketState,
} from './quotaAnalyticsViewState';
import styles from '@/pages/QuotaPage.module.scss';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type QuotaMap =
  | Record<string, AntigravityQuotaState>
  | Record<string, ClaudeQuotaState>
  | Record<string, CodexQuotaState>
  | Record<string, GeminiCliQuotaState>
  | Record<string, KimiQuotaState>;

interface QuotaAnalyticsViewProps {
  providerKey: string;
  providerLabel: string;
  files: CredentialItem[];
  usageDetails: UsageDetail[];
  quotaMap?: Record<string, unknown>;
  loading?: boolean;
  hydrating?: boolean;
  hydrationCompleted?: number;
  hydrationTotal?: number;
  warningThresholds?: QuotaWarningThresholds;
  precomputedAnalytics?: ProviderAnalytics;
  onRequestFullLoad?: () => void;
  fullLoadBusy?: boolean;
}

const formatPercent = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value) ? '--' : `${value.toFixed(1)}%`;

const getHydrationPercent = (completed: number, total: number) => {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, (completed / total) * 100));
};

const formatDays = (value: number | null | undefined, t: ReturnType<typeof useTranslation>['t']) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return t('quota_management.analytics.no_risk');
  }
  if (value < 1) {
    return t('quota_management.analytics.less_than_one_day');
  }
  return t('quota_management.analytics.days_value', { count: Number(value.toFixed(1)) });
};

const getHealthToneClass = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return styles.analyticsMetricNeutral;
  if (value >= 75) return styles.analyticsMetricHealthy;
  if (value >= 45) return styles.analyticsMetricWarning;
  return styles.analyticsMetricDanger;
};

export function QuotaAnalyticsView({
  providerKey,
  providerLabel,
  files,
  usageDetails,
  quotaMap,
  loading = false,
  hydrating = false,
  hydrationCompleted = 0,
  hydrationTotal = 0,
  warningThresholds,
  precomputedAnalytics,
  onRequestFullLoad,
  fullLoadBusy = false,
}: QuotaAnalyticsViewProps) {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const deferredFiles = useDeferredValue(files);
  const deferredUsageDetails = useDeferredValue(usageDetails);
  const deferredQuotaMap = useDeferredValue(quotaMap);

  const analytics = useMemo(
    () =>
      precomputedAnalytics ??
      buildProviderAnalytics(
        t,
        providerKey,
        deferredFiles,
        deferredUsageDetails,
        deferredQuotaMap as QuotaMap | undefined,
        warningThresholds
      ),
    [
      deferredFiles,
      deferredQuotaMap,
      deferredUsageDetails,
      precomputedAnalytics,
      providerKey,
      t,
      warningThresholds,
    ]
  );

  const [hiddenDatasetIds, setHiddenDatasetIds] = useState<string[]>([]);
  const [selectedBucketState, setSelectedBucketState] =
    useState<SelectedQuotaBucketState | null>(null);

  const fileMap = useMemo(
    () => new Map(files.map((file) => [file.name, file])),
    [files]
  );

  const effectiveHiddenDatasetIds = useMemo(
    () => sanitizeHiddenDatasetIds(hiddenDatasetIds, analytics.histogramDatasets),
    [analytics.histogramDatasets, hiddenDatasetIds]
  );

  const selectedBucket = useMemo(() => {
    if (!selectedBucketState) return null;
    const stillVisible = analytics.histogramDatasets.some(
      (dataset) =>
        dataset.id === selectedBucketState.datasetId &&
        !effectiveHiddenDatasetIds.includes(selectedBucketState.datasetId)
    );
    return stillVisible ? selectedBucketState : null;
  }, [analytics.histogramDatasets, effectiveHiddenDatasetIds, selectedBucketState]);

  const visibleDatasets = useMemo(
    () => getVisibleHistogramDatasets(analytics.histogramDatasets, effectiveHiddenDatasetIds),
    [analytics.histogramDatasets, effectiveHiddenDatasetIds]
  );

  const hiddenDatasetCount = effectiveHiddenDatasetIds.length;
  const hydrationPercent = getHydrationPercent(hydrationCompleted, hydrationTotal);
  const coveragePercent =
    analytics.mode === 'quota' && analytics.totalFiles > 0
      ? (analytics.loadedFiles / analytics.totalFiles) * 100
      : null;
  const showCoverage = analytics.mode === 'quota' && analytics.totalFiles > 0;
  const showFullLoadAction =
    Boolean(onRequestFullLoad) &&
    analytics.mode === 'quota' &&
    analytics.totalFiles > 0 &&
    analytics.loadedFiles < analytics.totalFiles;

  const toggleDatasetVisibility = (datasetId: string) => {
    setHiddenDatasetIds((prev) => {
      return toggleHiddenDatasetId(
        sanitizeHiddenDatasetIds(prev, analytics.histogramDatasets),
        datasetId,
        analytics.histogramDatasets
      );
    });
  };

  const chartData = useMemo<ChartData<'bar'>>(
    () => ({
      labels: analytics.histogramLabels,
      datasets: visibleDatasets.map((dataset) => ({
        label: dataset.label,
        data: dataset.counts,
        backgroundColor: dataset.color,
        borderColor: dataset.color,
        borderWidth: 1,
        borderRadius: 999,
        borderSkipped: false,
        maxBarThickness: 12,
        categoryPercentage: 0.72,
        barPercentage: 0.82,
      })),
    }),
    [analytics.histogramLabels, visibleDatasets]
  );

  const chartOptions = useMemo<ChartOptions<'bar'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      onClick: (_event, elements) => {
        const selected = elements[0];
        if (!selected) return;
        setSelectedBucketState(
          buildSelectedQuotaBucketState({
            datasets: visibleDatasets,
            datasetIndex: selected.datasetIndex,
            bucketIndex: selected.index,
            histogramLabels: analytics.histogramLabels,
            fileMap,
          })
        );
      },
      onHover: (_event, elements, chart) => {
        chart.canvas.style.cursor = elements.length > 0 ? 'pointer' : 'default';
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ${ctx.parsed.x} ${t('quota_management.analytics.credentials_suffix')}`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: resolvedTheme === 'dark' ? '#b7bcc7' : '#6b7280',
          },
          grid: {
            color: resolvedTheme === 'dark' ? 'rgba(148, 163, 184, 0.16)' : 'rgba(148, 163, 184, 0.18)',
          },
        },
        y: {
          ticks: {
            color: resolvedTheme === 'dark' ? '#d7dbe4' : '#374151',
          },
          grid: {
            display: false,
          },
        },
      },
      animation: {
        duration: 420,
      },
    }),
    [analytics.histogramLabels, fileMap, resolvedTheme, t, visibleDatasets]
  );

  const hasHistogram = analytics.histogramDatasets.length > 0;

  return (
    <div className={styles.analyticsShell}>
      <div className={styles.analyticsChartPane}>
        <div className={styles.analyticsPaneHeader}>
          <div>
            <div className={styles.analyticsEyebrow}>{providerLabel}</div>
            <h4 className={styles.analyticsTitle}>{t('quota_management.analytics.histogram_title')}</h4>
          </div>
          <div className={styles.analyticsNoteGroup}>
            <div className={styles.analyticsNote}>
              <div className={styles.analyticsNoteText}>{analytics.note}</div>
              {showCoverage ? (
                <div className={styles.analyticsNoteMeta}>
                  <span>{t('quota_management.analytics.coverage_label')}</span>
                  <span>
                    {coveragePercent === null ? '--' : formatPercent(coveragePercent)} ·{' '}
                    {analytics.loadedFiles}/{analytics.totalFiles}
                  </span>
                </div>
              ) : null}
            </div>
            {showFullLoadAction ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={onRequestFullLoad}
                disabled={fullLoadBusy}
              >
                {t('quota_management.analytics.load_full_quota')}
              </Button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className={styles.analyticsHint}>{t('common.loading')}</div>
        ) : analytics.mode === 'usage-only' ? (
          <div className={styles.analyticsHint}>{t('quota_management.analytics.usage_only_histogram_hint')}</div>
        ) : hasHistogram ? (
          <>
            {hydrating ? (
              <div className={styles.analyticsProgress} aria-live="polite">
                <div className={styles.analyticsProgressHeader}>
                  <span className={styles.analyticsProgressLabel}>{t('common.loading')}</span>
                  <span className={styles.analyticsProgressValue}>
                    {Math.min(hydrationCompleted, hydrationTotal)}/{hydrationTotal} ·{' '}
                    {formatPercent(hydrationPercent)}
                  </span>
                </div>
                <div className={styles.analyticsProgressBar} aria-hidden="true">
                  <div
                    className={styles.analyticsProgressBarFill}
                    style={{ width: `${hydrationPercent}%` }}
                  />
                </div>
              </div>
            ) : null}
            <div className={styles.analyticsLegend} aria-label={t('quota_management.analytics.legend_label')}>
              <div className={styles.analyticsLegendSummary}>
                <span className={styles.analyticsLegendSummaryText}>
                  {t('quota_management.analytics.legend_visibility', {
                    visible: visibleDatasets.length,
                    total: analytics.histogramDatasets.length,
                  })}
                </span>
                {hiddenDatasetCount > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setHiddenDatasetIds([])}>
                    {t('quota_management.analytics.legend_reset')}
                  </Button>
                ) : null}
              </div>
              {analytics.histogramDatasets.map((dataset) => (
                <button
                  key={dataset.id}
                  type="button"
                  className={`${styles.analyticsLegendItem} ${
                    effectiveHiddenDatasetIds.includes(dataset.id)
                      ? styles.analyticsLegendItemMuted
                      : ''
                  }`}
                  onClick={() => toggleDatasetVisibility(dataset.id)}
                  aria-pressed={!effectiveHiddenDatasetIds.includes(dataset.id)}
                  title={t('quota_management.analytics.legend_toggle')}
                >
                  <span
                    className={styles.analyticsLegendDot}
                    style={{ backgroundColor: dataset.color }}
                  />
                  <span className={styles.analyticsLegendText}>
                    {dataset.label}
                    {dataset.averageRemaining !== null
                      ? ` · ${formatPercent(dataset.averageRemaining)}`
                      : ''}
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.analyticsChartCanvas}>
              <Bar data={chartData} options={chartOptions} />
            </div>
          </>
        ) : (
          <div className={styles.analyticsHint}>{t('quota_management.analytics.no_histogram')}</div>
        )}
      </div>

      <div className={styles.analyticsSummaryPane}>
        {analytics.warnings.length > 0 ? (
          <div className={styles.analyticsWarningList}>
            {analytics.warnings.map((warning) => (
              <div
                key={warning.id}
                className={`${styles.analyticsWarningItem} ${
                  warning.level === 'danger' ? styles.analyticsWarningDanger : styles.analyticsWarningWarn
                }`}
              >
                {warning.message}
              </div>
            ))}
          </div>
        ) : null}
        <div className={styles.analyticsHealthGrid}>
          {analytics.mode === 'quota' ? (
            <>
              <div className={styles.analyticsHealthCard}>
                <div className={styles.analyticsMetricLabel}>
                  {t('quota_management.analytics.conservative_health')}
                </div>
                <div
                  className={`${styles.analyticsMetricValue} ${getHealthToneClass(analytics.conservativeHealth)}`}
                >
                  {formatPercent(analytics.conservativeHealth)}
                </div>
                <div className={styles.analyticsMetricMeta}>
                  {t('quota_management.analytics.risk_eta')}: {formatDays(analytics.conservativeRiskDays, t)}
                </div>
              </div>
              <div className={styles.analyticsHealthCard}>
                <div className={styles.analyticsMetricLabel}>
                  {t('quota_management.analytics.average_health')}
                </div>
                <div
                  className={`${styles.analyticsMetricValue} ${getHealthToneClass(analytics.averageHealth)}`}
                >
                  {formatPercent(analytics.averageHealth)}
                </div>
                <div className={styles.analyticsMetricMeta}>
                  {t('quota_management.analytics.risk_eta')}: {formatDays(analytics.averageRiskDays, t)}
                </div>
              </div>
            </>
          ) : (
            <div className={styles.analyticsHealthCard}>
              <div className={styles.analyticsMetricLabel}>
                {t('quota_management.analytics.operational_health')}
              </div>
              <div
                className={`${styles.analyticsMetricValue} ${getHealthToneClass(analytics.operationalHealth)}`}
              >
                {formatPercent(analytics.operationalHealth)}
              </div>
              <div className={styles.analyticsMetricMeta}>{analytics.note}</div>
            </div>
          )}
        </div>

        <div className={styles.analyticsMetaGrid}>
          <div className={styles.analyticsMetaCard}>
            <span className={styles.analyticsMetaLabel}>{t('quota_management.analytics.pool_size')}</span>
            <strong className={styles.analyticsMetaValue}>{analytics.totalFiles}</strong>
          </div>
          <div className={styles.analyticsMetaCard}>
            <span className={styles.analyticsMetaLabel}>{t('quota_management.analytics.active_pool_share')}</span>
            <strong className={styles.analyticsMetaValue}>{formatPercent(analytics.activePoolPercent7d)}</strong>
          </div>
          <div className={styles.analyticsMetaCard}>
            <span className={styles.analyticsMetaLabel}>{t('quota_management.analytics.unavailable_count')}</span>
            <strong className={styles.analyticsMetaValue}>{analytics.unavailableFiles}</strong>
          </div>
          <div className={styles.analyticsMetaCard}>
            <span className={styles.analyticsMetaLabel}>
              {analytics.mode === 'quota'
                ? t('quota_management.analytics.loaded_snapshots')
                : t('quota_management.analytics.disabled_count')}
            </span>
            <strong className={styles.analyticsMetaValue}>
              {analytics.mode === 'quota' ? `${analytics.loadedFiles}/${analytics.totalFiles}` : analytics.disabledFiles}
            </strong>
          </div>
          <div className={styles.analyticsMetaCard}>
            <span className={styles.analyticsMetaLabel}>
              {t('quota_management.analytics.avg_daily_quota_burn')}
            </span>
            <strong className={styles.analyticsMetaValue}>
              {analytics.mode === 'quota'
                ? formatPercent(analytics.avgDailyQuotaBurnPercent)
                : t('quota_management.analytics.not_available')}
            </strong>
          </div>
        </div>

        <div className={styles.analyticsWindowGrid}>
          {analytics.windowStats.map((window) => (
            <div key={window.id} className={styles.analyticsWindowCard}>
              <div className={styles.analyticsWindowHeader}>
                <span className={styles.analyticsWindowLabel}>{window.label}</span>
                <span className={styles.analyticsWindowShare}>
                  {formatPercent(window.activePoolPercent)}
                </span>
              </div>
              <div className={styles.analyticsWindowPrimary}>
                <span>{t('quota_management.analytics.requests_short')}</span>
                <strong>{formatCompactNumber(window.requestCount)}</strong>
              </div>
              <div className={styles.analyticsWindowPrimary}>
                <span>{t('quota_management.analytics.tokens_short')}</span>
                <strong>{formatCompactNumber(window.tokenCount)}</strong>
              </div>
              <div className={styles.analyticsWindowMeta}>
                <span>
                  {t('quota_management.analytics.failure_rate_short')}: {formatPercent(window.failureRate)}
                </span>
                <span>
                  {t('quota_management.analytics.avg_daily_requests_short')}: {formatCompactNumber(window.avgDailyRequests)}
                </span>
                <span>
                  {t('quota_management.analytics.avg_daily_tokens_short')}: {formatCompactNumber(window.avgDailyTokens)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <QuotaBucketFilesModal
        open={selectedBucket !== null}
        onClose={() => setSelectedBucketState(null)}
        providerKey={providerKey}
        providerLabel={providerLabel}
        datasetId={selectedBucket?.datasetId ?? ''}
        datasetLabel={selectedBucket?.datasetLabel ?? ''}
        bucketIndex={selectedBucket?.bucketIndex ?? 0}
        bucketLabel={selectedBucket?.bucketLabel ?? ''}
        items={selectedBucket?.items ?? []}
        platformBacked={Boolean(precomputedAnalytics)}
      />
    </div>
  );
}
