import type { AuthFileItem } from '@/types/authFile';
import type { AnalyticsHistogramDataset } from './quotaAnalytics';

export type SelectedQuotaBucketState = {
  datasetId: string;
  datasetLabel: string;
  bucketIndex: number;
  bucketLabel: string;
  items: Array<{
    fileName: string;
    remainingPercent: number;
    resetAt?: string;
    file?: AuthFileItem;
  }>;
};

export const sanitizeHiddenDatasetIds = (
  hiddenDatasetIds: string[],
  datasets: AnalyticsHistogramDataset[]
) => {
  if (datasets.length <= 1) return [];

  const validIds = new Set(datasets.map((dataset) => dataset.id));
  const next = hiddenDatasetIds.filter((id) => validIds.has(id));
  return next.length >= datasets.length ? next.slice(0, datasets.length - 1) : next;
};

export const toggleHiddenDatasetId = (
  hiddenDatasetIds: string[],
  datasetId: string,
  datasets: AnalyticsHistogramDataset[]
) => {
  if (hiddenDatasetIds.includes(datasetId)) {
    return hiddenDatasetIds.filter((id) => id !== datasetId);
  }
  if (datasets.length <= 1 || hiddenDatasetIds.length >= datasets.length - 1) {
    return hiddenDatasetIds;
  }
  return [...hiddenDatasetIds, datasetId];
};

export const getVisibleHistogramDatasets = (
  datasets: AnalyticsHistogramDataset[],
  hiddenDatasetIds: string[]
) => {
  const hiddenSet = new Set(hiddenDatasetIds);
  const visible = datasets.filter((dataset) => !hiddenSet.has(dataset.id));
  return visible.length > 0 ? visible : datasets;
};

export const buildSelectedQuotaBucketState = ({
  datasets,
  datasetIndex,
  bucketIndex,
  histogramLabels,
  fileMap,
}: {
  datasets: AnalyticsHistogramDataset[];
  datasetIndex: number;
  bucketIndex: number;
  histogramLabels: string[];
  fileMap: Map<string, AuthFileItem>;
}): SelectedQuotaBucketState | null => {
  const dataset = datasets[datasetIndex];
  if (!dataset) return null;

  return {
    datasetId: dataset.id,
    datasetLabel: dataset.label,
    bucketIndex,
    bucketLabel: histogramLabels[bucketIndex] ?? '',
    items:
      dataset.bucketItems[bucketIndex]?.map((item) => ({
        ...item,
        file: fileMap.get(item.fileName),
      })) ?? [],
  };
};
