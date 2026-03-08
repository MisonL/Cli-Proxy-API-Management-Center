export interface UsageImportPreview {
  fileName: string;
  payload: unknown;
  version: number | null;
  exportedAt: string;
  totalRequests: number;
  failureCount: number;
  totalTokens: number;
  apiCount: number;
  modelCount: number;
}

const resolveUsageRecord = (payload: unknown): Record<string, unknown> | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  return record.usage && typeof record.usage === 'object'
    ? (record.usage as Record<string, unknown>)
    : null;
};

export const buildUsageImportPreview = (
  fileName: string,
  payload: unknown
): UsageImportPreview | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const usageRecord = resolveUsageRecord(payload);
  if (!usageRecord) {
    return null;
  }

  const apis =
    usageRecord.apis && typeof usageRecord.apis === 'object'
      ? (usageRecord.apis as Record<string, unknown>)
      : {};
  const modelIds = new Set<string>();

  Object.values(apis).forEach((apiEntry) => {
    if (!apiEntry || typeof apiEntry !== 'object') return;
    const models = (apiEntry as Record<string, unknown>).models;
    if (!models || typeof models !== 'object') return;
    Object.keys(models as Record<string, unknown>).forEach((modelId) => {
      if (modelId.trim()) {
        modelIds.add(modelId);
      }
    });
  });

  return {
    fileName,
    payload,
    version: typeof record.version === 'number' ? record.version : null,
    exportedAt: typeof record.exported_at === 'string' ? record.exported_at : '',
    totalRequests: typeof usageRecord.total_requests === 'number' ? usageRecord.total_requests : 0,
    failureCount: typeof usageRecord.failure_count === 'number' ? usageRecord.failure_count : 0,
    totalTokens: typeof usageRecord.total_tokens === 'number' ? usageRecord.total_tokens : 0,
    apiCount: Object.keys(apis).length,
    modelCount: modelIds.size,
  };
};

export const buildUsageExportFilename = (exportedAt?: string): string => {
  const exportedDate = exportedAt ? new Date(exportedAt) : new Date();
  const safeTimestamp = Number.isNaN(exportedDate.getTime())
    ? new Date().toISOString()
    : exportedDate.toISOString();
  return `usage-export-${safeTimestamp.replace(/[:.]/g, '-')}.json`;
};
