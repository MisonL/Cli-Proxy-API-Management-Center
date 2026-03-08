import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useThemeStore, useConfigStore } from '@/stores';
import {
  StatCards,
  UsageChart,
  ChartLineSelector,
  ApiDetailsCard,
  ModelStatsCard,
  PriceSettingsCard,
  CredentialStatsCard,
  RequestEventsDetailsCard,
  TokenBreakdownChart,
  CostTrendChart,
  ServiceHealthCard,
  useUsageData,
  useSparklines,
  useChartData,
} from '@/components/usage';
import {
  HOUR_WINDOW_BY_TIME_RANGE,
  MAX_CHART_LINES,
  buildUsageTimeRangeOptions,
  loadStoredUsageChartLines,
  loadStoredUsageTimeRange,
  normalizeUsageChartLines,
  saveStoredUsageChartLines,
  saveStoredUsageTimeRange,
} from '@/components/usage/usagePageState';
import { UsagePersistenceStatusPanel } from '@/components/usage/UsagePersistenceStatusPanel';
import { formatUsageDateTime } from '@/components/usage/usagePersistence';
import {
  getModelNamesFromUsage,
  getApiStats,
  getModelStats,
  filterUsageByTimeRange,
  type UsageTimeRange,
} from '@/utils/usage';
import styles from './UsagePage.module.scss';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export function UsagePage() {
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const isDark = resolvedTheme === 'dark';
  const config = useConfigStore((state) => state.config);

  // Data hook
  const {
    usage,
    loading,
    error,
    lastRefreshedAt,
    persistenceStatus,
    modelPrices,
    setModelPrices,
    loadUsage,
    loadPersistenceStatus,
    handleExport,
    handleImport,
    handleImportChange,
    confirmImport,
    closeImportPreview,
    importInputRef,
    importPreview,
    exporting,
    importing,
  } = useUsageData();

  const handleRefresh = useCallback(async () => {
    await Promise.all([loadUsage(), loadPersistenceStatus()]);
  }, [loadPersistenceStatus, loadUsage]);
  const triggerRefresh = useCallback(() => {
    void handleRefresh().catch(() => {});
  }, [handleRefresh]);

  useHeaderRefresh(handleRefresh);

  // Chart lines state
  const [chartLines, setChartLines] = useState<string[]>(loadStoredUsageChartLines);
  const [timeRange, setTimeRange] = useState<UsageTimeRange>(loadStoredUsageTimeRange);

  const timeRangeOptions = useMemo(() => buildUsageTimeRangeOptions(t), [t]);

  const filteredUsage = useMemo(
    () => (usage ? filterUsageByTimeRange(usage, timeRange) : null),
    [usage, timeRange]
  );
  const hourWindowHours = timeRange === 'all' ? undefined : HOUR_WINDOW_BY_TIME_RANGE[timeRange];

  const handleChartLinesChange = useCallback((lines: string[]) => {
    setChartLines(normalizeUsageChartLines(lines));
  }, []);

  useEffect(() => {
    saveStoredUsageChartLines(chartLines);
  }, [chartLines]);

  useEffect(() => {
    saveStoredUsageTimeRange(timeRange);
  }, [timeRange]);

  const nowMs = lastRefreshedAt?.getTime() ?? 0;

  // Sparklines hook
  const { requestsSparkline, tokensSparkline, rpmSparkline, tpmSparkline, costSparkline } =
    useSparklines({ usage: filteredUsage, loading, nowMs });

  // Chart data hook
  const {
    requestsPeriod,
    setRequestsPeriod,
    tokensPeriod,
    setTokensPeriod,
    requestsChartData,
    tokensChartData,
    requestsChartOptions,
    tokensChartOptions,
  } = useChartData({ usage: filteredUsage, chartLines, isDark, isMobile, hourWindowHours });

  // Derived data
  const modelNames = useMemo(() => getModelNamesFromUsage(usage), [usage]);
  const apiStats = useMemo(
    () => getApiStats(filteredUsage, modelPrices),
    [filteredUsage, modelPrices]
  );
  const modelStats = useMemo(
    () => getModelStats(filteredUsage, modelPrices),
    [filteredUsage, modelPrices]
  );
  const hasPrices = Object.keys(modelPrices).length > 0;

  return (
    <div className={styles.container}>
      {loading && !usage && (
        <div className={styles.loadingOverlay} aria-busy="true">
          <div className={styles.loadingOverlayContent}>
            <LoadingSpinner size={28} className={styles.loadingOverlaySpinner} />
            <span className={styles.loadingOverlayText}>{t('common.loading')}</span>
          </div>
        </div>
      )}

      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{t('usage_stats.title')}</h1>
        <div className={styles.headerActions}>
          <div className={styles.timeRangeGroup}>
            <span className={styles.timeRangeLabel}>{t('usage_stats.range_filter')}</span>
            <Select
              value={timeRange}
              options={timeRangeOptions}
              onChange={(value) => setTimeRange(value as UsageTimeRange)}
              className={styles.timeRangeSelectControl}
              ariaLabel={t('usage_stats.range_filter')}
              fullWidth={false}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            loading={exporting}
            disabled={loading || importing}
          >
            {t('usage_stats.export')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleImport}
            loading={importing}
            disabled={loading || exporting}
          >
            {t('usage_stats.import')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={triggerRefresh}
            disabled={loading || exporting || importing}
          >
            {loading ? t('common.loading') : t('usage_stats.refresh')}
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleImportChange}
          />
          {lastRefreshedAt && (
            <span className={styles.lastRefreshed}>
              {t('usage_stats.last_updated')}: {lastRefreshedAt.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <Card
        title={t('usage_stats.persistence_title')}
        extra={
          <Button
            variant="secondary"
            size="sm"
            onClick={triggerRefresh}
            disabled={loading || exporting || importing}
          >
            {t('common.refresh')}
          </Button>
        }
      >
        <UsagePersistenceStatusPanel status={persistenceStatus} />
      </Card>

      {/* Stats Overview Cards */}
      <StatCards
        usage={filteredUsage}
        loading={loading}
        modelPrices={modelPrices}
        nowMs={nowMs}
        sparklines={{
          requests: requestsSparkline,
          tokens: tokensSparkline,
          rpm: rpmSparkline,
          tpm: tpmSparkline,
          cost: costSparkline,
        }}
      />

      {/* Chart Line Selection */}
      <ChartLineSelector
        chartLines={chartLines}
        modelNames={modelNames}
        maxLines={MAX_CHART_LINES}
        onChange={handleChartLinesChange}
      />

      {/* Service Health */}
      <ServiceHealthCard usage={usage} loading={loading} />

      {/* Charts Grid */}
      <div className={styles.chartsGrid}>
        <UsageChart
          title={t('usage_stats.requests_trend')}
          period={requestsPeriod}
          onPeriodChange={setRequestsPeriod}
          chartData={requestsChartData}
          chartOptions={requestsChartOptions}
          loading={loading}
          isMobile={isMobile}
          emptyText={t('usage_stats.no_data')}
        />
        <UsageChart
          title={t('usage_stats.tokens_trend')}
          period={tokensPeriod}
          onPeriodChange={setTokensPeriod}
          chartData={tokensChartData}
          chartOptions={tokensChartOptions}
          loading={loading}
          isMobile={isMobile}
          emptyText={t('usage_stats.no_data')}
        />
      </div>

      {/* Token Breakdown Chart */}
      <TokenBreakdownChart
        usage={filteredUsage}
        loading={loading}
        isDark={isDark}
        isMobile={isMobile}
        hourWindowHours={hourWindowHours}
      />

      {/* Cost Trend Chart */}
      <CostTrendChart
        usage={filteredUsage}
        loading={loading}
        isDark={isDark}
        isMobile={isMobile}
        modelPrices={modelPrices}
        hourWindowHours={hourWindowHours}
      />

      {/* Details Grid */}
      <div className={styles.detailsGrid}>
        <ApiDetailsCard apiStats={apiStats} loading={loading} hasPrices={hasPrices} />
        <ModelStatsCard modelStats={modelStats} loading={loading} hasPrices={hasPrices} />
      </div>

      <RequestEventsDetailsCard
        usage={filteredUsage}
        loading={loading}
        geminiKeys={config?.geminiApiKeys || []}
        claudeConfigs={config?.claudeApiKeys || []}
        codexConfigs={config?.codexApiKeys || []}
        vertexConfigs={config?.vertexApiKeys || []}
        openaiProviders={config?.openaiCompatibility || []}
      />

      {/* Credential Stats */}
      <CredentialStatsCard
        usage={filteredUsage}
        loading={loading}
        geminiKeys={config?.geminiApiKeys || []}
        claudeConfigs={config?.claudeApiKeys || []}
        codexConfigs={config?.codexApiKeys || []}
        vertexConfigs={config?.vertexApiKeys || []}
        openaiProviders={config?.openaiCompatibility || []}
      />

      {/* Price Settings */}
      <PriceSettingsCard
        modelNames={modelNames}
        modelPrices={modelPrices}
        onPricesChange={setModelPrices}
      />

      <Modal
        open={importPreview !== null}
        onClose={closeImportPreview}
        title={t('usage_stats.import_preview_title')}
        footer={
          <>
            <Button variant="secondary" onClick={closeImportPreview} disabled={importing}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void confirmImport()} loading={importing}>
              {t('usage_stats.import_confirm')}
            </Button>
          </>
        }
      >
        {importPreview ? (
          <div className={styles.importPreview}>
            <div className="status-badge warning">{t('usage_stats.import_merge_notice')}</div>
            <div className={styles.importPreviewGrid}>
              <div className={styles.importPreviewItem}>
                <span>{t('usage_stats.import_file_name')}</span>
                <strong>{importPreview.fileName}</strong>
              </div>
              <div className={styles.importPreviewItem}>
                <span>{t('usage_stats.import_version')}</span>
                <strong>{importPreview.version ?? '--'}</strong>
              </div>
              <div className={styles.importPreviewItem}>
                <span>{t('usage_stats.import_exported_at')}</span>
                <strong>{formatUsageDateTime(importPreview.exportedAt)}</strong>
              </div>
              <div className={styles.importPreviewItem}>
                <span>{t('usage_stats.total_requests')}</span>
                <strong>{importPreview.totalRequests}</strong>
              </div>
              <div className={styles.importPreviewItem}>
                <span>{t('usage_stats.failed_requests')}</span>
                <strong>{importPreview.failureCount}</strong>
              </div>
              <div className={styles.importPreviewItem}>
                <span>{t('usage_stats.total_tokens')}</span>
                <strong>{importPreview.totalTokens}</strong>
              </div>
              <div className={styles.importPreviewItem}>
                <span>{t('usage_stats.import_api_count')}</span>
                <strong>{importPreview.apiCount}</strong>
              </div>
              <div className={styles.importPreviewItem}>
                <span>{t('usage_stats.import_model_count')}</span>
                <strong>{importPreview.modelCount}</strong>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
