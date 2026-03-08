import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { UsagePersistenceStatus } from '@/types';
import {
  formatUsageDateTime,
  formatUsageLoadResult,
  formatUsageSize,
  getUsagePersistenceTone,
  normalizeUsagePersistenceStatus,
} from './usagePersistence';
import styles from './UsagePersistenceStatusPanel.module.scss';

export interface UsagePersistenceStatusPanelProps {
  status: UsagePersistenceStatus | null;
  error?: string;
  loading?: boolean;
  hideWhenEmpty?: boolean;
  footer?: ReactNode;
}

export function UsagePersistenceStatusPanel({
  status,
  error = '',
  loading = false,
  hideWhenEmpty = false,
  footer,
}: UsagePersistenceStatusPanelProps) {
  const { t, i18n } = useTranslation();
  const language = i18n?.language;

  if (!status && hideWhenEmpty && !loading && !error) {
    return null;
  }

  const snapshot = normalizeUsagePersistenceStatus(status);
  const tone = getUsagePersistenceTone(status);
  const shouldRenderCard = Boolean(status) || !hideWhenEmpty;

  return (
    <div className={styles.panel}>
      {error ? <div className={styles.error}>{error}</div> : null}

      {shouldRenderCard ? (
        <div className={styles.card}>
          <div className={styles.header}>
            <span className={`status-badge ${tone}`}>
              {snapshot.enabled
                ? t('usage_stats.persistence_enabled')
                : t('usage_stats.persistence_disabled')}
            </span>
            <span className={styles.meta}>
              {t('usage_stats.persistence_file')}: {snapshot.filePath}
            </span>
          </div>

          <div className={styles.grid}>
            <div className={styles.item}>
              <span>{t('usage_stats.persistence_file_exists')}</span>
              <strong>{snapshot.fileExists ? t('common.yes') : t('common.no')}</strong>
            </div>
            <div className={styles.item}>
              <span>{t('usage_stats.persistence_file_size')}</span>
              <strong>{formatUsageSize(snapshot.fileSizeBytes)}</strong>
            </div>
            <div className={styles.item}>
              <span>{t('usage_stats.persistence_last_flush')}</span>
              <strong>{formatUsageDateTime(status?.last_flush_at, language)}</strong>
            </div>
            <div className={styles.item}>
              <span>{t('usage_stats.persistence_last_load')}</span>
              <strong>{formatUsageDateTime(status?.last_load_at, language)}</strong>
            </div>
          </div>

          <div className={styles.subGrid}>
            <div className={styles.subItem}>
              <span>{t('usage_stats.persistence_last_load_result')}</span>
              <strong>
                {formatUsageLoadResult({
                  last_load_added: snapshot.lastLoadAdded,
                  last_load_skipped: snapshot.lastLoadSkipped,
                })}
              </strong>
            </div>
            <div className={styles.subItem}>
              <span>{t('usage_stats.persistence_last_modified')}</span>
              <strong>{formatUsageDateTime(status?.last_modified_at, language)}</strong>
            </div>
          </div>

          {snapshot.lastError ? (
            <div className={styles.error}>
              {t('usage_stats.persistence_last_error')}: {snapshot.lastError}
            </div>
          ) : (
            <div className={styles.hint}>
              {snapshot.enabled
                ? t('usage_stats.persistence_enabled_hint')
                : t('usage_stats.persistence_disabled_hint')}
            </div>
          )}

          {footer ? <div className={styles.footer}>{footer}</div> : null}
        </div>
      ) : null}

      {!status && loading ? <div className={styles.hint}>{t('common.loading')}</div> : null}
    </div>
  );
}
