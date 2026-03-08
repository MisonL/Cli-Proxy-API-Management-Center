import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAuthFilesPageData } from './useAuthFilesPageData';
import type { AuthFileItem } from '@/types';
import type { UsageDetail } from '@/utils/usage';

const now = new Date('2026-03-08T12:00:00.000Z').getTime();

const files: AuthFileItem[] = [
  { name: 'codex-a.json', type: 'codex', authIndex: 'auth-a', modified: now - 1000 },
  { name: 'claude-b.json', type: 'claude', authIndex: 'auth-b', disabled: true, modified: now - 3000 },
  {
    name: 'codex-warning.json',
    type: 'codex',
    authIndex: 'auth-c',
    statusMessage: 'throttled',
    modified: now - 2000,
  },
];

const usageDetails: UsageDetail[] = [
  {
    timestamp: new Date(now - 30 * 60 * 1000).toISOString(),
    auth_index: 'auth-a' as unknown as number,
    source: '',
    failed: false,
    tokens: {
      input_tokens: 1,
      output_tokens: 1,
      reasoning_tokens: 0,
      cached_tokens: 0,
      total_tokens: 2,
    },
    __timestampMs: now - 30 * 60 * 1000,
  },
];

describe('useAuthFilesPageData', () => {
  it('支持类型统计、过滤、排序和分页派生', () => {
    const { result } = renderHook(() =>
      useAuthFilesPageData({
        files,
        selectedFiles: new Set(['codex-a.json']),
        keyStats: { byAuthIndex: {}, bySource: {} },
        usageDetails,
        filters: {
          filter: 'codex',
          problemOnly: false,
          search: '',
          statusFilter: 'all',
          activityFilter: 'all',
          sortBy: 'active-desc',
          page: 1,
          pageSize: 1,
          activityReferenceNow: now,
        },
      })
    );

    expect(result.current.typeCounts).toEqual({ all: 3, codex: 2, claude: 1 });
    expect(result.current.filtered.map((item) => item.name)).toEqual([
      'codex-a.json',
      'codex-warning.json',
    ]);
    expect(result.current.pageItems.map((item) => item.name)).toEqual(['codex-a.json']);
    expect(result.current.selectedNames).toEqual(['codex-a.json']);
  });
});
