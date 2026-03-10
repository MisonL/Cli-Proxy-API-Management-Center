import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCredentialsModels } from './useCredentialsModels';

const mocks = vi.hoisted(() => ({
  getModelsForCredential: vi.fn(),
  showNotification: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/services/api', () => ({
  credentialsApi: {
    getModelsForCredential: mocks.getModelsForCredential,
  },
}));

vi.mock('@/stores', () => ({
  useNotificationStore: () => ({
    showNotification: mocks.showNotification,
  }),
}));

describe('useCredentialsModels', () => {
  beforeEach(() => {
    mocks.getModelsForCredential.mockReset();
    mocks.showNotification.mockReset();
  });

  it('同名平台凭证会按稳定 id 分开缓存支持模型结果', async () => {
    mocks.getModelsForCredential
      .mockResolvedValueOnce([{ id: 'model-a' }])
      .mockResolvedValueOnce([{ id: 'model-b' }]);

    const { result } = renderHook(() => useCredentialsModels());

    await act(async () => {
      await result.current.showModels({
        id: 'cred-1',
        name: 'shared.json',
        platformBacked: true,
      });
    });
    expect(result.current.modelsList).toEqual([{ id: 'model-a' }]);

    await act(async () => {
      await result.current.showModels({
        id: 'cred-2',
        name: 'shared.json',
        platformBacked: true,
      });
    });
    expect(result.current.modelsList).toEqual([{ id: 'model-b' }]);
    expect(mocks.getModelsForCredential).toHaveBeenNthCalledWith(1, {
      id: 'cred-1',
      name: 'shared.json',
      platformBacked: true,
    });
    expect(mocks.getModelsForCredential).toHaveBeenNthCalledWith(2, {
      id: 'cred-2',
      name: 'shared.json',
      platformBacked: true,
    });
  });
});
