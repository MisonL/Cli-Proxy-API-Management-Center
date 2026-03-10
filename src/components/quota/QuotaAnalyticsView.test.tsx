import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CredentialItem } from '@/types/credential';
import type { UsageDetail } from '@/utils/usage';

const mocks = vi.hoisted(() => ({
  showNotification: vi.fn(),
  downloadText: vi.fn(),
  downloadBlob: vi.fn(),
  zipFile: vi.fn(),
  zipGenerateAsync: vi.fn(),
}));

const capturedCharts: Array<{
  data: { labels?: string[]; datasets: Array<{ label: string }> };
  options?: {
    onClick?: (event: unknown, elements: Array<{ datasetIndex: number; index: number }>) => void;
  };
}> = [];

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'common.loading': 'Loading',
        'quota_management.analytics.metric_extra_usage': 'Extra Usage',
        'quota_management.analytics.window_5h': '5h',
        'quota_management.analytics.window_24h': '24h',
        'quota_management.analytics.window_3d': '3d',
        'quota_management.analytics.window_7d': '7d',
        'quota_management.analytics.note_ready': 'ready',
        'quota_management.analytics.no_risk': 'no risk',
        'quota_management.analytics.bucket_modal_summary': 'Bucket Files',
        'quota_management.analytics.bucket_download_single': 'Download',
        'quota_management.analytics.bucket_flag_disabled': 'Disabled',
        'quota_management.analytics.bucket_flag_unavailable': 'Unavailable',
        'quota_management.analytics.bucket_flag_throttled': 'Throttled',
        'quota_management.analytics.bucket_remaining': 'Remaining',
        'quota_management.analytics.bucket_reset_at': 'Reset At',
        'quota_management.analytics.bucket_empty': 'No files',
        'quota_management.analytics.bucket_download_all_failed': 'Archive failed',
        'quota_management.analytics.bucket_download_progress': 'Archive progress',
        'quota_management.analytics.not_available': 'N/A',
        'quota_management.analytics.coverage_label': 'Coverage',
        'quota_management.analytics.load_full_quota': 'Load full quota',
        'credentials.download_success': 'File downloaded successfully',
        'credentials.file_size': 'Size',
        'credentials.file_modified': 'Modified',
        'notification.download_failed': 'Download failed',
        'credentials.filter_codex': 'Codex',
        'credentials.filter_unknown': 'Unknown',
      };

      if (key === 'quota_management.analytics.days_value') {
        return `${options?.count ?? ''} days`;
      }
      if (key === 'quota_management.analytics.bucket_modal_title') {
        return `${options?.provider ?? ''} · ${options?.dataset ?? ''} · ${options?.bucket ?? ''}`;
      }
      if (key === 'quota_management.analytics.bucket_modal_count') {
        return `${options?.count ?? 0} files`;
      }
      if (key === 'quota_management.analytics.bucket_download_all') {
        return `Download All (${options?.count ?? 0})`;
      }
      if (key === 'quota_management.analytics.bucket_download_all_success') {
        return `Downloaded ${options?.count ?? 0} files`;
      }
      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/stores', () => ({
  useThemeStore: (selector: (state: { resolvedTheme: 'light' }) => unknown) =>
    selector({ resolvedTheme: 'light' }),
  useNotificationStore: (
    selector: (state: { showNotification: typeof mocks.showNotification }) => unknown
  ) => selector({ showNotification: mocks.showNotification }),
}));

vi.mock('@/services/api', () => ({
  credentialsApi: {
    downloadText: mocks.downloadText,
  },
}));

vi.mock('@/utils/download', () => ({
  downloadBlob: mocks.downloadBlob,
}));

vi.mock('jszip', () => ({
  default: class MockZip {
    file = mocks.zipFile;
    generateAsync = mocks.zipGenerateAsync;
  },
}));

vi.mock('react-chartjs-2', () => ({
  Bar: (props: {
    data: { labels?: string[]; datasets: Array<{ label: string }> };
    options?: {
      onClick?: (event: unknown, elements: Array<{ datasetIndex: number; index: number }>) => void;
    };
  }) => {
    capturedCharts.push(props);

    return (
      <div data-testid="mock-bar-chart">
        {props.data.datasets.map((dataset, datasetIndex) => (
          <button
            key={dataset.label}
            type="button"
            onClick={() => props.options?.onClick?.({}, [{ datasetIndex, index: 0 }])}
          >
            {`Open ${dataset.label}`}
          </button>
        ))}
      </div>
    );
  },
}));

const now = new Date('2026-03-08T08:00:00.000Z').getTime();

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const files: CredentialItem[] = [
  { name: 'codex-a.json', type: 'codex', selectionKey: 'a', size: 1200, modified: now - 1000 },
  {
    name: 'codex-b.json',
    type: 'codex',
    selectionKey: 'b',
    disabled: true,
    size: 1600,
    modified: now - 2000,
  },
  {
    name: 'codex-c.json',
    type: 'codex',
    selectionKey: 'c',
    unavailable: true,
    size: 2000,
    modified: now - 3000,
  },
];

const usageDetails: UsageDetail[] = [
  {
    timestamp: new Date(now - 1000).toISOString(),
    selection_key: 'a' as unknown as number,
    source: '',
    failed: false,
    tokens: {
      input_tokens: 10,
      output_tokens: 5,
      reasoning_tokens: 0,
      cached_tokens: 0,
      total_tokens: 15,
    },
    __timestampMs: now - 1000,
  },
];

