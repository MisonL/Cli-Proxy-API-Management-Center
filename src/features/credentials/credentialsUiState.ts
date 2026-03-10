export type CredentialsUiState = {
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

const CREDENTIALS_UI_STATE_KEY = 'credentialsPage.uiState';

export const readCredentialsUiState = (): CredentialsUiState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CREDENTIALS_UI_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CredentialsUiState;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const writeCredentialsUiState = (state: CredentialsUiState) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(CREDENTIALS_UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
};
