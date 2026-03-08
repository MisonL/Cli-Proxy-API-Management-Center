import { describe, expect, it, vi } from 'vitest';
import { authFilesApi } from './authFiles';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('./client', () => ({
  apiClient: {
    get: mocks.get,
  },
}));

describe('authFilesApi.list', () => {
  it('统一归一化 auth-files 列表中的运行时字段别名', async () => {
    mocks.get.mockResolvedValue({
      files: [
        {
          name: 'codex-a.json',
          auth_index: 'auth-a',
          runtime_only: true,
          status_message: 'quota limited',
          last_refresh: '2026-03-08T10:00:00.000Z',
          modtime: 123456,
          quota_exceeded: true,
          quota_reason: 'quota',
          quota_next_recover_at: '2026-03-08T12:00:00.000Z',
          quota_backoff_level: 3,
        },
      ],
      total: 1,
    });

    const result = await authFilesApi.list();
    const file = result.files[0];

    expect(file.authIndex).toBe('auth-a');
    expect(file.runtimeOnly).toBe(true);
    expect(file.statusMessage).toBe('quota limited');
    expect(file.lastRefresh).toBe('2026-03-08T10:00:00.000Z');
    expect(file.modified).toBe(123456);
    expect(file.quotaExceeded).toBe(true);
    expect(file.quotaReason).toBe('quota');
    expect(file.quotaNextRecoverAt).toBe('2026-03-08T12:00:00.000Z');
    expect(file.quotaBackoffLevel).toBe(3);
    expect(file.auth_index).toBe('auth-a');
  });
});
