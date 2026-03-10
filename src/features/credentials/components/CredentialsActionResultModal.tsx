import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type {
  CredentialsActionFeedback,
  CredentialsActionKind,
} from '@/features/credentials/actionFeedback';
import styles from '@/pages/CredentialsPage.module.scss';

export type CredentialsActionResultModalProps = {
  open: boolean;
  result: CredentialsActionFeedback | null;
  onClose: () => void;
};

const TITLE_KEYS: Record<CredentialsActionKind, string> = {
  upload: 'credentials.upload_result_title',
  'batch-download': 'credentials.batch_download_result_title',
  'batch-delete': 'credentials.batch_delete_result_title',
  'batch-enable': 'credentials.batch_enable_result_title',
  'batch-disable': 'credentials.batch_disable_result_title',
};

const SUMMARY_KEYS: Record<CredentialsActionKind, string> = {
  upload: 'credentials.upload_result_summary',
  'batch-download': 'credentials.batch_download_result_summary',
  'batch-delete': 'credentials.batch_result_summary',
  'batch-enable': 'credentials.batch_result_summary',
  'batch-disable': 'credentials.batch_result_summary',
};

const FAILURE_LABEL_KEYS: Record<CredentialsActionKind, string> = {
  upload: 'notification.upload_failed',
  'batch-download': 'notification.download_failed',
  'batch-delete': 'notification.delete_failed',
  'batch-enable': 'notification.update_failed',
  'batch-disable': 'notification.update_failed',
};

export function CredentialsActionResultModal({
  open,
  result,
  onClose,
}: CredentialsActionResultModalProps) {
  const { t } = useTranslation();
  const title = result ? t(TITLE_KEYS[result.action]) : t('credentials.batch_result_title');
  const summary = result
    ? t(SUMMARY_KEYS[result.action], {
        success: result.successCount,
        total: result.totalCount,
      })
    : '';
  const statusText = result
    ? result.action === 'upload'
      ? t('credentials.upload_partial', {
          success: result.successCount,
          failed: result.failures.length,
        })
      : result.action === 'batch-download'
        ? t('credentials.batch_download_partial', {
            success: result.successCount,
            failed: result.failures.length,
          })
        : result.action === 'batch-delete'
          ? t('credentials.batch_delete_partial', {
              success: result.successCount,
              failed: result.failures.length,
            })
          : t('credentials.batch_status_partial', {
              success: result.successCount,
              failed: result.failures.length,
            })
    : '';
  const tone = result ? (result.successCount > 0 ? 'warning' : 'error') : 'warning';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {result ? (
        <div className={styles.batchDownloadResultContent}>
          <div className={`status-badge ${tone}`}>{statusText}</div>
          <p className={styles.batchDownloadResultSummary}>{summary}</p>
          <div className={styles.batchDownloadResultList}>
            {result.failures.map((item) => (
              <div key={`${item.name}-${item.message}`} className={styles.batchDownloadResultItem}>
                <div className={styles.batchDownloadResultHeader}>
                  <span className={styles.batchDownloadResultName}>{item.name}</span>
                  <span className="status-badge error">
                    {t(FAILURE_LABEL_KEYS[result.action])}
                  </span>
                </div>
                <div className={styles.batchDownloadResultMessage}>{item.message}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
