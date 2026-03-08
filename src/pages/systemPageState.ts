import type { TFunction } from 'i18next';
import type { SelfCheckItem, SelfCheckStatus } from '@/types';

export type ModelStatusState = {
  type: 'success' | 'warning' | 'error' | 'muted';
  message: string;
};

export const LOGIN_STORAGE_KEYS = ['isLoggedIn', 'apiBase', 'apiUrl', 'managementKey'] as const;

export const getSystemSelfCheckTone = (
  status: SelfCheckStatus
): 'success' | 'warning' | 'error' => {
  if (status === 'error') return 'error';
  if (status === 'warn') return 'warning';
  return 'success';
};

export const normalizeSelfChecks = (input: unknown): SelfCheckItem[] =>
  Array.isArray(input) ? (input as SelfCheckItem[]) : [];

export const buildSystemModelStatus = (
  t: TFunction,
  mode: 'loading' | 'empty' | 'success' | 'error' | 'connection-required',
  options?: { count?: number; message?: string }
): ModelStatusState => {
  if (mode === 'connection-required') {
    return {
      type: 'warning',
      message: t('notification.connection_required'),
    };
  }

  if (mode === 'loading') {
    return {
      type: 'muted',
      message: t('system_info.models_loading'),
    };
  }

  if (mode === 'empty') {
    return {
      type: 'warning',
      message: t('system_info.models_empty'),
    };
  }

  if (mode === 'success') {
    return {
      type: 'success',
      message: t('system_info.models_count', { count: options?.count ?? 0 }),
    };
  }

  const suffix = options?.message ? `: ${options.message}` : '';
  return {
    type: 'error',
    message: `${t('system_info.models_error')}${suffix}`,
  };
};

export const normalizeSystemErrorMessage = (error: unknown, fallback = ''): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return fallback;
};
