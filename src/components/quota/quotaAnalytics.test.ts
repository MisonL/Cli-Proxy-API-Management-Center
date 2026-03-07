import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { buildProviderAnalytics } from './quotaAnalytics';
import type { AuthFileItem } from '@/types/authFile';
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
    const files: AuthFileItem[] = [
      { name: 'codex-a.json', type: 'codex', authIndex: 'auth-a' },
      { name: 'codex-b.json', type: 'codex', authIndex: 'auth-b' },
    ];
    const usageDetails: UsageDetail[] = [
      {
        timestamp: new Date(now - 30 * 60 * 1000).toISOString(),
        auth_index: 'auth-a' as unknown as number,
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
        auth_index: 'auth-b' as unknown as number,
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
  });

  it('为无真实额度快照的渠道降级为 usage 统计', () => {
    const t = createTranslator();
    const now = Date.now();
    const files: AuthFileItem[] = [
      { name: 'qwen-a.json', type: 'qwen', authIndex: 'qwen-a', unavailable: true },
      { name: 'qwen-b.json', type: 'qwen', authIndex: 'qwen-b', disabled: true },
    ];
    const usageDetails: UsageDetail[] = [
      {
        timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        auth_index: 'qwen-a' as unknown as number,
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
});
