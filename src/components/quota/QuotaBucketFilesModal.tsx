import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { IconDownload } from '@/components/ui/icons';
import { authFilesApi } from '@/services/api';
import { useNotificationStore, useThemeStore } from '@/stores';
import type { AuthFileItem } from '@/types/authFile';
import { downloadBlob } from '@/utils/download';
import { formatFileSize } from '@/utils/format';
import { formatModified, getTypeColor, getTypeLabel } from '@/features/authFiles/constants';
import { createAuthFilesBatchArchive } from '@/features/authFiles/batchDownload';
import type { AnalyticsBucketItem } from './quotaAnalytics';
import styles from '@/pages/QuotaPage.module.scss';

type QuotaBucketFileModalItem = AnalyticsBucketItem & {
  file?: AuthFileItem;
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
  onClose,
}: QuotaBucketFilesModalProps) {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [downloadingName, setDownloadingName] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const sortedItems = useMemo(
    () =>
      [...items].sort((left, right) => {
        if (right.remainingPercent !== left.remainingPercent) {
          return right.remainingPercent - left.remainingPercent;
        }
        return left.fileName.localeCompare(right.fileName);
      }),
    [items]
  );

  const handleSingleDownload = async (fileName: string) => {
    try {
      setDownloadingName(fileName);
      const text = await authFilesApi.downloadText(fileName);
      downloadBlob({
        filename: fileName,
        blob: new Blob([text], { type: 'application/json;charset=utf-8' }),
      });
      showNotification(t('auth_files.download_success'), 'success');
    } catch (error) {
      console.error(error);
      showNotification(t('notification.download_failed'), 'error');
    } finally {
      setDownloadingName((current) => (current === fileName ? null : current));
    }
  };

  const handleDownloadAll = async () => {
    if (sortedItems.length === 0) return;

    try {
      setDownloadingAll(true);
      const { archive, feedback } = await createAuthFilesBatchArchive(
        sortedItems.map((item) => item.fileName),
        authFilesApi.downloadText
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
          t('auth_files.batch_download_partial', {
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
    }
  };

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
              <span>{t('quota_management.analytics.bucket_modal_count', { count: sortedItems.length })}</span>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleDownloadAll()}
            loading={downloadingAll}
            disabled={sortedItems.length === 0 || downloadingName !== null}
          >
            {t('quota_management.analytics.bucket_download_all', { count: sortedItems.length })}
          </Button>
        </div>

        {sortedItems.length === 0 ? (
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
                <div key={`${datasetLabel}-${bucketLabel}-${item.fileName}`} className={styles.analyticsBucketRow} role="listitem">
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
                        {t('auth_files.file_size')}: {file?.size ? formatFileSize(file.size) : '-'}
                      </span>
                      <span>
                        {t('auth_files.file_modified')}: {file ? formatModified(file) : '-'}
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
                      onClick={() => void handleSingleDownload(item.fileName)}
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
