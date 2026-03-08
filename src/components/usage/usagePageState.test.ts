import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CHART_LINES,
  DEFAULT_TIME_RANGE,
  buildUsageTimeRangeOptions,
  loadStoredUsageChartLines,
  loadStoredUsageTimeRange,
  normalizeUsageChartLines,
  saveStoredUsageChartLines,
  saveStoredUsageTimeRange,
} from './usagePageState';

describe('usagePageState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('归一化图表线选择并读写本地存储', () => {
    expect(normalizeUsageChartLines(null)).toEqual(DEFAULT_CHART_LINES);
    expect(normalizeUsageChartLines([' all ', '', 'model-a'])).toEqual(['all', 'model-a']);

    saveStoredUsageChartLines(['all', 'model-b']);
    expect(loadStoredUsageChartLines()).toEqual(['all', 'model-b']);
  });

  it('读写时间范围并生成选项', () => {
    expect(loadStoredUsageTimeRange()).toBe(DEFAULT_TIME_RANGE);
    saveStoredUsageTimeRange('7d');
    expect(loadStoredUsageTimeRange()).toBe('7d');
    expect(buildUsageTimeRangeOptions(((key: string) => key) as never)).toEqual([
      { value: 'all', label: 'usage_stats.range_all' },
      { value: '7h', label: 'usage_stats.range_7h' },
      { value: '24h', label: 'usage_stats.range_24h' },
      { value: '7d', label: 'usage_stats.range_7d' },
    ]);
  });
});
