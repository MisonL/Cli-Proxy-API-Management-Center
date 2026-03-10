import { useCallback, useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  credentialsApi,
  isCredentialInvalidJsonObjectError,
  type CredentialsListParams,
} from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { CredentialItem } from '@/types';
import { formatFileSize } from '@/utils/format';
import { MAX_CREDENTIAL_SIZE } from '@/utils/constants';
import { downloadBlob } from '@/utils/download';
import {
  getCredentialStableKey,
  getTypeLabel,
  hasCredentialStatusMessage,
  isRuntimeOnlyCredential,
} from '@/features/credentials/constants';
import { createCredentialsBatchArchive } from '@/features/credentials/batchDownload';
import {
  buildCredentialsActionFeedback,
  collectCredentialsSettledOutcome,
  normalizeCredentialsActionError,
  type CredentialsActionFailure,
  type CredentialsActionFeedback,
} from '@/features/credentials/actionFeedback';

type DeleteAllOptions = {
  filter: string;
  problemOnly: boolean;
  onResetFilterToAll: () => void;
  onResetProblemOnly: () => void;
};

export type UseCredentialsDataResult = {
  files: CredentialItem[];
  platformBacked: boolean;
  totalFiles: number;
  providerFacets: Record<string, number>;
  selectedFiles: Set<string>;
  selectionCount: number;
  loading: boolean;
  error: string;
  uploading: boolean;
  deleting: string | null;
  deletingAll: boolean;
  statusUpdating: Record<string, boolean>;
  batchDownloading: boolean;
  actionResult: CredentialsActionFeedback | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  loadFiles: () => Promise<boolean>;
  handleUploadClick: () => void;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDelete: (file: CredentialItem) => void;
  handleDeleteAll: (options: DeleteAllOptions) => void;
  handleDownload: (file: CredentialItem) => Promise<void>;
  handleStatusToggle: (item: CredentialItem, enabled: boolean) => Promise<void>;
  toggleSelect: (name: string) => void;
  selectAllVisible: (visibleFiles: CredentialItem[]) => void;
  deselectAll: () => void;
  batchSetStatus: (names: string[], enabled: boolean) => Promise<void>;
  batchDelete: (names: string[]) => void;
  batchDownload: (names: string[]) => Promise<void>;
  closeActionResult: () => void;
};

export type UseCredentialsDataOptions = {
  refreshKeyStats: () => Promise<void>;
  query?: CredentialsListParams;
  onPageChange?: (page: number) => void;
};

