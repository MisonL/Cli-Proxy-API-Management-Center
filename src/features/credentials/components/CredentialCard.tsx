import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconBot,
  IconCheck,
  IconCode,
  IconDownload,
  IconInfo,
  IconTrash2,
} from '@/components/ui/icons';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import type { CredentialItem } from '@/types';
import { resolveAuthProvider } from '@/utils/quota';
import { calculateStatusBarData, normalizeAuthIndex, type KeyStats } from '@/utils/usage';
import { formatFileSize } from '@/utils/format';
import {
  QUOTA_PROVIDER_TYPES,
  formatModified,
  getCredentialStableKey,
  getCredentialStatusMessage,
  getTypeColor,
  getTypeLabel,
  isRuntimeOnlyCredential,
  resolveCredentialStats,
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/credentials/constants';
import type { CredentialStatusBarData } from '@/features/credentials/hooks/useCredentialsStatusBarCache';
import { CredentialQuotaSection } from '@/features/credentials/components/CredentialQuotaSection';
import styles from '@/pages/CredentialsPage.module.scss';

const HEALTHY_STATUS_MESSAGES = new Set(['ok', 'healthy', 'ready', 'success', 'available']);

export type CredentialCardProps = {
  file: CredentialItem;
  selected: boolean;
  resolvedTheme: ResolvedTheme;
  disableControls: boolean;
  deleting: string | null;
  statusUpdating: Record<string, boolean>;
  quotaFilterType: QuotaProviderType | null;
  keyStats: KeyStats;
  statusBarCache: Map<string, CredentialStatusBarData>;
  onShowModels: (file: CredentialItem) => void;
  onShowDetails: (file: CredentialItem) => void;
  onDownload: (file: CredentialItem) => void;
  onOpenPrefixProxyEditor: (file: CredentialItem) => void;
  onDelete: (file: CredentialItem) => void;
  onToggleStatus: (file: CredentialItem, enabled: boolean) => void;
  onToggleSelect: (name: string) => void;
};

const resolveQuotaType = (file: CredentialItem): QuotaProviderType | null => {
  const provider = resolveAuthProvider(file);
  if (!QUOTA_PROVIDER_TYPES.has(provider as QuotaProviderType)) return null;
  return provider as QuotaProviderType;
};

export function CredentialCard(props: CredentialCardProps) {
  const { t } = useTranslation();
  const {
    file,
    selected,
    resolvedTheme,
    disableControls,
    deleting,
    statusUpdating,
    quotaFilterType,
    keyStats,
    statusBarCache,
    onShowModels,
    onShowDetails,
    onDownload,
    onOpenPrefixProxyEditor,
    onDelete,
    onToggleStatus,
    onToggleSelect,
  } = props;

  const fileStats = resolveCredentialStats(file, keyStats);
  const isRuntimeOnly = isRuntimeOnlyCredential(file);
  const isAistudio = (file.type || '').toLowerCase() === 'aistudio';
  const showModelsButton = !isRuntimeOnly || isAistudio;
  const typeColor = getTypeColor(file.type || 'unknown', resolvedTheme);

  const quotaType =
    quotaFilterType && resolveQuotaType(file) === quotaFilterType ? quotaFilterType : null;

  const showQuotaLayout = Boolean(quotaType) && !isRuntimeOnly;

  const providerCardClass =
    quotaType === 'antigravity'
      ? styles.antigravityCard
      : quotaType === 'claude'
        ? styles.claudeCard
      : quotaType === 'codex'
        ? styles.codexCard
        : quotaType === 'gemini-cli'
          ? styles.geminiCliCard
          : quotaType === 'kimi'
            ? styles.kimiCard
            : '';

  const selectionKeyKey = normalizeAuthIndex(file.selectionKey);
  const fileKey = getCredentialStableKey(file);
  const statusData =
    (selectionKeyKey && statusBarCache.get(selectionKeyKey)) || calculateStatusBarData([]);
  const rawStatusMessage = getCredentialStatusMessage(file);
  const hasStatusWarning =
    Boolean(rawStatusMessage) && !HEALTHY_STATUS_MESSAGES.has(rawStatusMessage.toLowerCase());

  return (
    <div
      className={`${styles.fileCard} ${providerCardClass} ${selected ? styles.fileCardSelected : ''} ${file.disabled ? styles.fileCardDisabled : ''}`}
    >
      <div className={styles.fileCardLayout}>
        <div className={styles.fileCardMain}>
          <div className={styles.cardHeader}>
            {!isRuntimeOnly && (
              <button
                type="button"
                className={`${styles.selectionToggle} ${selected ? styles.selectionToggleActive : ''}`}
                onClick={() => onToggleSelect(fileKey)}
                aria-label={
                  selected
                    ? t('credentials.batch_deselect_file', {
                        name: file.name,
                        defaultValue: `取消选择凭证 ${file.name}`,
                      })
                    : t('credentials.batch_select_file', {
                        name: file.name,
                        defaultValue: `选择凭证 ${file.name}`,
                      })
                }
                aria-pressed={selected}
                title={
                  selected
                    ? t('credentials.batch_deselect_file', {
                        name: file.name,
                        defaultValue: `取消选择凭证 ${file.name}`,
                      })
                    : t('credentials.batch_select_file', {
                        name: file.name,
                        defaultValue: `选择凭证 ${file.name}`,
                      })
                }
              >
                {selected && <IconCheck size={12} />}
              </button>
            )}
            <span
              className={styles.typeBadge}
              style={{
                backgroundColor: typeColor.bg,
                color: typeColor.text,
                ...(typeColor.border ? { border: typeColor.border } : {}),
              }}
            >
              {getTypeLabel(t, file.type || 'unknown')}
            </span>
            <span className={styles.fileName}>{file.name}</span>
          </div>

          <div className={styles.cardMeta}>
            <span>
              {t('credentials.file_size')}: {file.size ? formatFileSize(file.size) : '-'}
            </span>
            <span>
              {t('credentials.file_modified')}: {formatModified(file)}
            </span>
          </div>

          {rawStatusMessage && hasStatusWarning && (
            <div className={styles.healthStatusMessage} title={rawStatusMessage}>
              {rawStatusMessage}
            </div>
          )}

          <div className={styles.cardStats}>
            <span className={`${styles.statPill} ${styles.statSuccess}`}>
              {t('stats.success')}: {fileStats.success}
            </span>
            <span className={`${styles.statPill} ${styles.statFailure}`}>
              {t('stats.failure')}: {fileStats.failure}
            </span>
          </div>

          <ProviderStatusBar statusData={statusData} styles={styles} />

          {showQuotaLayout && quotaType && (
            <CredentialQuotaSection
              file={file}
              quotaType={quotaType}
              disableControls={disableControls}
            />
          )}

          <div className={styles.cardActions}>
            {showModelsButton && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onShowModels(file)}
                className={styles.iconButton}
                title={t('credentials.models_button', { defaultValue: '模型' })}
                disabled={disableControls}
              >
                <IconBot className={styles.actionIcon} size={16} />
              </Button>
            )}
            {!isRuntimeOnly && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onShowDetails(file)}
                  className={styles.iconButton}
                  title={t('common.info', { defaultValue: '关于' })}
                  disabled={disableControls}
                >
                  <IconInfo className={styles.actionIcon} size={16} />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onDownload(file)}
                  className={styles.iconButton}
                  title={t('credentials.download_button')}
                  disabled={disableControls}
                >
                  <IconDownload className={styles.actionIcon} size={16} />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onOpenPrefixProxyEditor(file)}
                  className={styles.iconButton}
                  title={t('credentials.prefix_proxy_button')}
                  disabled={disableControls}
                >
                  <IconCode className={styles.actionIcon} size={16} />
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => onDelete(file)}
                  className={styles.iconButton}
                  title={t('credentials.delete_button')}
                  disabled={disableControls || deleting === fileKey}
                >
                  {deleting === fileKey ? (
                    <LoadingSpinner size={14} />
                  ) : (
                    <IconTrash2 className={styles.actionIcon} size={16} />
                  )}
                </Button>
              </>
            )}
            {!isRuntimeOnly && (
              <div className={styles.statusToggle}>
                <ToggleSwitch
                  ariaLabel={t('credentials.status_toggle_label')}
                  checked={!file.disabled}
                  disabled={disableControls || statusUpdating[fileKey] === true}
                  onChange={(value) => onToggleStatus(file, value)}
                />
              </div>
            )}
            {isRuntimeOnly && (
              <div className={styles.virtualBadge}>
                {t('credentials.type_virtual') || '虚拟凭证'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
