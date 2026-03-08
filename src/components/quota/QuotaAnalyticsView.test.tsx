import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuotaAnalyticsView } from './QuotaAnalyticsView';
import type { AuthFileItem } from '@/types/authFile';
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
        'quota_management.analytics.not_available': 'N/A',
        'auth_files.download_success': 'File downloaded successfully',
        'auth_files.file_size': 'Size',
        'auth_files.file_modified': 'Modified',
        'notification.download_failed': 'Download failed',
        'auth_files.filter_codex': 'Codex',
        'auth_files.filter_unknown': 'Unknown',
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
  authFilesApi: {
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

const files: AuthFileItem[] = [
  { name: 'codex-a.json', type: 'codex', authIndex: 'a', size: 1200, modified: now - 1000 },
  { name: 'codex-b.json', type: 'codex', authIndex: 'b', disabled: true, size: 1600, modified: now - 2000 },
  { name: 'codex-c.json', type: 'codex', authIndex: 'c', unavailable: true, size: 2000, modified: now - 3000 },
];

const usageDetails: UsageDetail[] = [
  {
    timestamp: new Date(now - 1000).toISOString(),
    auth_index: 'a' as unknown as number,
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
    vi.useFakeTimers();
    vi.setSystemTime(now);
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

  it('支持图例筛选后保持柱图序列映射正确', () => {
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

    expect(screen.getByText('Codex · 5h · 90-100%')).not.toBeNull();
    expect(screen.getByText('codex-a.json')).not.toBeNull();
    expect(screen.getByText('codex-b.json')).not.toBeNull();
    expect(screen.queryByText('codex-c.json')).toBeNull();
  });

  it('点击柱子后可下载单个认证文件', async () => {
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Download' })[0]!);

    await flushPromises();

    expect(mocks.downloadText).toHaveBeenCalledWith('codex-a.json');
    expect(mocks.downloadBlob).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'codex-a.json' })
    );
    expect(mocks.showNotification).toHaveBeenCalledWith('File downloaded successfully', 'success');
  });

  it('支持批量打包下载当前分桶下的全部认证文件', async () => {
    mocks.downloadText.mockImplementation(async (name: string) => `content:${name}`);

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
    fireEvent.click(screen.getByRole('button', { name: 'Download All (2)' }));

    await flushPromises();
    await flushPromises();

    expect(mocks.downloadText).toHaveBeenCalledWith('codex-a.json');
    expect(mocks.downloadText).toHaveBeenCalledWith('codex-b.json');
    expect(mocks.zipFile).toHaveBeenCalledWith('codex-a.json', 'content:codex-a.json');
    expect(mocks.zipFile).toHaveBeenCalledWith('codex-b.json', 'content:codex-b.json');
    expect(mocks.zipGenerateAsync).toHaveBeenCalledWith({ type: 'blob' });
    expect(mocks.downloadBlob).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'codex__five-hour__bucket-1__90-100.zip' })
    );
    expect(mocks.showNotification).toHaveBeenCalledWith('Downloaded 2 files', 'success');
  });
});
