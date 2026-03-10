import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCredentialsData } from './useCredentialsData';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  showNotification: vi.fn(),
  showConfirmation: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/services/api', () => ({
  credentialsApi: {
    list: mocks.list,
  },
  isCredentialInvalidJsonObjectError: () => false,
}));

vi.mock('@/stores', () => ({
  useNotificationStore: () => ({
    showNotification: mocks.showNotification,
    showConfirmation: mocks.showConfirmation,
  }),
}));

describe('useCredentialsData', () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.showNotification.mockReset();
    mocks.showConfirmation.mockReset();
  });

  it('请求失败后会清空平台残留状态', async () => {
    mocks.list.mockResolvedValueOnce({
      files: [{ name: 'codex-a.json', platformBacked: true }],
      total: 1,
      providerFacets: { codex: 1 },
      platformBacked: true,
    });
    mocks.list.mockRejectedValueOnce(new Error('request failed'));

    const { result } = renderHook(() =>
      useCredentialsData({
        refreshKeyStats: vi.fn().mockResolvedValue(undefined),
      })
    );

    await act(async () => {
      await result.current.loadFiles();
    });

    expect(result.current.platformBacked).toBe(true);
    expect(result.current.files).toHaveLength(1);
    expect(result.current.totalFiles).toBe(1);

    await act(async () => {
      await result.current.loadFiles();
    });

    expect(result.current.platformBacked).toBe(false);
    expect(result.current.files).toEqual([]);
    expect(result.current.totalFiles).toBe(0);
    expect(result.current.providerFacets).toEqual({});
    expect(result.current.error).toBe('request failed');
  });
});
