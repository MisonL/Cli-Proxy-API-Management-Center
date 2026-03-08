import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { USAGE_STATS_STALE_TIME_MS, useNotificationStore, useUsageStatsStore } from '@/stores';
import {
  buildUsageExportFilename,
  buildUsageImportPreview,
  type UsageImportPreview,
} from '@/components/usage/usageImportPreview';
import { usageApi } from '@/services/api/usage';
import { downloadBlob } from '@/utils/download';
import { loadModelPrices, saveModelPrices, type ModelPrice } from '@/utils/usage';
import type { UsagePersistenceStatus } from '@/types';

export interface UsagePayload {
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  apis?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UseUsageDataReturn {
  usage: UsagePayload | null;
  loading: boolean;
  error: string;
  lastRefreshedAt: Date | null;
  persistenceStatus: UsagePersistenceStatus | null;
  modelPrices: Record<string, ModelPrice>;
  setModelPrices: (prices: Record<string, ModelPrice>) => void;
  loadUsage: () => Promise<void>;
  loadPersistenceStatus: () => Promise<void>;
  handleExport: () => Promise<void>;
  handleImport: () => void;
  handleImportChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  confirmImport: () => Promise<void>;
  closeImportPreview: () => void;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  importPreview: UsageImportPreview | null;
  exporting: boolean;
  importing: boolean;
}

export function useUsageData(): UseUsageDataReturn {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const usageSnapshot = useUsageStatsStore((state) => state.usage);
  const loading = useUsageStatsStore((state) => state.loading);
  const storeError = useUsageStatsStore((state) => state.error);
  const lastRefreshedAtTs = useUsageStatsStore((state) => state.lastRefreshedAt);
  const loadUsageStats = useUsageStatsStore((state) => state.loadUsageStats);

  const [modelPrices, setModelPrices] = useState<Record<string, ModelPrice>>({});
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<UsagePersistenceStatus | null>(null);
  const [importPreview, setImportPreview] = useState<UsageImportPreview | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const loadUsage = useCallback(async () => {
    await loadUsageStats({ force: true, staleTimeMs: USAGE_STATS_STALE_TIME_MS });
  }, [loadUsageStats]);

  const loadPersistenceStatus = useCallback(async () => {
    const status = await usageApi.getPersistenceStatus();
    setPersistenceStatus(status ?? null);
  }, []);

  useEffect(() => {
    void loadUsageStats({ staleTimeMs: USAGE_STATS_STALE_TIME_MS }).catch(() => {});
    setModelPrices(loadModelPrices());
    void loadPersistenceStatus().catch(() => {});
  }, [loadPersistenceStatus, loadUsageStats]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await usageApi.exportUsage();
      downloadBlob({
        filename: buildUsageExportFilename(data?.exported_at),
        blob: new Blob([JSON.stringify(data ?? {}, null, 2)], { type: 'application/json' }),
      });
      showNotification(t('usage_stats.export_success'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(
        `${t('notification.download_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setExporting(false);
    }
  };

  const handleImport = () => {
    importInputRef.current?.click();
  };

  const handleImportChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        showNotification(t('usage_stats.import_invalid'), 'error');
        return;
      }
      const preview = buildUsageImportPreview(file.name, payload);
      if (!preview) {
        showNotification(t('usage_stats.import_invalid'), 'error');
        return;
      }
      setImportPreview(preview);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(
        `${t('notification.upload_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setImporting(false);
    }
  };

  const closeImportPreview = useCallback(() => {
    setImportPreview(null);
  }, []);

  const confirmImport = useCallback(async () => {
    if (!importPreview) return;
    setImporting(true);
    try {
      const result = await usageApi.importUsage(importPreview.payload);
      showNotification(
        t('usage_stats.import_success', {
          added: result?.added ?? 0,
          skipped: result?.skipped ?? 0,
          total: result?.total_requests ?? 0,
          failed: result?.failed_requests ?? 0,
        }),
        'success'
      );
      setImportPreview(null);
      await Promise.all([
        loadUsageStats({ force: true, staleTimeMs: USAGE_STATS_STALE_TIME_MS }),
        loadPersistenceStatus().catch(() => {}),
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(
        `${t('notification.upload_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setImporting(false);
    }
  }, [importPreview, loadPersistenceStatus, loadUsageStats, showNotification, t]);

  const handleSetModelPrices = useCallback((prices: Record<string, ModelPrice>) => {
    setModelPrices(prices);
    saveModelPrices(prices);
  }, []);

  const usage = usageSnapshot as UsagePayload | null;
  const error = storeError || '';
  const lastRefreshedAt = lastRefreshedAtTs ? new Date(lastRefreshedAtTs) : null;

  return {
    usage,
    loading,
    error,
    lastRefreshedAt,
    persistenceStatus,
    modelPrices,
    setModelPrices: handleSetModelPrices,
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
  };
}