export function useCredentialsData(options: UseCredentialsDataOptions): UseCredentialsDataResult {
  const { refreshKeyStats, query, onPageChange } = options;
  const { t } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();

  const [files, setFiles] = useState<CredentialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({});
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [actionResult, setActionResult] = useState<CredentialsActionFeedback | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [platformBacked, setPlatformBacked] = useState(false);
  const [totalFiles, setTotalFiles] = useState(0);
  const [providerFacets, setProviderFacets] = useState<Record<string, number>>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectionCount = selectedFiles.size;

  const resolveStatusUpdateErrorMessage = useCallback(
    (err: unknown) => {
      if (isCredentialInvalidJsonObjectError(err)) {
        return t('credentials.prefix_proxy_invalid_json');
      }
      return normalizeCredentialsActionError(err, t);
    },
    [t]
  );

  const openActionResult = useCallback((result: CredentialsActionFeedback | null) => {
    setActionResult(result);
  }, []);

  const toggleSelect = useCallback((name: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const selectAllVisible = useCallback((visibleFiles: CredentialItem[]) => {
    const nextSelected = visibleFiles
      .filter((file) => !isRuntimeOnlyCredential(file))
      .map((file) => getCredentialStableKey(file));
    setSelectedFiles(new Set(nextSelected));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedFiles(new Set());
  }, []);

  useEffect(() => {
    if (selectedFiles.size === 0) return;
    const existingNames = new Set(files.map((file) => getCredentialStableKey(file)));
    setSelectedFiles((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((name) => {
        if (existingNames.has(name)) {
          next.add(name);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [files, selectedFiles.size]);

  const listAllPlatformFiles = useCallback(async (): Promise<CredentialItem[]> => {
    const pageSize = 200;
    const firstPage = await credentialsApi.list({
      ...query,
      page: 1,
      pageSize,
    });
    const allFiles = [...(firstPage.files ?? [])];
    const total = Number(firstPage.total ?? allFiles.length);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    for (let page = 2; page <= totalPages; page += 1) {
      const nextPage = await credentialsApi.list({
        ...query,
        page,
        pageSize,
      });
      allFiles.push(...(nextPage.files ?? []));
    }

    return allFiles;
  }, [query]);

  const resolveMutationTarget = useCallback(
    (stableKey: string): CredentialItem => {
      const matched = files.find((file) => getCredentialStableKey(file) === stableKey);
      if (!matched) {
        throw new Error(`PLATFORM_CREDENTIAL_NOT_FOUND:${stableKey}`);
      }
      return matched;
    },
    [files]
  );

  const loadFiles = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError('');
    try {
      const data = await credentialsApi.list(query);
      setFiles(data?.files || []);
      setTotalFiles(Number(data?.total ?? data?.files?.length ?? 0));
      setProviderFacets(data?.providerFacets ?? {});
      const isPlatformBacked = data?.platformBacked === true;
      setPlatformBacked(isPlatformBacked);
      return isPlatformBacked;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setFiles([]);
      setTotalFiles(0);
      setPlatformBacked(false);
      setError(errorMessage);
      setProviderFacets({});
      return false;
    } finally {
      setLoading(false);
    }
  }, [query, t]);

  const reloadCurrentQuery = useCallback(
    async (options: { deletedCount?: number } = {}) => {
      if (!platformBacked) {
        await loadFiles();
        return;
      }

      const currentPage = query?.page ?? 1;
      const currentPageSize = query?.pageSize ?? 50;
      const nextTotal = Math.max(0, totalFiles - (options.deletedCount ?? 0));
      const nextPage = Math.min(currentPage, Math.max(1, Math.ceil(nextTotal / currentPageSize)));

      if (nextPage !== currentPage) {
        onPageChange?.(nextPage);
        return;
      }

      await loadFiles();
    },
    [loadFiles, onPageChange, platformBacked, query?.page, query?.pageSize, totalFiles]
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const fileList = event.target.files;
      if (!fileList || fileList.length === 0) return;

      const filesToUpload = Array.from(fileList);
      const validFiles: File[] = [];
      const invalidFiles: string[] = [];
      const oversizedFiles: string[] = [];

      filesToUpload.forEach((file) => {
        if (!file.name.endsWith('.json')) {
          invalidFiles.push(file.name);
          return;
        }
        if (file.size > MAX_CREDENTIAL_SIZE) {
          oversizedFiles.push(file.name);
          return;
        }
        validFiles.push(file);
      });

      setUploading(true);
      setActionResult(null);

      let successCount = 0;
      const failures: CredentialsActionFailure[] = [
        ...invalidFiles.map((name) => ({
          name,
          message: t('credentials.upload_error_json'),
        })),
        ...oversizedFiles.map((name) => ({
          name,
          message: t('credentials.upload_error_size', {
            maxSize: formatFileSize(MAX_CREDENTIAL_SIZE),
          }),
        })),
      ];

      for (const file of validFiles) {
        try {
          await credentialsApi.upload(file);
          successCount += 1;
        } catch (err: unknown) {
          failures.push({
            name: file.name,
            message: normalizeCredentialsActionError(err, t),
          });
        }
      }

      if (successCount > 0) {
        await reloadCurrentQuery();
        if (!platformBacked) {
          await refreshKeyStats();
        }
      }

      if (failures.length > 0) {
        openActionResult(
          buildCredentialsActionFeedback('upload', filesToUpload.length, successCount, failures)
        );
        showNotification(
          successCount > 0
            ? t('credentials.upload_partial', {
                success: successCount,
                failed: failures.length,
              })
            : t('notification.upload_failed'),
          successCount > 0 ? 'warning' : 'error'
        );
      } else if (successCount > 0) {
        const suffix = filesToUpload.length > 1 ? ` (${successCount}/${filesToUpload.length})` : '';
        showNotification(`${t('credentials.upload_success')}${suffix}`, 'success');
      }

      setUploading(false);
      event.target.value = '';
    },
    [openActionResult, platformBacked, refreshKeyStats, reloadCurrentQuery, showNotification, t]
  );

  const handleDelete = useCallback(
    (file: CredentialItem) => {
      const stableKey = getCredentialStableKey(file);
      showConfirmation({
        title: t('credentials.delete_title', { defaultValue: 'Delete File' }),
        message: `${t('credentials.delete_confirm')} "${file.name}" ?`,
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          setDeleting(stableKey);
          try {
            await credentialsApi.deleteFile(resolveMutationTarget(stableKey));
            showNotification(t('credentials.delete_success'), 'success');
            if (platformBacked) {
              setSelectedFiles((prev) => {
                if (!prev.has(stableKey)) return prev;
                const next = new Set(prev);
                next.delete(stableKey);
                return next;
              });
              await reloadCurrentQuery({ deletedCount: 1 });
            } else {
              setFiles((prev) => prev.filter((item) => getCredentialStableKey(item) !== stableKey));
              setSelectedFiles((prev) => {
                if (!prev.has(stableKey)) return prev;
                const next = new Set(prev);
                next.delete(stableKey);
                return next;
              });
            }
          } catch (err: unknown) {
            const errorMessage = normalizeCredentialsActionError(err, t);
            showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
          } finally {
            setDeleting(null);
          }
        },
      });
    },
    [
      platformBacked,
      reloadCurrentQuery,
      resolveMutationTarget,
      showConfirmation,
      showNotification,
      t,
    ]
  );

  const handleDeleteAll = useCallback(
    (deleteAllOptions: DeleteAllOptions) => {
      const { filter, problemOnly, onResetFilterToAll, onResetProblemOnly } = deleteAllOptions;
      const isFiltered = filter !== 'all';
      const isProblemOnly = problemOnly === true;
      const typeLabel = isFiltered ? getTypeLabel(t, filter) : t('credentials.filter_all');
      const confirmMessage = isProblemOnly
        ? isFiltered
          ? t('credentials.delete_problem_filtered_confirm', { type: typeLabel })
          : t('credentials.delete_problem_confirm')
        : isFiltered
          ? t('credentials.delete_filtered_confirm', { type: typeLabel })
          : t('credentials.delete_all_confirm');

      showConfirmation({
        title: t('credentials.delete_all_title', { defaultValue: 'Delete All Files' }),
        message: confirmMessage,
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          setDeletingAll(true);
          try {
            if (platformBacked) {
              const filesToDelete = await listAllPlatformFiles();
              if (filesToDelete.length === 0) {
                const emptyMessage = isProblemOnly
                  ? isFiltered
                    ? t('credentials.delete_problem_filtered_none', { type: typeLabel })
                    : t('credentials.delete_problem_none')
                  : isFiltered
                    ? t('credentials.delete_filtered_none', { type: typeLabel })
                    : t('credentials.search_empty_desc');
                showNotification(emptyMessage, 'info');
                setDeletingAll(false);
                return;
              }

              let success = 0;
              let failed = 0;
              for (const file of filesToDelete) {
                try {
                  await credentialsApi.deleteFile(file);
                  success += 1;
                } catch {
                  failed += 1;
                }
              }

              deselectAll();
              if (success > 0) {
                await reloadCurrentQuery({ deletedCount: success });
              }
              if (failed === 0) {
                showNotification(
                  !isFiltered && !isProblemOnly
                    ? t('credentials.delete_all_success')
                    : isProblemOnly
                      ? isFiltered
                        ? t('credentials.delete_problem_filtered_success', {
                            count: success,
                            type: typeLabel,
                          })
                        : t('credentials.delete_problem_success', { count: success })
                      : t('credentials.delete_filtered_success', {
                          count: success,
                          type: typeLabel,
                        }),
                  'success'
                );
              } else {
                showNotification(
                  isProblemOnly
                    ? isFiltered
                      ? t('credentials.delete_problem_filtered_partial', {
                          success,
                          failed,
                          type: typeLabel,
                        })
                      : t('credentials.delete_problem_partial', { success, failed })
                    : t('credentials.delete_filtered_partial', { success, failed, type: typeLabel }),
                  'warning'
                );
              }
              if (isFiltered) {
                onResetFilterToAll();
              }
              if (isProblemOnly) {
                onResetProblemOnly();
              }
            } else if (!isFiltered && !isProblemOnly) {
              await credentialsApi.deleteAll();
              showNotification(t('credentials.delete_all_success'), 'success');
              setFiles((prev) => prev.filter((file) => isRuntimeOnlyCredential(file)));
              deselectAll();
            } else {
              const filesToDelete = files.filter((file) => {
                if (isRuntimeOnlyCredential(file)) return false;
                if (isFiltered && file.type !== filter) return false;
                if (isProblemOnly && !hasCredentialStatusMessage(file)) return false;
                return true;
              });

              if (filesToDelete.length === 0) {
                const emptyMessage = isProblemOnly
                  ? isFiltered
                    ? t('credentials.delete_problem_filtered_none', { type: typeLabel })
                    : t('credentials.delete_problem_none')
                  : t('credentials.delete_filtered_none', { type: typeLabel });
                showNotification(emptyMessage, 'info');
                setDeletingAll(false);
                return;
              }

              let success = 0;
              let failed = 0;
              const deletedNames: string[] = [];

              for (const file of filesToDelete) {
                try {
                  await credentialsApi.deleteFile(file);
                  success += 1;
                  deletedNames.push(file.name);
                } catch {
                  failed += 1;
                }
              }

              setFiles((prev) => prev.filter((f) => !deletedNames.includes(f.name)));
              setSelectedFiles((prev) => {
                if (prev.size === 0) return prev;
                const deletedSet = new Set(deletedNames);
                let changed = false;
                const next = new Set<string>();
                prev.forEach((name) => {
                  if (deletedSet.has(name)) {
                    changed = true;
                  } else {
                    next.add(name);
                  }
                });
                return changed ? next : prev;
              });

              if (failed === 0 && isProblemOnly) {
                showNotification(
                  isFiltered
                    ? t('credentials.delete_problem_filtered_success', {
                        count: success,
                        type: typeLabel,
                      })
                    : t('credentials.delete_problem_success', { count: success }),
                  'success'
                );
              } else if (failed === 0) {
                showNotification(
                  t('credentials.delete_filtered_success', { count: success, type: typeLabel }),
                  'success'
                );
              } else if (isProblemOnly) {
                showNotification(
                  isFiltered
                    ? t('credentials.delete_problem_filtered_partial', {
                        success,
                        failed,
                        type: typeLabel,
                      })
                    : t('credentials.delete_problem_partial', { success, failed }),
                  'warning'
                );
              } else {
                showNotification(
                  t('credentials.delete_filtered_partial', { success, failed, type: typeLabel }),
                  'warning'
                );
              }

              if (isFiltered) {
                onResetFilterToAll();
              }
              if (isProblemOnly) {
                onResetProblemOnly();
              }
            }
          } catch (err: unknown) {
            const errorMessage = normalizeCredentialsActionError(err, t);
            showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
          } finally {
            setDeletingAll(false);
          }
        },
      });
    },
    [
      deselectAll,
      files,
      listAllPlatformFiles,
      platformBacked,
      reloadCurrentQuery,
      showConfirmation,
      showNotification,
      t,
    ]
  );

  const handleDownload = useCallback(
    async (file: CredentialItem) => {
      try {
        const target = resolveMutationTarget(getCredentialStableKey(file));
        const text = await credentialsApi.downloadText(target);
        const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
        downloadBlob({ filename: file.name, blob });
        showNotification(t('credentials.download_success'), 'success');
      } catch (err: unknown) {
        const errorMessage = normalizeCredentialsActionError(err, t);
        showNotification(`${t('notification.download_failed')}: ${errorMessage}`, 'error');
      }
    },
    [resolveMutationTarget, showNotification, t]
  );

  const handleStatusToggle = useCallback(
    async (item: CredentialItem, enabled: boolean) => {
      const name = item.name;
      const stableKey = getCredentialStableKey(item);
      const nextDisabled = !enabled;
      const previousDisabled = item.disabled === true;

      setStatusUpdating((prev) => ({ ...prev, [stableKey]: true }));
      setFiles((prev) =>
        prev.map((f) =>
          getCredentialStableKey(f) === stableKey ? { ...f, disabled: nextDisabled } : f
        )
      );

      try {
        const result = await credentialsApi.setStatus(resolveMutationTarget(stableKey), nextDisabled);
        if (platformBacked) {
          await reloadCurrentQuery();
        } else {
          setFiles((prev) =>
            prev.map((f) =>
              getCredentialStableKey(f) === stableKey ? { ...f, disabled: result.disabled } : f
            )
          );
        }
        showNotification(
          enabled
            ? t('credentials.status_enabled_success', { name })
            : t('credentials.status_disabled_success', { name }),
          'success'
        );
      } catch (err: unknown) {
        const errorMessage = resolveStatusUpdateErrorMessage(err);
        setFiles((prev) =>
          prev.map((f) =>
            getCredentialStableKey(f) === stableKey ? { ...f, disabled: previousDisabled } : f
          )
        );
        showNotification(`${t('notification.update_failed')}: ${errorMessage}`, 'error');
      } finally {
        setStatusUpdating((prev) => {
          if (!prev[stableKey]) return prev;
          const next = { ...prev };
          delete next[stableKey];
          return next;
        });
      }
    },
    [
      platformBacked,
      reloadCurrentQuery,
      resolveMutationTarget,
      resolveStatusUpdateErrorMessage,
      showNotification,
      t,
    ]
  );

  const batchSetStatus = useCallback(
    async (names: string[], enabled: boolean) => {
      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;

      const targetNames = new Set(uniqueNames);
      const displayNames = new Map(
        files.map((file) => [getCredentialStableKey(file), file.name] as const)
      );
      const nextDisabled = !enabled;
      const previousDisabled = new Map(
        files.map((file) => [getCredentialStableKey(file), file.disabled === true] as const)
      );

      setActionResult(null);
      setFiles((prev) =>
        prev.map((file) =>
          targetNames.has(getCredentialStableKey(file)) ? { ...file, disabled: nextDisabled } : file
        )
      );

      const results = await Promise.allSettled(
        uniqueNames.map((name) => credentialsApi.setStatus(resolveMutationTarget(name), nextDisabled))
      );
      const outcome = collectCredentialsSettledOutcome(uniqueNames, results, (reason) =>
        resolveStatusUpdateErrorMessage(reason)
      );
      const failedNames = new Set(outcome.failures.map((item) => item.name));
      const feedbackFailures = outcome.failures.map((item) => ({
        ...item,
        name: displayNames.get(item.name) ?? item.name,
      }));
      const confirmedDisabled = new Map<string, boolean>();
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return;
        confirmedDisabled.set(uniqueNames[index], result.value.disabled);
      });
      if (platformBacked) {
        await reloadCurrentQuery();
      } else {
        setFiles((prev) =>
          prev.map((file) => {
            const stableKey = getCredentialStableKey(file);
            if (!targetNames.has(stableKey)) return file;
            if (failedNames.has(stableKey)) {
              return { ...file, disabled: previousDisabled.get(stableKey) === true };
            }
            if (confirmedDisabled.has(stableKey)) {
              return { ...file, disabled: confirmedDisabled.get(stableKey) === true };
            }
            return file;
          })
        );
      }

      if (outcome.failures.length === 0) {
        showNotification(
          t('credentials.batch_status_success', { count: outcome.successCount }),
          'success'
        );
        deselectAll();
        return;
      }

      showNotification(
        outcome.successCount > 0
          ? t('credentials.batch_status_partial', {
              success: outcome.successCount,
              failed: outcome.failures.length,
            })
          : t('notification.update_failed'),
        outcome.successCount > 0 ? 'warning' : 'error'
      );
      openActionResult(
        buildCredentialsActionFeedback(
          enabled ? 'batch-enable' : 'batch-disable',
          outcome.totalCount,
          outcome.successCount,
          feedbackFailures
        )
      );
      setSelectedFiles(new Set(outcome.failures.map((item) => item.name)));
    },
    [
      deselectAll,
      files,
      openActionResult,
      platformBacked,
      reloadCurrentQuery,
      resolveMutationTarget,
      resolveStatusUpdateErrorMessage,
      showNotification,
      t,
    ]
  );

  const batchDelete = useCallback(
    (names: string[]) => {
      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;

      showConfirmation({
        title: t('credentials.batch_delete_title'),
        message: t('credentials.batch_delete_confirm', { count: uniqueNames.length }),
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          setActionResult(null);

          const results = await Promise.allSettled(
            uniqueNames.map((name) => credentialsApi.deleteFile(resolveMutationTarget(name)))
          );
          const outcome = collectCredentialsSettledOutcome(uniqueNames, results, (reason) =>
            normalizeCredentialsActionError(reason, t)
          );
          const displayNames = new Map(
            files.map((file) => [getCredentialStableKey(file), file.name] as const)
          );
          const feedbackFailures = outcome.failures.map((item) => ({
            ...item,
            name: displayNames.get(item.name) ?? item.name,
          }));

          if (outcome.successNames.length > 0 && platformBacked) {
            await reloadCurrentQuery({ deletedCount: outcome.successCount });
          } else if (outcome.successNames.length > 0) {
            const deletedSet = new Set(outcome.successNames);
            setFiles((prev) => prev.filter((file) => !deletedSet.has(getCredentialStableKey(file))));
          }

          if (outcome.failures.length === 0) {
            setSelectedFiles((prev) => {
              if (prev.size === 0) return prev;
              const deletedSet = new Set(outcome.successNames);
              let changed = false;
              const next = new Set<string>();
              prev.forEach((name) => {
                if (deletedSet.has(name)) {
                  changed = true;
                } else {
                  next.add(name);
                }
              });
              return changed ? next : prev;
            });
            showNotification(
              `${t('credentials.delete_all_success')} (${outcome.successCount})`,
              'success'
            );
            return;
          }

          setSelectedFiles(new Set(outcome.failures.map((item) => item.name)));
          showNotification(
            outcome.successCount > 0
              ? t('credentials.batch_delete_partial', {
                  success: outcome.successCount,
                  failed: outcome.failures.length,
                })
              : t('notification.delete_failed'),
            outcome.successCount > 0 ? 'warning' : 'error'
          );
          openActionResult(
            buildCredentialsActionFeedback(
              'batch-delete',
              outcome.totalCount,
              outcome.successCount,
              feedbackFailures
            )
          );
        },
      });
    },
    [
      files,
      openActionResult,
      platformBacked,
      reloadCurrentQuery,
      resolveMutationTarget,
      showConfirmation,
      showNotification,
      t,
    ]
  );

  const batchDownload = useCallback(
    async (names: string[]) => {
      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;

      setBatchDownloading(true);
      setActionResult(null);
      try {
        const archiveItems = uniqueNames.map((key) => {
          const file = resolveMutationTarget(key);
          return {
            archiveName: file.name,
            label: file.name,
            target: file,
          };
        });
        const { archive, feedback } = await createCredentialsBatchArchive(
          archiveItems,
          async (target) => credentialsApi.downloadText(target),
          undefined,
          { concurrency: 6 }
        );

        if (feedback.failures.length > 0) {
          openActionResult(
            buildCredentialsActionFeedback(
              'batch-download',
              feedback.totalCount,
              feedback.successCount,
              feedback.failures
            )
          );
        }

        if (!archive) {
          showNotification(t('credentials.batch_download_failed'), 'error');
          return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        downloadBlob({
          filename: `credentials-batch-${timestamp}.zip`,
          blob: archive,
        });

        if (feedback.failures.length === 0) {
          showNotification(
            t('credentials.batch_download_success', { count: feedback.totalCount }),
            'success'
          );
        } else {
          showNotification(
            t('credentials.batch_download_partial', {
              success: feedback.successCount,
              failed: feedback.failures.length,
            }),
            'warning'
          );
        }
      } catch (err: unknown) {
        const errorMessage = normalizeCredentialsActionError(err, t);
        showNotification(
          `${t('credentials.batch_download_failed')}${errorMessage ? `: ${errorMessage}` : ''}`,
          'error'
        );
      } finally {
        setBatchDownloading(false);
      }
    },
    [openActionResult, resolveMutationTarget, showNotification, t]
  );

  const closeActionResult = useCallback(() => {
    setActionResult(null);
  }, []);

  return {
    files,
    platformBacked,
    totalFiles,
    providerFacets,
    selectedFiles,
    selectionCount,
    loading,
    error,
    uploading,
    deleting,
    deletingAll,
    statusUpdating,
    batchDownloading,
    actionResult,
    fileInputRef,
    loadFiles,
    handleUploadClick,
    handleFileChange,
    handleDelete,
    handleDeleteAll,
    handleDownload,
    handleStatusToggle,
    toggleSelect,
    selectAllVisible,
    deselectAll,
    batchSetStatus,
    batchDelete,
    batchDownload,
    closeActionResult,
  };
}
