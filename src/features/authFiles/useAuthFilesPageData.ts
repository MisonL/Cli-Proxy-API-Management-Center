import { useMemo } from 'react';
import type { AuthFileItem } from '@/types';
import { hasAuthFileStatusMessage, isRuntimeOnlyAuthFile } from './constants';
import {
  buildAuthFileActivityMap,
  buildAuthFileTypeCounts,
  filterAndSortAuthFiles,
} from './authFilesPageData';
import type {
  AuthFilesActivityFilter,
  AuthFilesSortBy,
  AuthFilesStatusFilter,
} from './authFilesPageData';
import type { KeyStats, UsageDetail } from '@/utils/usage';

export type AuthFilesPageFilters = {
  filter: string;
  problemOnly: boolean;
  search: string;
  statusFilter: AuthFilesStatusFilter;
  activityFilter: AuthFilesActivityFilter;
  sortBy: AuthFilesSortBy;
  page: number;
  pageSize: number;
  activityReferenceNow: number;
};

type UseAuthFilesPageDataOptions = {
  files: AuthFileItem[];
  selectedFiles: Set<string>;
  keyStats: KeyStats;
  usageDetails: UsageDetail[];
  filters: AuthFilesPageFilters;
};

type AuthFilesPageData = {
  existingTypes: string[];
  typeCounts: Record<string, number>;
  filtered: AuthFileItem[];
  currentPage: number;
  totalPages: number;
  pageItems: AuthFileItem[];
  selectablePageItems: AuthFileItem[];
  selectedNames: string[];
};

export function useAuthFilesPageData({
  files,
  selectedFiles,
  keyStats,
  usageDetails,
  filters,
}: UseAuthFilesPageDataOptions): AuthFilesPageData {
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
    () => (problemOnly ? files.filter(hasAuthFileStatusMessage) : files),
    [files, problemOnly]
  );

  const fileActivity = useMemo(() => buildAuthFileActivityMap(usageDetails), [usageDetails]);

  const typeCounts = useMemo(
    () => buildAuthFileTypeCounts(filesMatchingProblemFilter),
    [filesMatchingProblemFilter]
  );

  const filtered = useMemo(
    () =>
      filterAndSortAuthFiles({
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
    () => pageItems.filter((file) => !isRuntimeOnlyAuthFile(file)),
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
