import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { CredentialItem } from '@/types';
import styles from '@/pages/CredentialsPage.module.scss';

export type CredentialDetailModalProps = {
  open: boolean;
  file: CredentialItem | null;
  onClose: () => void;
  onCopyText: (text: string) => void;
};

export function CredentialDetailModal({ open, file, onClose, onCopyText }: CredentialDetailModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={file?.name || t('credentials.title_section')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button
            onClick={() => {
              if (!file) return;
              const text = JSON.stringify(file, null, 2);
              onCopyText(text);
            }}
          >
            {t('common.copy')}
          </Button>
        </>
      }
    >
      {file && (
        <div className={styles.detailContent}>
          <pre className={styles.jsonContent}>{JSON.stringify(file, null, 2)}</pre>
        </div>
      )}
    </Modal>
  );
}

