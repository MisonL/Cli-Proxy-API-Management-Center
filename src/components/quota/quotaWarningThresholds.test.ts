import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_QUOTA_WARNING_THRESHOLDS } from './quotaAnalytics';
import {
  loadStoredQuotaWarningThresholds,
  normalizeQuotaWarningThresholds,
  parseImportedQuotaWarningThresholds,
  saveStoredQuotaWarningThresholds,
  serializeQuotaWarningThresholds,
  updateQuotaWarningThreshold,
} from './quotaWarningThresholds';

describe('quotaWarningThresholds', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('对非法输入回退到默认阈值并限制范围', () => {
    expect(normalizeQuotaWarningThresholds(null)).toEqual(DEFAULT_QUOTA_WARNING_THRESHOLDS);
    expect(
      normalizeQuotaWarningThresholds({
        healthLowPercent: 180,
        riskDays: -2,
        snapshotCoveragePercent: '18',
        failureRate24hPercent: 'oops',
        activePoolPercent7d: 40,
      })
    ).toEqual({
      healthLowPercent: 100,
      riskDays: 0,
      snapshotCoveragePercent: 18,
      failureRate24hPercent: DEFAULT_QUOTA_WARNING_THRESHOLDS.failureRate24hPercent,
      activePoolPercent7d: 40,
    });
  });

  it('支持导出、导入和本地存储读写', () => {
    const payload = serializeQuotaWarningThresholds({
      healthLowPercent: 55,
      riskDays: 4,
      snapshotCoveragePercent: 35,
      failureRate24hPercent: 22,
      activePoolPercent7d: 18,
    });

    expect(parseImportedQuotaWarningThresholds(payload)).toEqual(payload.thresholds);

    saveStoredQuotaWarningThresholds(payload.thresholds);
    expect(loadStoredQuotaWarningThresholds()).toEqual(payload.thresholds);
  });

  it('仅更新指定阈值字段', () => {
    expect(updateQuotaWarningThreshold(DEFAULT_QUOTA_WARNING_THRESHOLDS, 'riskDays', 999)).toEqual({
      ...DEFAULT_QUOTA_WARNING_THRESHOLDS,
      riskDays: 30,
    });
  });
});
