import { describe, expect, it } from 'vitest';
import {
  formatUsageDateTime,
  formatUsageLoadResult,
  formatUsageSize,
  getUsagePersistenceTone,
  normalizeUsagePersistenceStatus,
} from './usagePersistence';

describe('usagePersistence', () => {
  it('归一化 usage 持久化状态快照', () => {
    expect(
      normalizeUsagePersistenceStatus({
        enabled: true,
        file_path: '/workspace/usage-backups/usage-statistics.json',
        file_exists: true,
        file_size_bytes: 2048,
        last_load_added: 4,
        last_load_skipped: 1,
        last_error: ' disk full ',
      })
    ).toEqual({
      enabled: true,
      filePath: '/workspace/usage-backups/usage-statistics.json',
      fileExists: true,
      fileSizeBytes: 2048,
      lastLoadAdded: 4,
      lastLoadSkipped: 1,
      lastError: 'disk full',
    });

    expect(normalizeUsagePersistenceStatus(null)).toEqual({
      enabled: false,
      filePath: '--',
      fileExists: false,
      fileSizeBytes: 0,
      lastLoadAdded: 0,
      lastLoadSkipped: 0,
      lastError: '',
    });
  });

  it('格式化持久化展示字段', () => {
    expect(formatUsageDateTime(undefined)).toBe('--');
    expect(formatUsageDateTime('0001-01-01T00:00:00Z')).toBe('--');
    expect(formatUsageSize(1024)).toBe('1.0 KB');
    expect(
      getUsagePersistenceTone({
        enabled: true,
        last_error: 'disk full',
      })
    ).toBe('warning');
    expect(
      formatUsageLoadResult({
        last_load_added: 12,
        last_load_skipped: 3,
      })
    ).toBe('+12 / 3');
  });
});
