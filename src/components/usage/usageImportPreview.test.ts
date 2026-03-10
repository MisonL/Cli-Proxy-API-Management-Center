import { describe, expect, it } from 'vitest';
import { buildUsageExportFilename, buildUsageImportPreview } from './usageImportPreview';

describe('usageImportPreview', () => {
  it('从 usage 导出快照里提取预览信息', () => {
    const preview = buildUsageImportPreview('usage.json', {
      version: 2,
      exported_at: '2026-03-08T10:00:00.000Z',
      usage: {
        total_requests: 12,
        failure_count: 3,
        total_tokens: 456,
        apis: {
          claude: {
            models: {
              'claude-3-7-sonnet': {},
              'claude-3-5-haiku': {},
            },
          },
          codex: {
            models: {
              'gpt-5-codex': {},
            },
          },
        },
      },
    });

    expect(preview).toEqual({
      fileName: 'usage.json',
      payload: expect.any(Object),
      version: 2,
      exportedAt: '2026-03-08T10:00:00.000Z',
      totalRequests: 12,
      failureCount: 3,
      totalTokens: 456,
      apiCount: 2,
      modelCount: 3,
    });
  });

  it('对无效快照返回 null，并生成稳定文件名', () => {
    expect(buildUsageImportPreview('broken.json', { foo: 'bar' })).toBeNull();
    expect(buildUsageExportFilename('invalid')).toMatch(/^usage-export-.*\.json$/);
  });
});
