import { describe, expect, it, vi } from 'vitest';
import { createAuthFilesBatchArchive } from './batchDownload';

describe('createAuthFilesBatchArchive', () => {
  it('部分成功时返回压缩包和失败明细', async () => {
    const file = vi.fn();
    const generateAsync = vi.fn(async () => new Blob(['zip']));

    const result = await createAuthFilesBatchArchive(
      ['a.json', 'b.json', 'a.json'],
      async (name) => {
        if (name === 'b.json') {
          throw new Error('permission denied');
        }
        return `content:${name}`;
      },
      () => ({ file, generateAsync })
    );

    expect(file).toHaveBeenCalledTimes(1);
    expect(file).toHaveBeenCalledWith('a.json', 'content:a.json');
    expect(generateAsync).toHaveBeenCalledOnce();
    expect(result.archive).toBeInstanceOf(Blob);
    expect(result.feedback).toEqual({
      successCount: 1,
      totalCount: 2,
      failures: [{ name: 'b.json', message: 'permission denied' }],
    });
  });

  it('全部失败时不生成压缩包', async () => {
    const generateAsync = vi.fn(async () => new Blob(['zip']));

    const result = await createAuthFilesBatchArchive(
      ['a.json'],
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
});
