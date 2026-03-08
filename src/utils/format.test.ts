import { describe, expect, it } from 'vitest';
import { formatDateTime } from './format';

describe('formatDateTime', () => {
  it('对空值和非法日期返回占位符', () => {
    expect(formatDateTime(undefined)).toBe('--');
    expect(formatDateTime(null)).toBe('--');
    expect(formatDateTime('')).toBe('--');
    expect(formatDateTime('unknown')).toBe('--');
    expect(formatDateTime('0001-01-01T00:00:00Z')).toBe('--');
  });

  it('对合法日期返回格式化结果', () => {
    const formatted = formatDateTime('2026-03-08T12:34:56.000Z', 'zh-CN');

    expect(formatted).not.toBe('--');
    expect(formatted).toContain('2026');
  });
});
