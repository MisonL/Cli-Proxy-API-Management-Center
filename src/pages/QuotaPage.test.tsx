import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuotaPage } from './QuotaPage';

const mocks = vi.hoisted(() => ({
  showNotification: vi.fn(),
  authFilesList: vi.fn(),
  fetchConfigYaml: vi.fn(),
  loadUsageStats: vi.fn(),
  downloadBlob: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'quota_management.title': '配额管理',
        'quota_management.description': '配额说明',
        'quota_management.analytics.warning_settings_title': '预警设置',
        'quota_management.analytics.warning_settings_desc': '预警说明',
        'quota_management.analytics.warning_settings_export': '导出',
        'quota_management.analytics.warning_settings_import': '导入',
        'quota_management.analytics.warning_settings_reset': '重置',
        'quota_management.analytics.warning_settings_import_success': '导入成功',
        'quota_management.analytics.warning_settings_import_failed': '导入失败',
        'quota_management.analytics.warning_settings_health': '健康度阈值',
        'quota_management.analytics.warning_settings_risk_days': '风险天数',
        'quota_management.analytics.warning_settings_snapshot': '快照覆盖率',
        'quota_management.analytics.warning_settings_failure': '24h 失败率',
        'quota_management.analytics.warning_settings_activity': '7d 活跃度',
        'quota_management.analytics.section_suffix': '统计',
        'notification.refresh_failed': '刷新失败',
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/hooks/useHeaderRefresh', () => ({
  useHeaderRefresh: () => {},
}));

vi.mock('@/stores', () => ({
  useAuthStore: (selector: (state: { connectionStatus: string }) => unknown) =>
    selector({ connectionStatus: 'connected' }),
  useNotificationStore: (
    selector: (state: { showNotification: typeof mocks.showNotification }) => unknown
  ) => selector({ showNotification: mocks.showNotification }),
  useUsageStatsStore: (
    selector: (state: {
      usageDetails: [];
      loading: boolean;
      error: string;
      loadUsageStats: typeof mocks.loadUsageStats;
    }) => unknown
  ) =>
    selector({
      usageDetails: [],
      loading: false,
      error: '',
      loadUsageStats: mocks.loadUsageStats,
    }),
}));

vi.mock('@/services/api', () => ({
  authFilesApi: {
    list: mocks.authFilesList,
  },
  configFileApi: {
    fetchConfigYaml: mocks.fetchConfigYaml,
  },
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({
    title,
    extra,
    children,
  }: {
    title: ReactNode;
    extra?: ReactNode;
    children: ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {extra}
      {children}
    </section>
  ),
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock('@/components/quota', () => ({
  QuotaSection: () => <div>QuotaSection</div>,
  QuotaAnalyticsSection: () => <div>QuotaAnalyticsSection</div>,
  ANTIGRAVITY_CONFIG: {},
  CLAUDE_CONFIG: {},
  CODEX_CONFIG: {},
  GEMINI_CLI_CONFIG: {},
  KIMI_CONFIG: {},
}));

vi.mock('@/utils/download', () => ({
  downloadBlob: mocks.downloadBlob,
}));

describe('QuotaPage', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.showNotification.mockReset();
    mocks.authFilesList.mockResolvedValue({ files: [] });
    mocks.fetchConfigYaml.mockResolvedValue('debug: false\n');
    mocks.loadUsageStats.mockResolvedValue(undefined);
  });

  it('导入无效阈值文件时提示失败且保留当前设置', async () => {
    localStorage.setItem(
      'cli-proxy-quota-warning-thresholds',
      JSON.stringify({
        healthLowPercent: 12,
        riskDays: 7,
        snapshotCoveragePercent: 34,
        failureRate24hPercent: 56,
        activePoolPercent7d: 78,
      })
    );

    const { container } = render(<QuotaPage />);

    await waitFor(() => {
      const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
      expect(inputs[0].value).toBe('12');
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!fileInput) {
      throw new Error('未找到阈值导入输入框');
    }

    fireEvent.change(fileInput, {
      target: {
        files: [new File(['{}'], 'invalid-thresholds.json', { type: 'application/json' })],
      },
    });

    await waitFor(() => {
      expect(mocks.showNotification).toHaveBeenCalledWith(expect.stringContaining('导入失败'), 'error');
    });

    expect(
      mocks.showNotification.mock.calls.some(([, type]) => type === 'success')
    ).toBe(false);

    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(inputs[0].value).toBe('12');
    expect(inputs[1].value).toBe('7');
  });
});
