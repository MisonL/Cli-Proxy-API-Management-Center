import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { buildProviderAnalytics, buildProviderAnalyticsFromOverview } from './quotaAnalytics';
import type { CredentialItem } from '@/types/credential';
import type { UsageDetail } from '@/utils/usage';
import type { CodexQuotaState } from '@/types/quota';

const createTranslator = () =>
  ((key: string, options?: Record<string, unknown>) => {
    if (key === 'quota_management.analytics.note_partial') {
      return `loaded ${options?.loaded}/${options?.total}`;
    }
    if (key === 'quota_management.analytics.note_usage_only') {
      return 'usage-only';
    }
    if (key === 'quota_management.analytics.note_ready') {
      return 'ready';
    }
    if (key === 'quota_management.analytics.note_pending') {
      return 'pending';
    }
    if (key === 'quota_management.analytics.metric_extra_usage') {
      return 'Extra Usage';
    }
    if (key === 'quota_management.analytics.warning_health_low') {
      return 'health-low';
    }
    if (key === 'quota_management.analytics.warning_risk_near') {
      return `risk-${options?.days ?? ''}`;
    }
    if (key === 'quota_management.analytics.warning_snapshot_low') {
      return `snapshot-low-${options?.loaded}/${options?.total}`;
    }
    if (key === 'quota_management.analytics.warning_snapshot_failed') {
      return `snapshot-failed-${options?.count ?? ''}`;
    }
    if (key === 'quota_management.analytics.warning_failure_rate_high') {
      return `failure-high-${options?.rate ?? ''}`;
    }
    if (key === 'quota_management.analytics.warning_pool_inactive') {
      return `pool-inactive-${options?.percent ?? ''}`;
    }
    if (key === 'quota_management.analytics.window_5h') {
      return '5h';
    }
    if (key === 'quota_management.analytics.window_24h') {
      return '24h';
    }
    if (key === 'quota_management.analytics.window_3d') {
      return '3d';
    }
    if (key === 'quota_management.analytics.window_7d') {
      return '7d';
    }
    return key;
  }) as unknown as TFunction;