const quotaMap = {
  'codex-a.json': {
    status: 'success',
    windows: [
      {
        id: 'five-hour',
        label: '5h',
        usedPercent: 5,
        resetLabel: 'soon',
        resetAt: new Date(now + 60 * 60 * 1000).toISOString(),
        windowHours: 5,
      },
      {
        id: 'weekly',
        label: 'weekly',
        usedPercent: 15,
        resetLabel: 'later',
        resetAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
        windowHours: 24 * 7,
      },
    ],
  },
  'codex-b.json': {
    status: 'success',
    windows: [
      {
        id: 'five-hour',
        label: '5h',
        usedPercent: 8,
        resetLabel: 'soon',
        resetAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
        windowHours: 5,
      },
      {
        id: 'weekly',
        label: 'weekly',
        usedPercent: 45,
        resetLabel: 'later',
        resetAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
        windowHours: 24 * 7,
      },
    ],
  },
  'codex-c.json': {
    status: 'success',
    windows: [
      {
        id: 'five-hour',
        label: '5h',
        usedPercent: 62,
        resetLabel: 'soon',
        resetAt: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
        windowHours: 5,
      },
      {
        id: 'weekly',
        label: 'weekly',
        usedPercent: 52,
        resetLabel: 'later',
        resetAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
        windowHours: 24 * 7,
      },
    ],
  },
};

describe('QuotaAnalyticsView', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(window, 'scrollTo', {
      value: vi.fn(),
      writable: true,
    });
    capturedCharts.length = 0;
    mocks.showNotification.mockReset();
    mocks.downloadText.mockReset();
    mocks.downloadBlob.mockReset();
    mocks.zipFile.mockReset();
    mocks.zipGenerateAsync.mockReset();
    mocks.zipGenerateAsync.mockResolvedValue(new Blob(['archive']));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('支持图例筛选后保持柱图序列映射正确', async () => {
    const { QuotaAnalyticsView } = await import('./QuotaAnalyticsView');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    render(
      <QuotaAnalyticsView
        providerKey="codex"
        providerLabel="Codex"
        files={files}
        usageDetails={usageDetails}
        quotaMap={quotaMap}
      />
    );

    expect(screen.getByRole('button', { name: /^5h/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /^weekly/i })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^weekly/i }));

    const latestChart = capturedCharts[capturedCharts.length - 1];
    expect(latestChart.data.datasets.map((item) => item.label)).toEqual(['5h']);

    fireEvent.click(screen.getByRole('button', { name: 'Open 5h' }));

    expect(screen.getByText('codex-a.json')).not.toBeNull();
    expect(screen.getByText('codex-b.json')).not.toBeNull();
    expect(screen.queryByText('codex-c.json')).toBeNull();
  }, 15000);

  it('部分 quota 数据加载完成后继续显示统计图并展示进度', async () => {
    const { QuotaAnalyticsView } = await import('./QuotaAnalyticsView');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    render(
      <QuotaAnalyticsView
        providerKey="codex"
        providerLabel="Codex"
        files={files}
        usageDetails={usageDetails}
        quotaMap={{
          'codex-a.json': quotaMap['codex-a.json'],
        }}
        hydrating
        hydrationCompleted={1}
        hydrationTotal={3}
      />
    );

    expect(screen.getByText('Loading')).not.toBeNull();
    expect(screen.getByText('1/3 · 33.3%')).not.toBeNull();
    expect(screen.getByTestId('mock-bar-chart')).not.toBeNull();
  });

  it('点击柱子后可下载单个凭证', async () => {
    const { QuotaAnalyticsView } = await import('./QuotaAnalyticsView');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mocks.downloadText.mockResolvedValueOnce('{"name":"codex-a"}');

    render(
      <QuotaAnalyticsView
        providerKey="codex"
        providerLabel="Codex"
        files={files}
        usageDetails={usageDetails}
        quotaMap={quotaMap}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open 5h' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^(Download|download下载)$/i })[0]!);

    await flushPromises();

    expect(mocks.downloadText).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'codex-a.json' })
    );
    expect(mocks.downloadBlob).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'codex-a.json' })
    );
    expect(mocks.showNotification).toHaveBeenCalledWith('File downloaded successfully', 'success');
  });

  it('支持批量打包下载当前分桶下的全部凭证', async () => {
    const { QuotaAnalyticsView } = await import('./QuotaAnalyticsView');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mocks.downloadText.mockImplementation(async (target: { name?: string } | string) => {
      const name = typeof target === 'string' ? target : String(target.name ?? '');
      return `content:${name}`;
    });

    render(
      <QuotaAnalyticsView
        providerKey="codex"
        providerLabel="Codex"
        files={files}
        usageDetails={usageDetails}
        quotaMap={quotaMap}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open 5h' }));
    fireEvent.click(
      screen.getByRole('button', {
        name: /^(Download All \(2\)|全部下载（2）)$/,
      })
    );

    await flushPromises();
    await flushPromises();
    await vi.runAllTimersAsync();

    expect(mocks.downloadText).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'codex-a.json' })
    );
    expect(mocks.downloadText).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'codex-b.json' })
    );
    expect(mocks.zipFile).toHaveBeenCalledWith('codex-a.json', 'content:codex-a.json');
    expect(mocks.zipFile).toHaveBeenCalledWith('codex-b.json', 'content:codex-b.json');
    expect(mocks.zipGenerateAsync).toHaveBeenCalledWith({ type: 'blob' });
    expect(mocks.downloadBlob).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'codex__five-hour__bucket-1__90-100.zip' })
    );
    expect(mocks.showNotification).toHaveBeenCalledWith('Downloaded 2 files', 'success');
  });
});
