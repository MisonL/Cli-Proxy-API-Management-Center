import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  postForm: vi.fn(),
}));

vi.mock('./client', () => ({
  apiClient: {
    get: mocks.get,
    post: mocks.post,
    put: mocks.put,
    patch: mocks.patch,
    delete: mocks.del,
    postForm: mocks.postForm,
  },
}));

describe('credentialsApi.list', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.put.mockReset();
    mocks.patch.mockReset();
    mocks.del.mockReset();
    mocks.postForm.mockReset();
  });

  it('统一归一化凭证列表中的运行时字段别名', async () => {
    const { credentialsApi } = await import('./credentials');

    mocks.get.mockResolvedValue({
      items: [
        {
          id: 'cred-a',
          credential_name: 'codex-a.json',
          provider: 'codex',
          selection_key: 'auth-a',
          runtime_only: true,
          status_message: 'quota limited',
          last_refresh_at: '2026-03-08T10:00:00.000Z',
          updated_at: '2026-03-08T10:30:00.000Z',
          quota_exceeded: true,
          requests_24h: 12,
          requests_7d: 30,
          failures_24h: 1,
          failure_rate_24h: 8.33,
          total_tokens_24h: 100,
          total_tokens_7d: 500,
          snapshot_mode: 'usage-only',
        },
      ],
      total: 1,
      page: 1,
      page_size: 50,
    });

    const result = await credentialsApi.list();
    const file = result.files[0];

    expect(file.id).toBe('cred-a');
    expect(file.name).toBe('codex-a.json');
    expect(file.selectionKey).toBe('auth-a');
    expect(file.runtimeOnly).toBe(true);
    expect(file.statusMessage).toBe('quota limited');
    expect(file.lastRefresh).toBe('2026-03-08T10:00:00.000Z');
    expect(file.quotaExceeded).toBe(true);
    expect(file.platformBacked).toBe(true);
  });

  it('平台接口返回空列表时仍保持平台模式，不回退旧接口', async () => {
    const { credentialsApi } = await import('./credentials');

    mocks.get.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 50,
      provider_facets: [{ provider: 'codex', count: 0 }],
    });

    const result = await credentialsApi.list({ page: 1, pageSize: 50 });

    expect(result.platformBacked).toBe(true);
    expect(result.files).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.providerFacets).toEqual({ codex: 0 });
    expect(mocks.get).toHaveBeenCalledWith('/v2/credentials', {
      params: {
        page: 1,
        page_size: 50,
        search: '',
        provider: '',
        status: '',
        activity: '',
        sort: '',
      },
    });
  });

  it('平台列表失败时直接抛错，不再回退旧凭证接口', async () => {
    const { credentialsApi } = await import('./credentials');

    mocks.get.mockRejectedValue(new Error('platform unavailable'));

    await expect(credentialsApi.list()).rejects.toThrow('platform unavailable');
    expect(mocks.get).toHaveBeenCalledWith('/v2/credentials', {
      params: {
        page: 1,
        page_size: 500,
        search: '',
        provider: '',
        status: '',
        activity: '',
        sort: '',
      },
    });
  });

  it('平台凭证读取支持模型时使用 credential id，避免同名文件串档', async () => {
    const { credentialsApi } = await import('./credentials');

    mocks.get.mockResolvedValue({ models: [{ id: 'gpt-4.1' }] });

    const result = await credentialsApi.getModelsForCredential({
      id: 'cred-1',
      name: 'shared-name.json',
      runtimeId: 'auth-a',
      platformBacked: true,
    });

    expect(result).toEqual([{ id: 'gpt-4.1' }]);
    expect(mocks.get).toHaveBeenCalledWith('/v2/credentials/cred-1/models');
  });

  it('平台模式上传、保存、禁用、删除都走 v2 credentials', async () => {
    const { credentialsApi } = await import('./credentials');

    mocks.postForm.mockResolvedValue({
      status: 'ok',
      credential_id: 'cred-1',
      credential_name: 'demo.json',
    });
    mocks.put.mockResolvedValue({ status: 'ok' });
    mocks.patch.mockResolvedValue({ status: 'ok', disabled: true });
    mocks.del.mockResolvedValue({ status: 'ok' });

    const file = new File(['{"type":"codex"}'], 'demo.json', { type: 'application/json' });
    await credentialsApi.upload(file);
    await credentialsApi.saveText(
      { id: 'cred-1', name: 'demo.json', platformBacked: true },
      '{"type":"codex"}'
    );
    const status = await credentialsApi.setStatus(
      { id: 'cred-1', name: 'demo.json', platformBacked: true },
      true
    );
    await credentialsApi.deleteFile({ id: 'cred-1', name: 'demo.json', platformBacked: true });

    expect(mocks.postForm).toHaveBeenCalledWith('/v2/credentials/import', expect.any(FormData));
    expect(mocks.put).toHaveBeenCalledWith('/v2/credentials/cred-1/content', '{"type":"codex"}', {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    expect(mocks.patch).toHaveBeenCalledWith('/v2/credentials/cred-1/status', {
      disabled: true,
    });
    expect(status).toEqual({ status: 'ok', disabled: true });
    expect(mocks.del).toHaveBeenCalledWith('/v2/credentials/cred-1');
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