describe('buildProviderAnalytics', () => {
  it('为支持真实额度的渠道生成分布图和健康度', () => {
    const t = createTranslator();
    const now = Date.now();
    const files: CredentialItem[] = [
      { name: 'codex-a.json', type: 'codex', selectionKey: 'auth-a' },
      { name: 'codex-b.json', type: 'codex', selectionKey: 'auth-b' },
    ];
    const usageDetails: UsageDetail[] = [
      {
        timestamp: new Date(now - 30 * 60 * 1000).toISOString(),
        selection_key: 'auth-a' as unknown as number,
        source: '',
        failed: false,
        tokens: {
          input_tokens: 100,
          output_tokens: 40,
          reasoning_tokens: 0,
          cached_tokens: 0,
          total_tokens: 140,
        },
        __timestampMs: now - 30 * 60 * 1000,
      },
      {
        timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        selection_key: 'auth-b' as unknown as number,
        source: '',
        failed: true,
        tokens: {
          input_tokens: 80,
          output_tokens: 20,
          reasoning_tokens: 0,
          cached_tokens: 0,
          total_tokens: 100,
        },
        __timestampMs: now - 2 * 60 * 60 * 1000,
      },
    ];
    const quotaMap: Record<string, CodexQuotaState> = {
      'codex-a.json': {
        status: 'success',
        windows: [
          {
            id: 'five-hour',
            label: '5h window',
            usedPercent: 30,
            resetLabel: 'soon',
            resetAt: new Date(now + 60 * 60 * 1000).toISOString(),
            windowHours: 5,
          },
          {
            id: 'weekly',
            label: 'weekly window',
            usedPercent: 60,
            resetLabel: 'later',
            resetAt: new Date(now + 48 * 60 * 60 * 1000).toISOString(),
            windowHours: 24 * 7,
          },
        ],
      },
      'codex-b.json': {
        status: 'success',
        windows: [
          {
            id: 'five-hour',
            label: '5h window',
            usedPercent: 80,
            resetLabel: 'very soon',
            resetAt: new Date(now + 30 * 60 * 1000).toISOString(),
            windowHours: 5,
          },
        ],
      },
    };

    const analytics = buildProviderAnalytics(t, 'codex', files, usageDetails, quotaMap);

    expect(analytics.mode).toBe('quota');
    expect(analytics.totalFiles).toBe(2);
    expect(analytics.loadedFiles).toBe(2);
    expect(analytics.histogramDatasets.length).toBeGreaterThan(0);
    expect(analytics.conservativeHealth).toBe(20);
    expect(analytics.averageHealth).not.toBeNull();
    expect(analytics.windowStats.find((item) => item.id === '5h')?.requestCount).toBe(2);
    expect(analytics.warnings.length).toBeGreaterThan(0);
    expect(analytics.warnings.some((item) => item.message === 'health-low')).toBe(true);
    expect(
      analytics.histogramDatasets
        .find((item) => item.id === 'five-hour')
        ?.bucketItems[2]?.map((entry) => entry.fileName)
    ).toEqual(['codex-a.json']);
    expect(
      analytics.histogramDatasets
        .find((item) => item.id === 'five-hour')
        ?.bucketItems[7]?.map((entry) => entry.fileName)
    ).toEqual(['codex-b.json']);
  });

  it('为无真实额度快照的渠道降级为 usage 统计', () => {
    const t = createTranslator();
    const now = Date.now();
    const files: CredentialItem[] = [
      { name: 'qwen-a.json', type: 'qwen', selectionKey: 'qwen-a', unavailable: true },
      { name: 'qwen-b.json', type: 'qwen', selectionKey: 'qwen-b', disabled: true },
    ];
    const usageDetails: UsageDetail[] = [
      {
        timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        selection_key: 'qwen-a' as unknown as number,
        source: '',
        failed: false,
        tokens: {
          input_tokens: 30,
          output_tokens: 10,
          reasoning_tokens: 0,
          cached_tokens: 0,
          total_tokens: 40,
        },
        __timestampMs: now - 2 * 60 * 60 * 1000,
      },
    ];

    const analytics = buildProviderAnalytics(t, 'qwen', files, usageDetails);

    expect(analytics.mode).toBe('usage-only');
    expect(analytics.histogramDatasets).toHaveLength(0);
    expect(analytics.operationalHealth).not.toBeNull();
    expect(analytics.note).toBe('usage-only');
    expect(analytics.unavailableFiles).toBe(1);
    expect(analytics.disabledFiles).toBe(1);
  });

  it('支持按自定义阈值调整预警命中', () => {
    const t = createTranslator();
    const now = Date.now();
    const files: CredentialItem[] = [
      { name: 'codex-a.json', type: 'codex', selectionKey: 'auth-a' },
    ];
    const usageDetails: UsageDetail[] = [
      {
        timestamp: new Date(now - 60 * 60 * 1000).toISOString(),
        selection_key: 'auth-a' as unknown as number,
        source: '',
        failed: false,
        tokens: {
          input_tokens: 10,
          output_tokens: 5,
          reasoning_tokens: 0,
          cached_tokens: 0,
          total_tokens: 15,
        },
        __timestampMs: now - 60 * 60 * 1000,
      },
    ];
    const quotaMap: Record<string, CodexQuotaState> = {
      'codex-a.json': {
        status: 'success',
        windows: [
          {
            id: 'five-hour',
            label: '5h window',
            usedPercent: 55,
            resetLabel: 'soon',
            resetAt: new Date(now + 10 * 60 * 60 * 1000).toISOString(),
            windowHours: 5,
          },
        ],
      },
    };

    const analytics = buildProviderAnalytics(t, 'codex', files, usageDetails, quotaMap, {
      healthLowPercent: 60,
      riskDays: 10,
      snapshotCoveragePercent: 10,
      failureRate24hPercent: 90,
      activePoolPercent7d: 10,
    });

    expect(analytics.warnings.some((item) => item.message === 'health-low')).toBe(true);
    expect(analytics.warnings.some((item) => item.message.startsWith('risk-'))).toBe(true);
  });

  it('支持直接消费平台 overview 聚合结果', () => {
    const t = createTranslator();
    const analytics = buildProviderAnalyticsFromOverview(t, 'codex', {
      provider: 'codex',
      mode: 'quota',
      total_credentials: 3,
      active_credentials: 3,
      disabled_credentials: 0,
      unavailable_credentials: 1,
      loaded_credentials: 3,
      failed_quota_credentials: 0,
      histogram_labels: ['90-100%', '80-90%'],
      histogram_datasets: [
        {
          id: 'five-hour',
          label: '5h',
          color: '#2563eb',
          counts: [2, 1],
          average_remaining: 84,
          bucket_items: [
            [
              {
                credential_id: 'a',
                credential_name: 'codex-a.json',
                remaining_percent: 96,
              },
            ],
            [
              {
                credential_id: 'b',
                credential_name: 'codex-b.json',
                remaining_percent: 82,
              },
            ],
          ],
        },
      ],
      window_stats: [
        {
          id: '24h',
          label: '24h',
          request_count: 12,
          token_count: 3456,
          failure_count: 1,
          failure_rate: 8.3,
          active_credential_count: 2,
          active_pool_percent: 66.7,
          avg_daily_requests: 12,
          avg_daily_tokens: 3456,
        },
      ],
      conservative_health: 82,
      average_health: 88,
      operational_health: 91,
      conservative_risk_days: 5,
      average_risk_days: 8,
      avg_daily_quota_burn_percent: 12,
      active_pool_percent_7d: 66.7,
      note: 'ready',
      warnings: [],
      generated_at: new Date().toISOString(),
    });

    expect(analytics.mode).toBe('quota');
    expect(analytics.totalFiles).toBe(3);
    expect(analytics.histogramDatasets[0]?.bucketItems[0]?.[0]?.fileName).toBe('codex-a.json');
    expect(analytics.windowStats[0]?.requestCount).toBe(12);
    expect(analytics.conservativeHealth).toBe(82);
  });
});
