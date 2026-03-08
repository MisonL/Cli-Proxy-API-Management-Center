import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UsagePage } from './UsagePage';

const mocks = vi.hoisted(() => ({
  useUsageData: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'common.loading': '加载中',
        'common.refresh': '刷新',
        'common.cancel': '取消',
        'common.yes': '是',
        'common.no': '否',
        'usage_stats.title': '使用统计',
        'usage_stats.export': '导出',
        'usage_stats.import': '导入',
        'usage_stats.refresh': '刷新统计',
        'usage_stats.range_filter': '时间范围',
        'usage_stats.last_updated': '最后更新',
        'usage_stats.persistence_title': '持久化状态',
        'usage_stats.persistence_enabled': '已开启持久化',
        'usage_stats.persistence_disabled': '未开启持久化',
        'usage_stats.persistence_file': '持久化文件',
        'usage_stats.persistence_file_exists': '文件存在',
        'usage_stats.persistence_file_size': '文件大小',
        'usage_stats.persistence_last_flush': '最近写盘',
        'usage_stats.persistence_last_load': '最近恢复',
        'usage_stats.persistence_last_load_result': '最近恢复结果',
        'usage_stats.persistence_last_modified': '最近修改',
        'usage_stats.persistence_last_error': '最近错误',
        'usage_stats.persistence_enabled_hint': '已按配置周期自动落盘',
        'usage_stats.persistence_disabled_hint': '当前仍为原版内存模式',
        'usage_stats.import_preview_title': '导入预览',
        'usage_stats.import_merge_notice': '导入会合并到现有统计',
        'usage_stats.import_confirm': '确认导入',
        'usage_stats.import_file_name': '文件名',
        'usage_stats.import_version': '版本',
        'usage_stats.import_exported_at': '导出时间',
        'usage_stats.total_requests': '总请求数',
        'usage_stats.failure_count': '失败请求',
        'usage_stats.failed_requests': '失败请求',
        'usage_stats.total_tokens': '总 Token',
        'usage_stats.api_dimension': 'API 维度',
        'usage_stats.model_dimension': '模型维度',
        'usage_stats.import_api_count': 'API 数',
        'usage_stats.import_model_count': '模型数',
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}));

vi.mock('@/hooks/useHeaderRefresh', () => ({
  useHeaderRefresh: () => {},
}));

vi.mock('@/stores', () => ({
  useThemeStore: (selector: (state: { resolvedTheme: 'light' }) => unknown) =>
    selector({ resolvedTheme: 'light' }),
  useConfigStore: (
    selector: (state: {
      config: {
        geminiApiKeys: [];
        claudeApiKeys: [];
        codexApiKeys: [];
        vertexApiKeys: [];
        openaiCompatibility: [];
      };
    }) => unknown
  ) =>
    selector({
      config: {
        geminiApiKeys: [],
        claudeApiKeys: [],
        codexApiKeys: [],
        vertexApiKeys: [],
        openaiCompatibility: [],
      },
    }),
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
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

vi.mock('@/components/ui/Modal', () => ({
  Modal: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean;
    title: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
  }) =>
    open ? (
      <section>
        <h2>{title}</h2>
        {children}
        {footer}
      </section>
    ) : null,
}));

vi.mock('@/components/ui/Select', () => ({
  Select: () => <div>select</div>,
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <div>spinner</div>,
}));

vi.mock('@/components/usage', () => ({
  StatCards: () => <div>StatCards</div>,
  UsageChart: () => <div>UsageChart</div>,
  ChartLineSelector: () => <div>ChartLineSelector</div>,
  ApiDetailsCard: () => <div>ApiDetailsCard</div>,
  ModelStatsCard: () => <div>ModelStatsCard</div>,
  PriceSettingsCard: () => <div>PriceSettingsCard</div>,
  CredentialStatsCard: () => <div>CredentialStatsCard</div>,
  RequestEventsDetailsCard: () => <div>RequestEventsDetailsCard</div>,
  TokenBreakdownChart: () => <div>TokenBreakdownChart</div>,
  CostTrendChart: () => <div>CostTrendChart</div>,
  ServiceHealthCard: () => <div>ServiceHealthCard</div>,
  useUsageData: mocks.useUsageData,
  useSparklines: () => ({
    requestsSparkline: [],
    tokensSparkline: [],
    rpmSparkline: [],
    tpmSparkline: [],
    costSparkline: [],
  }),
  useChartData: () => ({
    requestsPeriod: '24h',
    setRequestsPeriod: vi.fn(),
    tokensPeriod: '24h',
    setTokensPeriod: vi.fn(),
    requestsChartData: {},
    tokensChartData: {},
    requestsChartOptions: {},
    tokensChartOptions: {},
  }),
}));

vi.mock('@/utils/usage', () => ({
  getModelNamesFromUsage: () => [],
  getApiStats: () => [],
  getModelStats: () => [],
  filterUsageByTimeRange: (usage: unknown) => usage,
}));

describe('UsagePage', () => {
  it('展示持久化状态与导入预览弹窗', () => {
    mocks.useUsageData.mockReturnValue({
      usage: { total_requests: 1 },
      loading: false,
      error: '',
      lastRefreshedAt: new Date('2026-03-08T12:00:00.000Z'),
      persistenceStatus: {
        enabled: true,
        file_path: '/workspace/usage-backups/usage-statistics.json',
        file_exists: true,
        file_size_bytes: 1024,
        last_flush_at: '2026-03-08T11:00:00.000Z',
        last_load_at: '2026-03-08T10:00:00.000Z',
        last_load_added: 10,
        last_load_skipped: 2,
        last_modified_at: '2026-03-08T11:00:00.000Z',
      },
      modelPrices: {},
      setModelPrices: vi.fn(),
      loadUsage: vi.fn(),
      loadPersistenceStatus: vi.fn(),
      handleExport: vi.fn(),
      handleImport: vi.fn(),
      handleImportChange: vi.fn(),
      confirmImport: vi.fn(),
      closeImportPreview: vi.fn(),
      importInputRef: { current: null },
      importPreview: {
        fileName: 'usage-export.json',
        payload: {},
        version: 1,
        exportedAt: '2026-03-08T09:00:00.000Z',
        totalRequests: 20,
        failureCount: 2,
        totalTokens: 300,
        apiCount: 2,
        modelCount: 4,
      },
      exporting: false,
      importing: false,
    });

    render(<UsagePage />);

    expect(screen.getByText('持久化状态')).toBeTruthy();
    expect(screen.getByText('已开启持久化')).toBeTruthy();
    expect(
      screen.getByText((content) =>
        content.includes('/workspace/usage-backups/usage-statistics.json')
      )
    ).toBeTruthy();
    expect(screen.getByText('导入预览')).toBeTruthy();
    expect(screen.getByText('usage-export.json')).toBeTruthy();
    expect(screen.getByText('20')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });
});
