export type AuthFilesUiState = {
  filter?: string;
  problemOnly?: boolean;
  search?: string;
  statusFilter?: 'all' | 'healthy' | 'disabled' | 'unavailable' | 'warning' | 'quota-limited';
  activityFilter?: 'all' | '24h' | '7d';
  sortBy?: 'name' | 'modified-desc' | 'active-desc' | 'success-desc' | 'failure-desc';
  viewMode?: 'diagram' | 'list';
  page?: number;
  pageSize?: number;
};

const AUTH_FILES_UI_STATE_KEY = 'authFilesPage.uiState';

export const readAuthFilesUiState = (): AuthFilesUiState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(AUTH_FILES_UI_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthFilesUiState;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const writeAuthFilesUiState = (state: AuthFilesUiState) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(AUTH_FILES_UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
};
