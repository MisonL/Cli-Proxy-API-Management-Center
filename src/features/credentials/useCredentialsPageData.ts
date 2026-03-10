import { useMemo } from 'react';
import type { CredentialItem } from '@/types';
import { hasCredentialStatusMessage, isRuntimeOnlyCredential } from './constants';
import {
  buildCredentialActivityMap,
  buildCredentialTypeCounts,
  filterAndSortCredentials,
} from './credentialsPageData';
import type {
  CredentialsActivityFilter,
  CredentialsSortBy,
  CredentialsStatusFilter,
} from './credentialsPageData';
import type { KeyStats, UsageDetail } from '@/utils/usage';

export type CredentialsPageFilters = {
  filter: string;
  problemOnly: boolean;
  search: string;
  statusFilter: CredentialsStatusFilter;
  activityFilter: CredentialsActivityFilter;
  sortBy: CredentialsSortBy;
  page: number;
  pageSize: number;
  activityReferenceNow: number;
};

type UseCredentialsPageDataOptions = {
  files: CredentialItem[];
  selectedFiles: Set<string>;
  keyStats: KeyStats;
  usageDetails: UsageDetail[];
  filters: CredentialsPageFilters;
};

type CredentialsPageData = {
  existingTypes: string[];
  typeCounts: Record<string, number>;
  filtered: CredentialItem[];
  currentPage: number;
  totalPages: number;
  pageItems: CredentialItem[];
  selectablePageItems: CredentialItem[];
  selectedNames: string[];
};

export function useCredentialsPageData({
  files,
  selectedFiles,
  keyStats,
  usageDetails,
  filters,
}: UseCredentialsPageDataOptions): CredentialsPageData {
  const {
    filter,
    problemOnly,
    search,
    statusFilter,
    activityFilter,
    sortBy,
    page,
    pageSize,
    activityReferenceNow,
  } = filters;

  const existingTypes = useMemo(() => {
    const types = new Set<string>(['all']);
    files.forEach((file) => {
      if (file.type) {
        types.add(file.type);
      }
    });
    return Array.from(types);
  }, [files]);

  const filesMatchingProblemFilter = useMemo(
    () => (problemOnly ? files.filter(hasCredentialStatusMessage) : files),
    [files, problemOnly]
  );

  const fileActivity = useMemo(() => buildCredentialActivityMap(usageDetails), [usageDetails]);

  const typeCounts = useMemo(
    () => buildCredentialTypeCounts(filesMatchingProblemFilter),
    [filesMatchingProblemFilter]
  );

  const filtered = useMemo(
    () =>
      filterAndSortCredentials({
        files: filesMatchingProblemFilter,
        filter,
        search,
        statusFilter,
        activityFilter,
        sortBy,
        activityReferenceNow,
        fileActivity,
        keyStats,
      }),
    [
      activityFilter,
      activityReferenceNow,
      fileActivity,
      filesMatchingProblemFilter,
      filter,
      keyStats,
      search,
      sortBy,
      statusFilter,
    ]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;

  const pageItems = useMemo(
    () => filtered.slice(start, start + pageSize),
    [filtered, start, pageSize]
  );
  const selectablePageItems = useMemo(
    () => pageItems.filter((file) => !isRuntimeOnlyCredential(file)),
    [pageItems]
  );
  const selectedNames = Array.from(selectedFiles);

  return {
    existingTypes,
    typeCounts,
    filtered,
    currentPage,
    totalPages,
    pageItems,
    selectablePageItems,
    selectedNames,
  };
}
