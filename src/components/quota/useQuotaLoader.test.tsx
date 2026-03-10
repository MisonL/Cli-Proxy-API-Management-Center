import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CredentialItem } from '@/types/credential';
import { useQuotaStore } from '@/stores';
import { useQuotaLoader } from './useQuotaLoader';
import type { QuotaConfig } from './quotaConfigs';
import type { QuotaStatusState } from './QuotaCard';

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

type TestQuotaState = QuotaStatusState & { value?: number };

type TestQuotaData = { value: number };

const buildConfig = (
  fetchQuota: (file: CredentialItem) => Promise<TestQuotaData>,
  fetchQuotaBatch?: (
    files: CredentialItem[]
  ) => Promise<Array<{ name: string; status: 'success' | 'error'; data?: TestQuotaData }>>
): QuotaConfig<TestQuotaState, TestQuotaData> =>
  ({
    type: 'codex',
    i18nPrefix: 'codex_quota',
    cardClassName: 'card',
    controlsClassName: 'controls',
    controlClassName: 'control',
    gridClassName: 'grid',
    filterFn: () => true,
    fetchQuota: (file) => fetchQuota(file),
    fetchQuotaBatch: fetchQuotaBatch ? (files) => fetchQuotaBatch(files) : undefined,
    storeSelector: (state) => state.codexQuota,
    storeSetter: 'setCodexQuota',
    buildLoadingState: () => ({ status: 'loading' }),
    buildSuccessState: (data) => ({ status: 'success', value: data.value }),
    buildErrorState: (message, status) => ({ status: 'error', error: message, errorStatus: status }),
    renderQuotaItems: () => null,
  }) as QuotaConfig<TestQuotaState, TestQuotaData>;

