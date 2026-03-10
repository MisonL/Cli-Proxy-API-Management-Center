import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { IconDownload } from '@/components/ui/icons';
import { credentialsApi, platformApi } from '@/services/api';
import type { HistogramBucketItemRow } from '@/services/api/platform';
import { useNotificationStore, useThemeStore } from '@/stores';
import type { CredentialItem } from '@/types/credential';
import { downloadBlob } from '@/utils/download';
import { formatFileSize } from '@/utils/format';
import { formatModified, getTypeColor, getTypeLabel } from '@/features/credentials/constants';
import { createCredentialsBatchArchive } from '@/features/credentials/batchDownload';
import type { AnalyticsBucketItem } from './quotaAnalytics';
import styles from '@/pages/QuotaPage.module.scss';

type QuotaBucketFileModalItem = AnalyticsBucketItem & {
  file?: CredentialItem;
};

type QuotaBucketFilesModalProps = {
  open: boolean;
  providerKey: string;
  providerLabel: string;
  datasetId: string;
  datasetLabel: string;
  bucketIndex: number;
  bucketLabel: string;
  items: QuotaBucketFileModalItem[];
  platformBacked?: boolean;
  onClose: () => void;
};

const formatPercent = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value) ? '--' : `${value.toFixed(1)}%`;

const formatResetAt = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
};

const sanitizeArchiveSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'bucket';

