import { describe, expect, it, vi } from 'vitest';
import { createCredentialsBatchArchive } from './batchDownload';

describe('createCredentialsBatchArchive', () => {
  it('部分成功时返回压缩包和失败明细', async () => {
    const file = vi.fn();
    const generateAsync = vi.fn(async () => new Blob(['zip']));

    const result = await createCredentialsBatchArchive(
      [
        { archiveName: 'a.json', label: 'a.json', target: 'a.json' },
        { archiveName: 'b.json', label: 'b.json', target: 'b.json' },
        { archiveName: 'a.json', label: 'a.json', target: 'a.json#2' },
      ],
      async (target) => {
        if (target === 'b.json') {
          throw new Error('permission denied');
        }
        return `content:${target}`;
      },
      () => ({ file, generateAsync })
    );

    expect(file).toHaveBeenCalledTimes(2);
    expect(file).toHaveBeenCalledWith('a.json', 'content:a.json');
    expect(file).toHaveBeenCalledWith('a (2).json', 'content:a.json#2');
    expect(generateAsync).toHaveBeenCalledOnce();
    expect(result.archive).toBeInstanceOf(Blob);
    expect(result.feedback).toEqual({
      successCount: 2,
      totalCount: 3,
      failures: [{ name: 'b.json', message: 'permission denied' }],
    });
  });

  it('全部失败时不生成压缩包', async () => {
    const generateAsync = vi.fn(async () => new Blob(['zip']));

    const result = await createCredentialsBatchArchive(
      [{ archiveName: 'a.json', label: 'a.json', target: 'a.json' }],
      async () => {
        throw 'network timeout';
      },
      () => ({ file: vi.fn(), generateAsync })
    );

    expect(generateAsync).not.toHaveBeenCalled();
    expect(result.archive).toBeNull();
    expect(result.feedback).toEqual({
      successCount: 0,
      totalCount: 1,
      failures: [{ name: 'a.json', message: 'network timeout' }],
    });
  });

  it('支持进度回调与并发下载', async () => {
    const file = vi.fn();
    const generateAsync = vi.fn(async () => new Blob(['zip']));
    const onProgress = vi.fn();

    const result = await createCredentialsBatchArchive(
      [
        { archiveName: 'a.json', label: 'a.json', target: 'a.json' },
        { archiveName: 'b.json', label: 'b.json', target: 'b.json' },
      ],
      async (target) => `content:${target}`,
      () => ({ file, generateAsync }),
      { onProgress, concurrency: 2 }
    );

    expect(onProgress).toHaveBeenCalled();
    const lastProgress = onProgress.mock.calls[onProgress.mock.calls.length - 1]?.[0];
    expect(lastProgress).toMatchObject({ completed: 2, total: 2, successCount: 2, failureCount: 0 });
    expect(result.archive).toBeInstanceOf(Blob);
  });
});
