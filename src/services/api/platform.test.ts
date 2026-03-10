import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('./client', () => ({
  apiClient: {
    get: mocks.get,
    post: mocks.post,
    put: mocks.put,
  },
}));

describe('platformApi.getHistogramBucketItems', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.get.mockReset();
  });

  it('调用 v2 histogram-bucket-items 并透传参数', async () => {
    const { platformApi } = await import('./platform');

    mocks.get.mockResolvedValue({
      provider: 'codex',
      dataset_id: 'quota-5',
      bucket_index: 0,
      total: 0,
      page: 2,
      page_size: 100,
      items: [],
      generated_at: '2026-03-10T00:00:00Z',
    });

    await platformApi.getHistogramBucketItems('codex', 'quota-5', 0, { page: 2, pageSize: 100 });

    expect(mocks.get).toHaveBeenCalledWith('/v2/providers/codex/histogram-bucket-items', {
      params: {
        dataset_id: 'quota-5',
        bucket_index: 0,
        page: 2,
        page_size: 100,
      },
    });
  });
});

