import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuotaBucketFilesModal } from './QuotaBucketFilesModal';

const mocks = vi.hoisted(() => ({
  downloadText: vi.fn(),
  showNotification: vi.fn(),
  downloadBlob: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'quota_management.analytics.bucket_modal_summary': '命中清单',
        'quota_management.analytics.bucket_modal_count': `${options?.count ?? 0} 个文件`,
        'quota_management.analytics.bucket_download_all': `全部下载（${options?.count ?? 0}）`,
        'quota_management.analytics.bucket_download_all_success': `已打包下载 ${options?.count ?? 0} 个认证文件`,
        'quota_management.analytics.bucket_download_all_failed': '批量打包下载失败',
        'quota_management.analytics.bucket_download_single': '下载',
        'quota_management.analytics.bucket_remaining': '剩余额度',
        'quota_management.analytics.bucket_reset_at': '重置时间',
        'quota_management.analytics.bucket_flag_disabled': '已禁用',
        'quota_management.analytics.bucket_flag_unavailable': '不可用',
        'quota_management.analytics.bucket_flag_throttled': '已限额',
        'quota_management.analytics.not_available': '--',
        'auth_files.download_success': '下载成功',
        'auth_files.file_size': '文件大小',
        'auth_files.file_modified': '修改时间',
        'auth_files.batch_download_partial': `批量下载完成，成功 ${options?.success ?? 0} 个，失败 ${options?.failed ?? 0} 个`,
      };

      if (key === 'quota_management.analytics.bucket_modal_title') {
        return `${options?.provider}-${options?.dataset}-${options?.bucket}`;
      }
      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/components/ui/Modal', () => ({
  Modal: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title?: ReactNode;
    children?: ReactNode;
  }) => (open ? <section><h2>{title}</h2>{children}</section> : null),
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/icons', () => ({
  IconDownload: () => <span>download</span>,
}));

vi.mock('@/services/api', () => ({
  authFilesApi: {
    downloadText: mocks.downloadText,
  },
}));

vi.mock('@/stores', () => ({
  useNotificationStore: (selector: (state: { showNotification: typeof mocks.showNotification }) => unknown) =>
    selector({
      showNotification: mocks.showNotification,
    }),
  useThemeStore: (selector: (state: { resolvedTheme: 'light' }) => unknown) =>
    selector({ resolvedTheme: 'light' }),
}));

vi.mock('@/utils/download', () => ({
  downloadBlob: mocks.downloadBlob,
}));

describe('QuotaBucketFilesModal', () => {
  it('支持从桶弹窗打包下载认证文件', async () => {
    mocks.downloadText.mockResolvedValueOnce('{"name":"alpha"}').mockResolvedValueOnce('{"name":"beta"}');

    render(
      <QuotaBucketFilesModal
        open
        onClose={vi.fn()}
        providerKey="codex"
        providerLabel="Codex"
        datasetId="daily"
        datasetLabel="日配额"
        bucketIndex={0}
        bucketLabel="90-100%"
        items={[
          { fileName: 'alpha.json', remainingPercent: 96, resetAt: '2026-03-08T12:00:00.000Z' },
          { fileName: 'beta.json', remainingPercent: 93, resetAt: '2026-03-08T13:00:00.000Z' },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '全部下载（2）' }));

    await waitFor(() => {
      expect(mocks.downloadBlob).toHaveBeenCalledTimes(1);
    });
    expect(mocks.downloadBlob.mock.calls[0]?.[0]?.filename).toContain('codex__daily__bucket-1__90-100.zip');
    expect(mocks.showNotification).toHaveBeenCalledWith('已打包下载 2 个认证文件', 'success');
  });
});
