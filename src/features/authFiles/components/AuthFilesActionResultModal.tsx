import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type {
  AuthFilesActionFeedback,
  AuthFilesActionKind,
} from '@/features/authFiles/actionFeedback';
import styles from '@/pages/AuthFilesPage.module.scss';

export type AuthFilesActionResultModalProps = {
  open: boolean;
  result: AuthFilesActionFeedback | null;
  onClose: () => void;
};

const TITLE_KEYS: Record<AuthFilesActionKind, string> = {
  upload: 'auth_files.upload_result_title',
  'batch-download': 'auth_files.batch_download_result_title',
  'batch-delete': 'auth_files.batch_delete_result_title',
  'batch-enable': 'auth_files.batch_enable_result_title',
  'batch-disable': 'auth_files.batch_disable_result_title',
};

const SUMMARY_KEYS: Record<AuthFilesActionKind, string> = {
  upload: 'auth_files.upload_result_summary',
  'batch-download': 'auth_files.batch_download_result_summary',
  'batch-delete': 'auth_files.batch_result_summary',
  'batch-enable': 'auth_files.batch_result_summary',
  'batch-disable': 'auth_files.batch_result_summary',
};

const FAILURE_LABEL_KEYS: Record<AuthFilesActionKind, string> = {
  upload: 'notification.upload_failed',
  'batch-download': 'notification.download_failed',
  'batch-delete': 'notification.delete_failed',
  'batch-enable': 'notification.update_failed',
  'batch-disable': 'notification.update_failed',
};

export function AuthFilesActionResultModal({
  open,
  result,
  onClose,
}: AuthFilesActionResultModalProps) {
  const { t } = useTranslation();
  const title = result ? t(TITLE_KEYS[result.action]) : t('auth_files.batch_result_title');
  const summary = result
    ? t(SUMMARY_KEYS[result.action], {
        success: result.successCount,
        total: result.totalCount,
      })
    : '';
  const statusText = result
    ? result.action === 'upload'
      ? t('auth_files.upload_partial', {
          success: result.successCount,
          failed: result.failures.length,
        })
      : result.action === 'batch-download'
        ? t('auth_files.batch_download_partial', {
            success: result.successCount,
            failed: result.failures.length,
          })
        : result.action === 'batch-delete'
          ? t('auth_files.batch_delete_partial', {
              success: result.successCount,
              failed: result.failures.length,
            })
          : t('auth_files.batch_status_partial', {
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
