import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTraceResolver } from './useTraceResolver';

const mocks = vi.hoisted(() => ({
  getTraceByRequestID: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'logs.trace_request_id_missing': '该日志没有 request_id，无法执行精确追踪。',
        'logs.trace_usage_load_error': '加载 request_id 追踪事件失败',
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/services/api/platform', () => ({
  platformApi: {
    getTraceByRequestID: mocks.getTraceByRequestID,
  },
}));

describe('useTraceResolver', () => {
  beforeEach(() => {
    mocks.getTraceByRequestID.mockReset();
  });

  it('存在 request_id 时走精确 Trace 接口', async () => {
    mocks.getTraceByRequestID.mockResolvedValue({
      request_id: 'abcd1234',
      items: [
        {
          event_key: 'evt-1',
          request_id: 'abcd1234',
          provider: 'codex',
          model: 'gpt-5',
          runtime_id: 'auth-1',
          selection_key: 'idx-1',
          source: 'codex-a.json',
          source_display_name: 'codex-a.json',
          source_type: 'codex',
          requested_at: '2026-03-09T08:00:00Z',
          failed: false,
          input_tokens: 10,
          output_tokens: 20,
          reasoning_tokens: 0,
          cached_tokens: 0,
          total_tokens: 30,
        },
      ],
    });

    const { result } = renderHook(() =>
      useTraceResolver({
        connectionStatus: 'connected',
        requestLogDownloading: false,
      })
    );

    await act(async () => {
      result.current.openTraceModal({
        raw: 'log line',
        requestId: 'abcd1234',
        path: '/v1/chat/completions',
        message: 'ok',
      });
    });

    expect(mocks.getTraceByRequestID).toHaveBeenCalledWith('abcd1234');
    expect(result.current.traceEvents).toHaveLength(1);
    expect(result.current.traceEvents[0]?.source_display_name).toBe('codex-a.json');
    expect(result.current.traceError).toBe('');
  });

  it('缺少 request_id 时不再执行启发式匹配', async () => {
    const { result } = renderHook(() =>
      useTraceResolver({
        connectionStatus: 'connected',
        requestLogDownloading: false,
      })
    );

    await act(async () => {
      result.current.openTraceModal({
        raw: 'log line',
        path: '/v1/chat/completions',
        message: 'ok',
      });
    });

    expect(mocks.getTraceByRequestID).not.toHaveBeenCalled();
    expect(result.current.traceEvents).toEqual([]);
    expect(result.current.traceError).toContain('request_id');
  });
});
