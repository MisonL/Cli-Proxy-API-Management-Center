import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconRefreshCw } from '@/components/ui/icons';
import { triggerHeaderRefresh } from '@/hooks/useHeaderRefresh';
import type { CredentialItem } from '@/types/credential';
import type { UsageDetail } from '@/utils/usage';
import { QuotaAnalyticsView } from './QuotaAnalyticsView';
import type { ProviderAnalytics, QuotaWarningThresholds } from './quotaAnalytics';
import styles from '@/pages/QuotaPage.module.scss';

interface QuotaAnalyticsSectionProps {
  providerKey: string;
  providerLabel: string;
  files: CredentialItem[];
  usageDetails: UsageDetail[];
  loading: boolean;
  disabled: boolean;
  warningThresholds?: QuotaWarningThresholds;
  totalCount?: number;
  precomputedAnalytics?: ProviderAnalytics;
}

export function QuotaAnalyticsSection({
  providerKey,
  providerLabel,
  files,
  usageDetails,
  loading,
  disabled,
  warningThresholds,
  totalCount,
  precomputedAnalytics,
}: QuotaAnalyticsSectionProps) {
  const { t } = useTranslation();

  const handleRefresh = useCallback(() => {
    void triggerHeaderRefresh();
  }, []);

  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{providerLabel}</span>
      {(totalCount ?? files.length) > 0 && (
        <span className={styles.countBadge}>{totalCount ?? files.length}</span>
      )}
    </div>
  );

  return (
    <Card
      title={titleNode}
      extra={
        <div className={styles.headerActions}>
          <div className={styles.analyticsOnlyBadge}>
            {t('quota_management.analytics.usage_only_badge')}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={disabled || loading}
            loading={loading}
            title={t('quota_management.refresh_files_and_quota')}
            aria-label={t('quota_management.refresh_files_and_quota')}
          >
            {!loading && <IconRefreshCw size={16} />}
          </Button>
        </div>
      }
    >
      {(totalCount ?? files.length) === 0 ? (
        <EmptyState
          title={t('quota_management.analytics.empty_title')}
          description={t('quota_management.analytics.empty_desc')}
        />
      ) : (
        <QuotaAnalyticsView
          providerKey={providerKey}
          providerLabel={providerLabel}
          files={files}
          usageDetails={usageDetails}
          loading={loading}
          warningThresholds={warningThresholds}
          precomputedAnalytics={precomputedAnalytics}
        />
      )}
    </Card>
  );
}
