import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCredentialsPrefixProxyEditor } from './useCredentialsPrefixProxyEditor';

const mocks = vi.hoisted(() => ({
  downloadText: vi.fn(),
  saveText: vi.fn(),
  showNotification: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/services/api', () => ({
  credentialsApi: {
    downloadText: mocks.downloadText,
    saveText: mocks.saveText,
  },
}));

vi.mock('@/stores', () => ({
  useNotificationStore: () => ({
    showNotification: mocks.showNotification,
  }),
}));

describe('useCredentialsPrefixProxyEditor', () => {
  beforeEach(() => {
    mocks.downloadText.mockReset();
    mocks.saveText.mockReset();
    mocks.showNotification.mockReset();
  });

  it('同名平台凭证切换编辑器时按稳定 id 识别目标', async () => {
    mocks.downloadText
      .mockResolvedValueOnce(JSON.stringify({ type: 'codex', prefix: 'first' }))
      .mockResolvedValueOnce(JSON.stringify({ type: 'codex', prefix: 'second' }));

    const { result } = renderHook(() =>
      useCredentialsPrefixProxyEditor({
        disableControls: false,
        loadFiles: vi.fn().mockResolvedValue(true),
        loadKeyStats: vi.fn().mockResolvedValue(undefined),
      })
    );

    await act(async () => {
      await result.current.openPrefixProxyEditor({
        id: 'cred-1',
        name: 'shared.json',
        type: 'codex',
        provider: 'codex',
        platformBacked: true,
      });
    });
    expect(result.current.prefixProxyEditor?.prefix).toBe('first');

    await act(async () => {
      await result.current.openPrefixProxyEditor({
        id: 'cred-2',
        name: 'shared.json',
        type: 'codex',
        provider: 'codex',
        platformBacked: true,
      });
    });

    expect(result.current.prefixProxyEditor?.fileTarget.id).toBe('cred-2');
    expect(result.current.prefixProxyEditor?.prefix).toBe('second');
    expect(mocks.downloadText).toHaveBeenCalledTimes(2);
  });
});
