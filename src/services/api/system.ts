import { apiClient } from './client';
import type { SelfCheckResponse, UsagePersistenceStatus } from '@/types';

export const systemApi = {
  getSelfCheck: () => apiClient.get<SelfCheckResponse>('/system/self-check'),
  getUsagePersistenceStatus: () =>
    apiClient.get<UsagePersistenceStatus>('/usage/persistence-status'),
};