export function QuotaBucketFilesModal({
  open,
  providerKey,
  providerLabel,
  datasetId,
  datasetLabel,
  bucketIndex,
  bucketLabel,
  items,
  platformBacked = false,
  onClose,
}: QuotaBucketFilesModalProps) {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [downloadingName, setDownloadingName] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ completed: number; total: number } | null>(
    null
  );
  const [remoteItems, setRemoteItems] = useState<QuotaBucketFileModalItem[]>([]);
  const [remoteTotal, setRemoteTotal] = useState(0);
  const [remotePage, setRemotePage] = useState(1);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const remotePageSize = 200;

  useEffect(() => {
    if (!open || !platformBacked) return;
    setRemoteItems([]);
    setRemoteTotal(0);
    setRemoteError(null);
    setRemotePage(1);
    setDownloadProgress(null);
  }, [open, platformBacked, providerKey, datasetId, bucketIndex]);

  useEffect(() => {
    if (!open || !platformBacked) return;
    let canceled = false;

    const mapRemoteItem = (item: HistogramBucketItemRow): QuotaBucketFileModalItem => {
      const fileName = item.credential_name?.trim() || item.credential_id;
      const file: CredentialItem = {
        id: item.credential_id,
        name: fileName,
        type: providerKey,
        provider: providerKey,
        platformBacked: true,
        disabled: item.disabled,
        unavailable: item.unavailable,
        quotaExceeded: item.quota_exceeded,
      };
      return {
        credentialId: item.credential_id,
        fileName,
        remainingPercent: item.remaining_percent,
        resetAt: item.reset_at ?? undefined,
        file,
      };
    };

    void (async () => {
      try {
        setRemoteLoading(true);
        setRemoteError(null);
        const response = await platformApi.getHistogramBucketItems(providerKey, datasetId, bucketIndex, {
          page: remotePage,
          pageSize: remotePageSize,
        });
        if (canceled) return;
        setRemoteTotal(Number.isFinite(response.total) ? response.total : 0);
        setRemoteItems(Array.isArray(response.items) ? response.items.map(mapRemoteItem) : []);
      } catch (err: unknown) {
        if (canceled) return;
        setRemoteTotal(0);
        setRemoteItems([]);
        setRemoteError(err instanceof Error ? err.message : t('notification.refresh_failed'));
      } finally {
        if (!canceled) setRemoteLoading(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [
    bucketIndex,
    datasetId,
    open,
    platformBacked,
    providerKey,
    remotePage,
    t,
  ]);

  useEffect(() => {
    if (open) return;
    setRemoteItems([]);
    setRemoteTotal(0);
    setRemotePage(1);
    setRemoteLoading(false);
    setRemoteError(null);
    setDownloadProgress(null);
  }, [open]);

  const effectiveItems = platformBacked ? remoteItems : items;
  const effectiveTotal = platformBacked ? remoteTotal : effectiveItems.length;
  const totalPages = platformBacked ? Math.max(1, Math.ceil(remoteTotal / remotePageSize)) : 1;

  const sortedItems = useMemo(
    () =>
      [...effectiveItems].sort((left, right) => {
        if (right.remainingPercent !== left.remainingPercent) {
          return right.remainingPercent - left.remainingPercent;
        }
        return left.fileName.localeCompare(right.fileName);
      }),
    [effectiveItems]
  );

  const handleSingleDownload = async (item: QuotaBucketFileModalItem) => {
    try {
      setDownloadingName(item.fileName);
      const text = await credentialsApi.downloadText(
        item.file ?? { name: item.fileName, id: item.credentialId, platformBacked: Boolean(item.credentialId) }
      );
      downloadBlob({
        filename: item.fileName,
        blob: new Blob([text], { type: 'application/json;charset=utf-8' }),
      });
      showNotification(t('credentials.download_success'), 'success');
    } catch (error) {
      console.error(error);
      showNotification(t('notification.download_failed'), 'error');
    } finally {
      setDownloadingName((current) => (current === item.fileName ? null : current));
    }
  };

  const handleDownloadAll = async () => {
    if (effectiveTotal === 0) return;

    try {
      setDownloadingAll(true);
      setDownloadProgress({ completed: 0, total: effectiveTotal });
      const allItems = platformBacked
        ? await (async () => {
            const pages = Math.max(1, Math.ceil(remoteTotal / remotePageSize));
            const seen = new Set<string>();
            const collected: QuotaBucketFileModalItem[] = [];
            for (let page = 1; page <= pages; page += 1) {
              const response = await platformApi.getHistogramBucketItems(providerKey, datasetId, bucketIndex, {
                page,
                pageSize: remotePageSize,
              });
              const pageItems = Array.isArray(response.items) ? response.items : [];
              for (const item of pageItems) {
                const id = String(item.credential_id);
                if (!id || seen.has(id)) continue;
                seen.add(id);
                const fileName = item.credential_name?.trim() || id;
                collected.push({
                  credentialId: id,
                  fileName,
                  remainingPercent: item.remaining_percent,
                  resetAt: item.reset_at ?? undefined,
                  file: {
                    id,
                    name: fileName,
                    type: providerKey,
                    provider: providerKey,
                    platformBacked: true,
                    disabled: item.disabled,
                    unavailable: item.unavailable,
                    quotaExceeded: item.quota_exceeded,
                  },
                });
              }
            }
            return collected;
          })()
        : sortedItems;
      const { archive, feedback } = await createCredentialsBatchArchive(
        allItems.map((item) => ({
          archiveName: item.fileName,
          label: item.fileName,
          target: item,
        })),
        async (item) => {
          return credentialsApi.downloadText(
            item.file ?? {
              name: item.fileName,
              id: item.credentialId,
              platformBacked: Boolean(item.credentialId),
            }
          );
        },
        undefined,
        {
          concurrency: 6,
          onProgress: (progress) => {
            setDownloadProgress({ completed: progress.completed, total: progress.total });
          },
        }
      );
      if (!archive) {
        showNotification(t('quota_management.analytics.bucket_download_all_failed'), 'error');
        return;
      }
      const archiveName = [
        sanitizeArchiveSegment(providerKey),
        sanitizeArchiveSegment(datasetId),
        `bucket-${bucketIndex + 1}`,
        sanitizeArchiveSegment(bucketLabel),
      ].join('__');

      downloadBlob({
        filename: `${archiveName}.zip`,
        blob: archive,
      });

      if (feedback.failures.length === 0) {
        showNotification(
          t('quota_management.analytics.bucket_download_all_success', {
            count: feedback.totalCount,
          }),
          'success'
        );
      } else {
        showNotification(
          t('credentials.batch_download_partial', {
            success: feedback.successCount,
            failed: feedback.failures.length,
          }),
          'warning'
        );
      }
    } catch (error) {
      console.error(error);
      showNotification(t('quota_management.analytics.bucket_download_all_failed'), 'error');
    } finally {
      setDownloadingAll(false);
      setDownloadProgress(null);
    }
  };

  const disableActions = downloadingAll || remoteLoading;
  const downloadPercent =
    downloadProgress && downloadProgress.total > 0
      ? (downloadProgress.completed / downloadProgress.total) * 100
      : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={860}
      title={t('quota_management.analytics.bucket_modal_title', {
        provider: providerLabel,
        dataset: datasetLabel,
        bucket: bucketLabel,
      })}
      closeDisabled={downloadingAll}
    >
      <div className={styles.analyticsBucketModal}>
        <div className={styles.analyticsBucketToolbar}>
          <div className={styles.analyticsBucketSummary}>
            <div className={styles.analyticsBucketSummaryTitle}>
              {t('quota_management.analytics.bucket_modal_summary')}
            </div>
            <div className={styles.analyticsBucketSummaryMeta}>
              <span>{datasetLabel}</span>
              <span>{bucketLabel}</span>
              <span>{t('quota_management.analytics.bucket_modal_count', { count: effectiveTotal })}</span>
            </div>
          </div>
          <div className={styles.analyticsBucketToolbarActions}>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleDownloadAll()}
              loading={downloadingAll}
              disabled={effectiveTotal === 0 || downloadingName !== null || remoteError !== null || remoteLoading}
            >
              {t('quota_management.analytics.bucket_download_all', { count: effectiveTotal })}
            </Button>
            {downloadingAll && downloadProgress ? (
              <div className={styles.analyticsBucketProgress} aria-live="polite">
                <div className={styles.analyticsBucketProgressMeta}>
                  <span>{t('quota_management.analytics.bucket_download_progress')}</span>
                  <span>
                    {downloadProgress.completed}/{downloadProgress.total} · {formatPercent(downloadPercent)}
                  </span>
                </div>
                <div className={styles.analyticsProgressBar} aria-hidden="true">
                  <div
                    className={styles.analyticsProgressBarFill}
                    style={{ width: `${downloadPercent}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {platformBacked && totalPages > 1 ? (
          <div className={styles.pagination}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRemotePage((prev) => Math.max(1, prev - 1))}
              disabled={remotePage <= 1 || disableActions}
            >
              {t('credentials.pagination_prev')}
            </Button>
            <div className={styles.pageInfo}>
              {t('credentials.pagination_info', {
                current: remotePage,
                total: totalPages,
                count: remoteTotal,
              })}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRemotePage((prev) => Math.min(totalPages, prev + 1))}
              disabled={remotePage >= totalPages || disableActions}
            >
              {t('credentials.pagination_next')}
            </Button>
          </div>
        ) : null}

        {remoteError ? (
          <div className={styles.analyticsBucketEmpty}>{remoteError}</div>
        ) : remoteLoading && sortedItems.length === 0 ? (
          <div className={styles.analyticsBucketEmpty}>{t('common.loading')}</div>
        ) : sortedItems.length === 0 ? (
          <div className={styles.analyticsBucketEmpty}>
            {t('quota_management.analytics.bucket_empty')}
          </div>
        ) : (
          <div className={styles.analyticsBucketList} role="list">
            {sortedItems.map((item) => {
              const file = item.file;
              const typeValue = String(file?.type || 'unknown');
              const typeColor = getTypeColor(typeValue, resolvedTheme);

              return (
                <div
                  key={`${datasetLabel}-${bucketLabel}-${item.credentialId ?? item.fileName}`}
                  className={styles.analyticsBucketRow}
                  role="listitem"
                >
                  <div className={styles.analyticsBucketMain}>
                    <div className={styles.analyticsBucketHeader}>
                      <span
                        className={styles.typeBadge}
                        style={{
                          backgroundColor: typeColor.bg,
                          color: typeColor.text,
                          ...(typeColor.border ? { border: typeColor.border } : {}),
                        }}
                      >
                        {getTypeLabel(t, typeValue)}
                      </span>
                      <span className={styles.fileName}>{item.fileName}</span>
                    </div>
                    <div className={styles.analyticsBucketMeta}>
                      <span>
                        {t('quota_management.analytics.bucket_remaining')}: {formatPercent(item.remainingPercent)}
                      </span>
                      <span>
                        {t('quota_management.analytics.bucket_reset_at')}:{' '}
                        {formatResetAt(item.resetAt, t('quota_management.analytics.not_available'))}
                      </span>
                      <span>
                        {t('credentials.file_size')}: {file?.size ? formatFileSize(file.size) : '-'}
                      </span>
                      <span>
                        {t('credentials.file_modified')}: {file ? formatModified(file) : '-'}
                      </span>
                    </div>
                    <div className={styles.analyticsBucketFlags}>
                      {file?.disabled ? (
                        <span className={styles.analyticsBucketFlag}>
                          {t('quota_management.analytics.bucket_flag_disabled')}
                        </span>
                      ) : null}
                      {file?.unavailable ? (
                        <span className={`${styles.analyticsBucketFlag} ${styles.analyticsBucketFlagDanger}`}>
                          {t('quota_management.analytics.bucket_flag_unavailable')}
                        </span>
                      ) : null}
                      {file?.quotaExceeded ? (
                        <span className={`${styles.analyticsBucketFlag} ${styles.analyticsBucketFlagWarning}`}>
                          {t('quota_management.analytics.bucket_flag_throttled')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className={styles.analyticsBucketActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleSingleDownload(item)}
                      loading={downloadingName === item.fileName}
                      disabled={downloadingAll}
                    >
                      <IconDownload size={16} />
                      {t('quota_management.analytics.bucket_download_single')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
