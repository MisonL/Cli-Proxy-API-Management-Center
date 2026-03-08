import { beforeEach, describe, expect, it } from 'vitest';
import { readAuthFilesUiState, writeAuthFilesUiState } from './uiState';

describe('authFiles uiState', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('读写扩展筛选状态', () => {
    writeAuthFilesUiState({
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

    expect(readAuthFilesUiState()).toEqual({
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
    window.sessionStorage.setItem('authFilesPage.uiState', '{');

    expect(readAuthFilesUiState()).toBeNull();
  });
});
