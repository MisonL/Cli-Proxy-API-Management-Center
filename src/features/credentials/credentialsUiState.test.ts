import { beforeEach, describe, expect, it } from 'vitest';
import { readCredentialsUiState, writeCredentialsUiState } from './credentialsUiState';

describe('credentials uiState', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('读写扩展筛选状态', () => {
    writeCredentialsUiState({
      filter: 'codex',
      problemOnly: true,
      search: 'alpha',
      statusFilter: 'warning',
      activityFilter: '7d',
      sortBy: 'failure-desc',
      viewMode: 'diagram',
      page: 3,
      pageSize: 24,
    });

    expect(readCredentialsUiState()).toEqual({
      filter: 'codex',
      problemOnly: true,
      search: 'alpha',
      statusFilter: 'warning',
      activityFilter: '7d',
      sortBy: 'failure-desc',
      viewMode: 'diagram',
      page: 3,
      pageSize: 24,
    });
  });

  it('对损坏存储安全回退', () => {
    window.sessionStorage.setItem('credentialsPage.uiState', '{');

    expect(readCredentialsUiState()).toBeNull();
  });
});
