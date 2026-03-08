import { describe, expect, it } from 'vitest';
import type { AuthFileItem } from '@/types/authFile';
import {
  buildSelectedQuotaBucketState,
  getVisibleHistogramDatasets,
  sanitizeHiddenDatasetIds,
  toggleHiddenDatasetId,
} from './quotaAnalyticsViewState';

const datasets = [
  {
    id: 'five-hour',
    label: '5h',
    color: '#111',
    counts: [2, 0],
    averageRemaining: 88,
    bucketItems: [[{ fileName: 'a.json', remainingPercent: 90 }], []],
  },
  {
    id: 'weekly',
    label: '7d',
    color: '#222',
    counts: [1, 0],
    averageRemaining: 65,
    bucketItems: [[{ fileName: 'b.json', remainingPercent: 60 }], []],
  },
];

describe('quotaAnalyticsViewState', () => {
  it('限制隐藏集数量并过滤无效 id', () => {
    expect(sanitizeHiddenDatasetIds(['missing', 'five-hour'], datasets as never)).toEqual([
      'five-hour',
    ]);
    expect(toggleHiddenDatasetId([], 'five-hour', datasets as never)).toEqual(['five-hour']);
    expect(toggleHiddenDatasetId(['five-hour'], 'weekly', datasets as never)).toEqual([
      'five-hour',
    ]);
    expect(getVisibleHistogramDatasets(datasets as never, ['five-hour'])).toEqual([
      datasets[1],
    ]);
  });

  it('根据点击位置构建桶明细', () => {
    const fileMap = new Map<string, AuthFileItem>([
      ['a.json', { name: 'a.json', type: 'codex' }],
    ]);

    expect(
      buildSelectedQuotaBucketState({
        datasets: datasets as never,
        datasetIndex: 0,
        bucketIndex: 0,
        histogramLabels: ['90-100%', '80-90%'],
        fileMap,
      })
    ).toEqual({
      datasetId: 'five-hour',
      datasetLabel: '5h',
      bucketIndex: 0,
      bucketLabel: '90-100%',
      items: [
        {
          fileName: 'a.json',
          remainingPercent: 90,
          file: { name: 'a.json', type: 'codex' },
        },
      ],
    });
  });
});
