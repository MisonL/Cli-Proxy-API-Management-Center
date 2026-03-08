import { describe, expect, it } from 'vitest';
import { normalizeApiKeyList } from './apiKeys';

describe('apiKeys', () => {
  it('归一化 API key 列表并去重', () => {
    expect(
      normalizeApiKeyList([
        ' key-a ',
        { apiKey: 'key-b' },
        { 'api-key': 'key-a' },
        { Key: 'key-c' },
      ])
    ).toEqual(['key-a', 'key-b', 'key-c']);
  });
});
