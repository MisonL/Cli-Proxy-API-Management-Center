import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuotaAnalyticsView } from './QuotaAnalyticsView';
import type { AuthFileItem } from '@/types/authFile';
import type { UsageDetail } from '@/utils/usage';

const capturedCharts: Array<{ data: { datasets: Array<{ label: string }> } }> = [];

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'quota_management.analytics.metric_extra_usage') return 'Extra Usage';
      if (key === 'quota_management.analytics.window_5h') return '5h';
      if (key === 'quota_management.analytics.window_24h') return '24h';
      if (key === 'quota_management.analytics.window_3d') return '3d';
      if (key === 'quota_management.analytics.window_7d') return '7d';
      if (key === 'quota_management.analytics.note_ready') return 'ready';
      if (key === 'quota_management.analytics.no_risk') return 'no risk';
      if (key === 'quota_management.analytics.days_value') return `${options?.count ?? ''} days`;
      return key;
    },
  }),
}));

vi.mock('@/stores', () => ({
  useThemeStore: (selector: (state: { resolvedTheme: 'light' }) => unknown) =>
    selector({ resolvedTheme: 'light' }),
}));

vi.mock('react-chartjs-2', () => ({
  Bar: (props: { data: { datasets: Array<{ label: string }> } }) => {
    capturedCharts.push(props);
    return <div data-testid="mock-bar-chart">{props.data.datasets.map((item) => item.label).join('|')}</div>;
  },
}));

describe('QuotaAnalyticsView', () => {
  it('supports filtering histogram series from legend clicks', () => {
    capturedCharts.length = 0;

    const files: AuthFileItem[] = [
      { name: 'codex-a.json', type: 'codex', authIndex: 'a' },
      { name: 'codex-b.json', type: 'codex', authIndex: 'b' },
    ];
    const now = Date.now();
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

    render(
      <QuotaAnalyticsView
        providerKey="codex"
        providerLabel="Codex"
        files={files}
        usageDetails={usageDetails}
        quotaMap={{
          'codex-a.json': {
            status: 'success',
            windows: [
              {
                id: 'five-hour',
                label: '5h',
                usedPercent: 10,
                resetLabel: 'soon',
                resetAt: new Date(now + 60 * 60 * 1000).toISOString(),
                windowHours: 5,
              },
              {
                id: 'weekly',
                label: 'weekly',
                usedPercent: 20,
                resetLabel: 'later',
                resetAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
                windowHours: 24 * 7,
              },
            ],
          },
        }}
      />
    );

    expect(screen.getByTestId('mock-bar-chart').textContent).toContain('5h');
    expect(screen.getByTestId('mock-bar-chart').textContent).toContain('weekly');

    fireEvent.click(screen.getByRole('button', { name: /weekly/i }));

    const latestChart = capturedCharts[capturedCharts.length - 1];
    expect(latestChart.data.datasets.map((item) => item.label)).toEqual(['5h']);
  });
});