describe('useQuotaLoader', () => {
  beforeEach(() => {
    useQuotaStore.getState().clearQuotaCache();
  });

  afterEach(() => {
    useQuotaStore.getState().clearQuotaCache();
  });

  it('全量加载时按批次增量写入 quota 结果', async () => {
    const deferredResolvers: Array<() => void> = [];
    const fetchQuota = vi.fn((file: CredentialItem) => {
      const index = Number(file.selectionKey ?? 0);
      if (index >= 24) {
        return new Promise<TestQuotaData>((resolve) => {
          deferredResolvers.push(() => resolve({ value: index }));
        });
      }
      return Promise.resolve({ value: index });
    });

    const files = Array.from({ length: 30 }, (_, index) => ({
      name: `file-${index}.json`,
      selectionKey: index,
      type: 'codex',
    })) as CredentialItem[];

    const setLoading = vi.fn();
    const { result } = renderHook(() => useQuotaLoader(buildConfig(fetchQuota)));

    await act(async () => {
      void result.current.loadQuota(files, 'all', setLoading);
    });

    await waitFor(() => {
      expect(result.current.progress.completed).toBe(24);
    });

    expect(useQuotaStore.getState().codexQuota['file-23.json']?.status).toBe('success');
    expect(useQuotaStore.getState().codexQuota['file-29.json']?.status).toBe('loading');

    await act(async () => {
      deferredResolvers.forEach((resolve) => resolve());
    });

    await waitFor(() => {
      expect(result.current.progress.active).toBe(false);
    });

    expect(result.current.progress.completed).toBe(0);
    expect(result.current.progress.total).toBe(0);
    expect(useQuotaStore.getState().codexQuota['file-29.json']?.status).toBe('success');
    expect(setLoading).toHaveBeenCalledWith(true, 'all');
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });

  it('支持限制最大加载目标数', async () => {
    const fetchQuota = vi.fn(async (file: CredentialItem) => ({
      value: Number(file.selectionKey ?? 0),
    }));
    const files = Array.from({ length: 6 }, (_, index) => ({
      name: `file-${index}.json`,
      selectionKey: index,
      type: 'codex',
    })) as CredentialItem[];

    const setLoading = vi.fn();
    const { result } = renderHook(() => useQuotaLoader(buildConfig(fetchQuota)));

    await act(async () => {
      await result.current.loadQuota(files, 'all', setLoading, { maxTargets: 3 });
    });

    expect(fetchQuota).toHaveBeenCalledTimes(3);
    expect(useQuotaStore.getState().codexQuota['file-2.json']?.status).toBe('success');
    expect(useQuotaStore.getState().codexQuota['file-3.json']).toBeUndefined();
  });

  it('默认跳过已经解析完成的 quota 缓存', async () => {
    const fetchQuota = vi.fn(async (file: CredentialItem) => ({
      value: Number(file.selectionKey ?? 0),
    }));
    const files = [
      { name: 'cached.json', selectionKey: 1, type: 'codex' },
      { name: 'pending.json', selectionKey: 2, type: 'codex' },
    ] as CredentialItem[];

    useQuotaStore.getState().setCodexQuota({
      'cached.json': { status: 'success', windows: [] },
    } as never);

    const setLoading = vi.fn();
    const { result } = renderHook(() => useQuotaLoader(buildConfig(fetchQuota)));

    await act(async () => {
      await result.current.loadQuota(files, 'page', setLoading);
    });

    expect(fetchQuota).toHaveBeenCalledTimes(1);
    expect(fetchQuota).toHaveBeenCalledWith(files[1]);
    expect(useQuotaStore.getState().codexQuota['cached.json']?.status).toBe('success');
    expect(useQuotaStore.getState().codexQuota['pending.json']?.status).toBe('success');
  });

  it('支持取消正在进行的加载', async () => {
    const deferredResolvers: Array<() => void> = [];
    const fetchQuota = vi.fn((file: CredentialItem) => {
      return new Promise<TestQuotaData>((resolve) => {
        deferredResolvers.push(() => resolve({ value: Number(file.selectionKey ?? 0) }));
      });
    });
    const files = Array.from({ length: 3 }, (_, index) => ({
      name: `file-${index}.json`,
      selectionKey: index,
      type: 'codex',
    })) as CredentialItem[];

    const setLoading = vi.fn();
    const { result } = renderHook(() => useQuotaLoader(buildConfig(fetchQuota)));

    act(() => {
      void result.current.loadQuota(files, 'all', setLoading);
    });

    await waitFor(() => {
      expect(result.current.progress.active).toBe(true);
    });

    act(() => {
      result.current.cancel();
    });

    expect(result.current.progress.active).toBe(false);
    expect(setLoading).toHaveBeenCalledWith(false, null);

    deferredResolvers.forEach((resolve) => resolve());
  });

  it('优先使用批量接口写入当前批次结果', async () => {
    const fetchQuota = vi.fn(async (file: CredentialItem) => ({
      value: Number(file.selectionKey ?? 0),
    }));
    const fetchQuotaBatch = vi.fn(async (files: CredentialItem[]) =>
      files.map((file) => ({
        name: file.name,
        status: 'success' as const,
        data: { value: Number(file.selectionKey ?? 0) + 100 },
      }))
    );
    const files = [
      { name: 'alpha.json', selectionKey: 1, type: 'codex' },
      { name: 'beta.json', selectionKey: 2, type: 'codex' },
    ] as CredentialItem[];

    const setLoading = vi.fn();
    const { result } = renderHook(() => useQuotaLoader(buildConfig(fetchQuota, fetchQuotaBatch)));

    await act(async () => {
      await result.current.loadQuota(files, 'page', setLoading);
    });

    expect(fetchQuotaBatch).toHaveBeenCalledTimes(1);
    expect(fetchQuota).not.toHaveBeenCalled();
    expect(useQuotaStore.getState().codexQuota['alpha.json']).toMatchObject({
      status: 'success',
      value: 101,
    });
    expect(useQuotaStore.getState().codexQuota['beta.json']).toMatchObject({
      status: 'success',
      value: 102,
    });
  });

  it('批量接口失败后回退到单文件请求并停用后续批量尝试', async () => {
    const fetchQuota = vi.fn(async (file: CredentialItem) => ({
      value: Number(file.selectionKey ?? 0),
    }));
    const fetchQuotaBatch = vi
      .fn<
        (files: CredentialItem[]) => Promise<Array<{ name: string; status: 'success'; data: TestQuotaData }>>
      >()
      .mockRejectedValueOnce(new Error('not supported'));
    const files = [
      { name: 'alpha.json', selectionKey: 1, type: 'codex' },
      { name: 'beta.json', selectionKey: 2, type: 'codex' },
    ] as CredentialItem[];

    const setLoading = vi.fn();
    const { result } = renderHook(() => useQuotaLoader(buildConfig(fetchQuota, fetchQuotaBatch)));

    await act(async () => {
      await result.current.loadQuota(files, 'page', setLoading, { force: true });
      await result.current.loadQuota(files, 'page', setLoading, { force: true });
    });

    expect(fetchQuotaBatch).toHaveBeenCalledTimes(1);
    expect(fetchQuota).toHaveBeenCalledTimes(4);
    expect(useQuotaStore.getState().codexQuota['alpha.json']).toMatchObject({
      status: 'success',
      value: 1,
    });
  });
});
