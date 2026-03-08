/**
 * Quota management page - coordinates the three quota sections.
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore, useNotificationStore, useUsageStatsStore } from '@/stores';
import { authFilesApi, configFileApi } from '@/services/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  QuotaSection,
  QuotaAnalyticsSection,
  ANTIGRAVITY_CONFIG,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  GEMINI_CLI_CONFIG,
  KIMI_CONFIG,
} from '@/components/quota';
import type { AuthFileItem } from '@/types';
import { getTypeLabel, QUOTA_PROVIDER_TYPES } from '@/features/authFiles/constants';
import {
  DEFAULT_QUOTA_WARNING_THRESHOLDS,
  type QuotaWarningThresholds,
} from '@/components/quota/quotaAnalytics';
import {
  loadStoredQuotaWarningThresholds,
  parseImportedQuotaWarningThresholds,
  saveStoredQuotaWarningThresholds,
  serializeQuotaWarningThresholds,
  updateQuotaWarningThreshold,
} from '@/components/quota/quotaWarningThresholds';
import { downloadBlob } from '@/utils/download';
import styles from './QuotaPage.module.scss';

const ANALYTICS_ONLY_PROVIDER_ORDER = ['qwen', 'gemini', 'vertex', 'iflow', 'aistudio', 'unknown'];
const WARNING_THRESHOLD_FIELDS = [
  { key: 'healthLowPercent', label: 'quota_management.analytics.warning_settings_health', max: 100 },
  { key: 'riskDays', label: 'quota_management.analytics.warning_settings_risk_days', max: 30 },
  { key: 'snapshotCoveragePercent', label: 'quota_management.analytics.warning_settings_snapshot', max: 100 },
  { key: 'failureRate24hPercent', label: 'quota_management.analytics.warning_settings_failure', max: 100 },
  { key: 'activePoolPercent7d', label: 'quota_management.analytics.warning_settings_activity', max: 100 },
] as const;

export function QuotaPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const usageDetails = useUsageStatsStore((state) => state.usageDetails);
  const usageLoading = useUsageStatsStore((state) => state.loading);
  const usageError = useUsageStatsStore((state) => state.error);
  const loadUsageStats = useUsageStatsStore((state) => state.loadUsageStats);

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warningThresholds, setWarningThresholds] = useState<QuotaWarningThresholds>(
    DEFAULT_QUOTA_WARNING_THRESHOLDS
  );
  const thresholdImportRef = useRef<HTMLInputElement | null>(null);

  const disableControls = connectionStatus !== 'connected';

  const loadConfig = useCallback(async () => {
    try {
      await configFileApi.fetchConfigYaml();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError((prev) => prev || errorMessage);
    }
  }, [t]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await authFilesApi.list();
      setFiles(data?.files || []);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleHeaderRefresh = useCallback(async () => {
    await Promise.all([loadConfig(), loadFiles(), loadUsageStats({ force: true })]);
  }, [loadConfig, loadFiles, loadUsageStats]);

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    setWarningThresholds(loadStoredQuotaWarningThresholds());
  }, []);

  useEffect(() => {
    saveStoredQuotaWarningThresholds(warningThresholds);
  }, [warningThresholds]);

  useEffect(() => {
    loadFiles();
    loadConfig();
    void loadUsageStats();
  }, [loadFiles, loadConfig, loadUsageStats]);

  const analyticsOnlyProviders = Array.from(
    new Set(
      files
        .map((file) =>
          String(file.type || file.provider || 'unknown')
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
        .filter((provider) => !QUOTA_PROVIDER_TYPES.has(provider as never))
    )
  ).sort((a, b) => {
    const orderA = ANALYTICS_ONLY_PROVIDER_ORDER.indexOf(a);
    const orderB = ANALYTICS_ONLY_PROVIDER_ORDER.indexOf(b);
    const normalizedA = orderA === -1 ? Number.MAX_SAFE_INTEGER : orderA;
    const normalizedB = orderB === -1 ? Number.MAX_SAFE_INTEGER : orderB;
    if (normalizedA !== normalizedB) return normalizedA - normalizedB;
    return a.localeCompare(b);
  });

  const handleExportThresholds = useCallback(() => {
    const payload = serializeQuotaWarningThresholds(warningThresholds);
    downloadBlob({
      filename: `quota-warning-thresholds-${payload.exported_at.replace(/[:.]/g, '-')}.json`,
      blob: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    });
    showNotification(t('quota_management.analytics.warning_settings_export_success'), 'success');
  }, [showNotification, t, warningThresholds]);

  const handleImportThresholdsClick = useCallback(() => {
    thresholdImportRef.current?.click();
  }, []);

  const handleImportThresholdsChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const thresholds = parseImportedQuotaWarningThresholds(parsed);
        setWarningThresholds(thresholds);
        showNotification(
          t('quota_management.analytics.warning_settings_import_success'),
          'success'
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '';
        showNotification(
          `${t('quota_management.analytics.warning_settings_import_failed')}${message ? `: ${message}` : ''}`,
          'error'
        );
      }
    },
    [showNotification, t]
  );

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('quota_management.title')}</h1>
        <p className={styles.description}>{t('quota_management.description')}</p>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}
      {usageError && <div className={styles.errorBox}>{usageError}</div>}

      <Card
        title={t('quota_management.analytics.warning_settings_title')}
        extra={
          <div className={styles.headerActions}>
            <Button variant="secondary" size="sm" onClick={handleExportThresholds}>
              {t('quota_management.analytics.warning_settings_export')}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleImportThresholdsClick}>
              {t('quota_management.analytics.warning_settings_import')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWarningThresholds(DEFAULT_QUOTA_WARNING_THRESHOLDS)}
            >
              {t('quota_management.analytics.warning_settings_reset')}
            </Button>
            <input
              ref={thresholdImportRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={(e) => void handleImportThresholdsChange(e)}
            />
          </div>
        }
      >
        <p className={styles.description}>
          {t('quota_management.analytics.warning_settings_desc')}
        </p>
        <div className={styles.analyticsThresholdGrid}>
          {WARNING_THRESHOLD_FIELDS.map((field) => (
            <div key={field.key} className={styles.antigravityControl}>
              <label>{t(field.label)}</label>
              <input
                className={styles.pageSizeSelect}
                type="number"
                min={0}
                max={field.max}
                value={warningThresholds[field.key]}
                onChange={(e) =>
                  setWarningThresholds((prev) =>
                    updateQuotaWarningThreshold(prev, field.key, e.target.value)
                  )
                }
              />
            </div>
          ))}
        </div>
      </Card>

      <QuotaSection
        config={CLAUDE_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        usageDetails={usageDetails}
        usageLoading={usageLoading}
        warningThresholds={warningThresholds}
      />
      <QuotaSection
        config={ANTIGRAVITY_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        usageDetails={usageDetails}
        usageLoading={usageLoading}
        warningThresholds={warningThresholds}
      />
      <QuotaSection
        config={CODEX_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        usageDetails={usageDetails}
        usageLoading={usageLoading}
        warningThresholds={warningThresholds}
      />
      <QuotaSection
        config={GEMINI_CLI_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        usageDetails={usageDetails}
        usageLoading={usageLoading}
        warningThresholds={warningThresholds}
      />
      <QuotaSection
        config={KIMI_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        usageDetails={usageDetails}
        usageLoading={usageLoading}
        warningThresholds={warningThresholds}
      />
      {analyticsOnlyProviders.map((providerKey) => {
        const providerFiles = files.filter(
          (file) =>
            String(file.type || file.provider || 'unknown')
              .trim()
              .toLowerCase() === providerKey
        );
        return (
          <QuotaAnalyticsSection
            key={providerKey}
            providerKey={providerKey}
            providerLabel={`${getTypeLabel(t, providerKey)} ${t('quota_management.analytics.section_suffix')}`}
            files={providerFiles}
            usageDetails={usageDetails}
            loading={loading || usageLoading}
            disabled={disableControls}
            warningThresholds={warningThresholds}
          />
        );
      })}
    </div>
  );
}
