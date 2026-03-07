/**
 * Quota management page - coordinates the three quota sections.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore, useUsageStatsStore } from '@/stores';
import { authFilesApi, configFileApi } from '@/services/api';
import {
  QuotaSection,
  QuotaAnalyticsSection,
  ANTIGRAVITY_CONFIG,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  GEMINI_CLI_CONFIG,
  KIMI_CONFIG
} from '@/components/quota';
import type { AuthFileItem } from '@/types';
import { getTypeLabel, QUOTA_PROVIDER_TYPES } from '@/features/authFiles/constants';
import styles from './QuotaPage.module.scss';

const ANALYTICS_ONLY_PROVIDER_ORDER = ['qwen', 'gemini', 'vertex', 'iflow', 'aistudio', 'unknown'];

export function QuotaPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const usageDetails = useUsageStatsStore((state) => state.usageDetails);
  const usageLoading = useUsageStatsStore((state) => state.loading);
  const usageError = useUsageStatsStore((state) => state.error);
  const loadUsageStats = useUsageStatsStore((state) => state.loadUsageStats);

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    loadFiles();
    loadConfig();
    void loadUsageStats();
  }, [loadFiles, loadConfig, loadUsageStats]);

  const analyticsOnlyProviders = Array.from(
    new Set(
      files
        .map((file) => String(file.type || file.provider || 'unknown').trim().toLowerCase())
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

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('quota_management.title')}</h1>
        <p className={styles.description}>{t('quota_management.description')}</p>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}
      {usageError && <div className={styles.errorBox}>{usageError}</div>}

      <QuotaSection
        config={CLAUDE_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        usageDetails={usageDetails}
        usageLoading={usageLoading}
      />
      <QuotaSection
        config={ANTIGRAVITY_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        usageDetails={usageDetails}
        usageLoading={usageLoading}
      />
      <QuotaSection
        config={CODEX_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        usageDetails={usageDetails}
        usageLoading={usageLoading}
      />
      <QuotaSection
        config={GEMINI_CLI_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        usageDetails={usageDetails}
        usageLoading={usageLoading}
      />
      <QuotaSection
        config={KIMI_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        usageDetails={usageDetails}
        usageLoading={usageLoading}
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
          />
        );
      })}
    </div>
  );
}
