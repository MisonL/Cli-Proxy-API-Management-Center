import { describe, expect, it } from 'vitest';
import {
  buildSystemModelStatus,
  getSystemSelfCheckTone,
  normalizeSelfChecks,
  normalizeSystemErrorMessage,
} from './systemPageState';

describe('systemPageState', () => {
  it('构建模型状态和自检 tone', () => {
    const t = ((key: string, options?: Record<string, unknown>) => {
      if (key === 'system_info.models_count') {
        return `模型数 ${options?.count ?? 0}`;
      }
      return key;
    }) as never;

    expect(buildSystemModelStatus(t, 'loading')).toEqual({
      type: 'muted',
      message: 'system_info.models_loading',
    });
    expect(buildSystemModelStatus(t, 'success', { count: 3 })).toEqual({
      type: 'success',
      message: '模型数 3',
    });
    expect(getSystemSelfCheckTone('warn')).toBe('warning');
  });

  it('归一化自检列表与错误消息', () => {
    expect(normalizeSelfChecks(null)).toEqual([]);
    expect(normalizeSystemErrorMessage(new Error('boom'))).toBe('boom');
    expect(normalizeSystemErrorMessage(undefined, 'fallback')).toBe('fallback');
  });
});
