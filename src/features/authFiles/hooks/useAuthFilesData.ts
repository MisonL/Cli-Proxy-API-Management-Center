import { useCallback, useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi, isAuthFileInvalidJsonObjectError } from '@/services/api';
import { apiClient } from '@/services/api/client';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { formatFileSize } from '@/utils/format';
import { MAX_AUTH_FILE_SIZE } from '@/utils/constants';
import { downloadBlob } from '@/utils/download';
import {
  getTypeLabel,
  hasAuthFileStatusMessage,
  isRuntimeOnlyAuthFile,
} from '@/features/authFiles/constants';
import { createAuthFilesBatchArchive } from '@/features/authFiles/batchDownload';
import {
  buildAuthFilesActionFeedback,
  collectAuthFilesSettledOutcome,
  normalizeAuthFilesActionError,
  type AuthFilesActionFailure,
  type AuthFilesActionFeedback,
} from '@/features/authFiles/actionFeedback';

type DeleteAllOptions = {
  filter: string;
  problemOnly: boolean;
  onResetFilterToAll: () => void;
  onResetProblemOnly: () => void;
};

export type UseAuthFilesDataResult = {
  files: AuthFileItem[];
  selectedFiles: Set<string>;
  selectionCount: number;
  loading: boolean;
  error: string;
  uploading: boolean;
  deleting: string | null;
  deletingAll: boolean;
  statusUpdating: Record<string, boolean>;
  batchDownloading: boolean;
  actionResult: AuthFilesActionFeedback | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  loadFiles: () => Promise<void>;
  handleUploadClick: () => void;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDelete: (name: string) => void;
  handleDeleteAll: (options: DeleteAllOptions) => void;
  handleDownload: (name: string) => Promise<void>;
  handleStatusToggle: (item: AuthFileItem, enabled: boolean) => Promise<void>;
  toggleSelect: (name: string) => void;
  selectAllVisible: (visibleFiles: AuthFileItem[]) => void;
  deselectAll: () => void;
  batchSetStatus: (names: string[], enabled: boolean) => Promise<void>;
  batchDelete: (names: string[]) => void;
  batchDownload: (names: string[]) => Promise<void>;
  closeActionResult: () => void;
};

export type UseAuthFilesDataOptions = {
  refreshKeyStats: () => Promise<void>;
};

export function useAuthFilesData(options: UseAuthFilesDataOptions): UseAuthFilesDataResult {
  const { refreshKeyStats } = options;
  const { t } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({});
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [actionResult, setActionResult] = useState<AuthFilesActionFeedback | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectionCount = selectedFiles.size;

  const resolveStatusUpdateErrorMessage = useCallback(
    (err: unknown) => {
      if (isAuthFileInvalidJsonObjectError(err)) {
        return t('auth_files.prefix_proxy_invalid_json');
      }
      return normalizeAuthFilesActionError(err, t);
    },
    [t]
  );

  const openActionResult = useCallback((result: AuthFilesActionFeedback | null) => {
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

  const selectAllVisible = useCallback((visibleFiles: AuthFileItem[]) => {
    const nextSelected = visibleFiles
      .filter((file) => !isRuntimeOnlyAuthFile(file))
      .map((file) => file.name);
    setSelectedFiles(new Set(nextSelected));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedFiles(new Set());
  }, []);

  useEffect(() => {
    if (selectedFiles.size === 0) return;
    const existingNames = new Set(files.map((file) => file.name));
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

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await authFilesApi.list();
      setFiles(data?.files || []);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [t]);

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
        if (file.size > MAX_AUTH_FILE_SIZE) {
          oversizedFiles.push(file.name);
          return;
        }
        validFiles.push(file);
      });

      setUploading(true);
      setActionResult(null);

      let successCount = 0;
      const failures: AuthFilesActionFailure[] = [
        ...invalidFiles.map((name) => ({
          name,
          message: t('auth_files.upload_error_json'),
        })),
        ...oversizedFiles.map((name) => ({
          name,
          message: t('auth_files.upload_error_size', {
            maxSize: formatFileSize(MAX_AUTH_FILE_SIZE),
          }),
        })),
      ];

      for (const file of validFiles) {
        try {
          await authFilesApi.upload(file);
          successCount += 1;
        } catch (err: unknown) {
          failures.push({
            name: file.name,
            message: normalizeAuthFilesActionError(err, t),
          });
        }
      }

      if (successCount > 0) {
        await loadFiles();
        await refreshKeyStats();
      }

      if (failures.length > 0) {
        openActionResult(
          buildAuthFilesActionFeedback('upload', filesToUpload.length, successCount, failures)
        );
        showNotification(
          successCount > 0
            ? t('auth_files.upload_partial', {
                success: successCount,
                failed: failures.length,
              })
            : t('notification.upload_failed'),
          successCount > 0 ? 'warning' : 'error'
        );
      } else if (successCount > 0) {
        const suffix =
          filesToUpload.length > 1 ? ` (${successCount}/${filesToUpload.length})` : '';
        showNotification(`${t('auth_files.upload_success')}${suffix}`, 'success');
      }

      setUploading(false);
      event.target.value = '';
    },
    [loadFiles, openActionResult, refreshKeyStats, showNotification, t]
  );

  const handleDelete = useCallback(
    (name: string) => {
      showConfirmation({
        title: t('auth_files.delete_title', { defaultValue: 'Delete File' }),
        message: `${t('auth_files.delete_confirm')} "${name}" ?`,
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          setDeleting(name);
          try {
            await authFilesApi.deleteFile(name);
            showNotification(t('auth_files.delete_success'), 'success');
            setFiles((prev) => prev.filter((item) => item.name !== name));
            setSelectedFiles((prev) => {
              if (!prev.has(name)) return prev;
              const next = new Set(prev);
              next.delete(name);
              return next;
            });
          } catch (err: unknown) {
            const errorMessage = normalizeAuthFilesActionError(err, t);
            showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
          } finally {
            setDeleting(null);
          }
        },
      });
    },
    [showConfirmation, showNotification, t]
  );

  const handleDeleteAll = useCallback(
    (deleteAllOptions: DeleteAllOptions) => {
      const { filter, problemOnly, onResetFilterToAll, onResetProblemOnly } = deleteAllOptions;
      const isFiltered = filter !== 'all';
      const isProblemOnly = problemOnly === true;
      const typeLabel = isFiltered ? getTypeLabel(t, filter) : t('auth_files.filter_all');
      const confirmMessage = isProblemOnly
        ? isFiltered
          ? t('auth_files.delete_problem_filtered_confirm', { type: typeLabel })
          : t('auth_files.delete_problem_confirm')
        : isFiltered
          ? t('auth_files.delete_filtered_confirm', { type: typeLabel })
          : t('auth_files.delete_all_confirm');

      showConfirmation({
        title: t('auth_files.delete_all_title', { defaultValue: 'Delete All Files' }),
        message: confirmMessage,
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          setDeletingAll(true);
          try {
            if (!isFiltered && !isProblemOnly) {
              await authFilesApi.deleteAll();
              showNotification(t('auth_files.delete_all_success'), 'success');
              setFiles((prev) => prev.filter((file) => isRuntimeOnlyAuthFile(file)));
              deselectAll();
            } else {
              const filesToDelete = files.filter((file) => {
                if (isRuntimeOnlyAuthFile(file)) return false;
                if (isFiltered && file.type !== filter) return false;
                if (isProblemOnly && !hasAuthFileStatusMessage(file)) return false;
                return true;
              });

              if (filesToDelete.length === 0) {
                const emptyMessage = isProblemOnly
                  ? isFiltered
                    ? t('auth_files.delete_problem_filtered_none', { type: typeLabel })
                    : t('auth_files.delete_problem_none')
                  : t('auth_files.delete_filtered_none', { type: typeLabel });
                showNotification(emptyMessage, 'info');
                setDeletingAll(false);
                return;
              }

              let success = 0;
              let failed = 0;
              const deletedNames: string[] = [];

              for (const file of filesToDelete) {
                try {
                  await authFilesApi.deleteFile(file.name);
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
                    ? t('auth_files.delete_problem_filtered_success', {
                        count: success,
                        type: typeLabel,
                      })
                    : t('auth_files.delete_problem_success', { count: success }),
                  'success'
                );
              } else if (failed === 0) {
                showNotification(
                  t('auth_files.delete_filtered_success', { count: success, type: typeLabel }),
                  'success'
                );
              } else if (isProblemOnly) {
                showNotification(
                  isFiltered
                    ? t('auth_files.delete_problem_filtered_partial', {
                        success,
                        failed,
                        type: typeLabel,
                      })
                    : t('auth_files.delete_problem_partial', { success, failed }),
                  'warning'
                );
              } else {
                showNotification(
                  t('auth_files.delete_filtered_partial', { success, failed, type: typeLabel }),
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
            const errorMessage = normalizeAuthFilesActionError(err, t);
            showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
          } finally {
            setDeletingAll(false);
          }
        },
      });
    },
    [deselectAll, files, showConfirmation, showNotification, t]
  );

  const handleDownload = useCallback(
    async (name: string) => {
      try {
        const response = await apiClient.getRaw(
          `/auth-files/download?name=${encodeURIComponent(name)}`,
          { responseType: 'blob' }
        );
        const blob = new Blob([response.data]);
        downloadBlob({ filename: name, blob });
        showNotification(t('auth_files.download_success'), 'success');
      } catch (err: unknown) {
        const errorMessage = normalizeAuthFilesActionError(err, t);
        showNotification(`${t('notification.download_failed')}: ${errorMessage}`, 'error');
      }
    },
    [showNotification, t]
  );

  const handleStatusToggle = useCallback(
    async (item: AuthFileItem, enabled: boolean) => {
      const name = item.name;
      const nextDisabled = !enabled;
      const previousDisabled = item.disabled === true;

      setStatusUpdating((prev) => ({ ...prev, [name]: true }));
      setFiles((prev) => prev.map((f) => (f.name === name ? { ...f, disabled: nextDisabled } : f)));

      try {
        await authFilesApi.setStatus(name, nextDisabled);
        await loadFiles();
        void refreshKeyStats().catch(() => {});
        showNotification(
          enabled
            ? t('auth_files.status_enabled_success', { name })
            : t('auth_files.status_disabled_success', { name }),
          'success'
        );
      } catch (err: unknown) {
        const errorMessage = resolveStatusUpdateErrorMessage(err);
        setFiles((prev) =>
          prev.map((f) => (f.name === name ? { ...f, disabled: previousDisabled } : f))
        );
        showNotification(`${t('notification.update_failed')}: ${errorMessage}`, 'error');
      } finally {
        setStatusUpdating((prev) => {
          if (!prev[name]) return prev;
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
    },
    [loadFiles, refreshKeyStats, resolveStatusUpdateErrorMessage, showNotification, t]
  );

  const batchSetStatus = useCallback(
    async (names: string[], enabled: boolean) => {
      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;

      const targetNames = new Set(uniqueNames);
      const nextDisabled = !enabled;
      const previousDisabled = new Map(
        files.map((file) => [file.name, file.disabled === true] as const)
      );

      setActionResult(null);
      setFiles((prev) =>
        prev.map((file) =>
          targetNames.has(file.name) ? { ...file, disabled: nextDisabled } : file
        )
      );

      const results = await Promise.allSettled(
        uniqueNames.map((name) => authFilesApi.setStatus(name, nextDisabled))
      );
      const outcome = collectAuthFilesSettledOutcome(uniqueNames, results, (reason) =>
        resolveStatusUpdateErrorMessage(reason)
      );

      if (outcome.successCount > 0) {
        await loadFiles();
        void refreshKeyStats().catch(() => {});
      } else {
        setFiles((prev) =>
          prev.map((file) => {
            if (!targetNames.has(file.name)) return file;
            return { ...file, disabled: previousDisabled.get(file.name) === true };
          })
        );
      }

      if (outcome.failures.length === 0) {
        showNotification(
          t('auth_files.batch_status_success', { count: outcome.successCount }),
          'success'
        );
        deselectAll();
        return;
      }

      showNotification(
        outcome.successCount > 0
          ? t('auth_files.batch_status_partial', {
              success: outcome.successCount,
              failed: outcome.failures.length,
            })
          : t('notification.update_failed'),
        outcome.successCount > 0 ? 'warning' : 'error'
      );
      openActionResult(
        buildAuthFilesActionFeedback(
          enabled ? 'batch-enable' : 'batch-disable',
          outcome.totalCount,
          outcome.successCount,
          outcome.failures
        )
      );
      setSelectedFiles(new Set(outcome.failures.map((item) => item.name)));
    },
    [
      deselectAll,
      files,
      loadFiles,
      openActionResult,
      refreshKeyStats,
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
        title: t('auth_files.batch_delete_title'),
        message: t('auth_files.batch_delete_confirm', { count: uniqueNames.length }),
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          setActionResult(null);

          const results = await Promise.allSettled(
            uniqueNames.map((name) => authFilesApi.deleteFile(name))
          );
          const outcome = collectAuthFilesSettledOutcome(uniqueNames, results, (reason) =>
            normalizeAuthFilesActionError(reason, t)
          );

          if (outcome.successNames.length > 0) {
            const deletedSet = new Set(outcome.successNames);
            setFiles((prev) => prev.filter((file) => !deletedSet.has(file.name)));
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
              `${t('auth_files.delete_all_success')} (${outcome.successCount})`,
              'success'
            );
            return;
          }

          setSelectedFiles(new Set(outcome.failures.map((item) => item.name)));
          showNotification(
            outcome.successCount > 0
              ? t('auth_files.batch_delete_partial', {
                  success: outcome.successCount,
                  failed: outcome.failures.length,
                })
              : t('notification.delete_failed'),
            outcome.successCount > 0 ? 'warning' : 'error'
          );
          openActionResult(
            buildAuthFilesActionFeedback(
              'batch-delete',
              outcome.totalCount,
              outcome.successCount,
              outcome.failures
            )
          );
        },
      });
    },
    [openActionResult, showConfirmation, showNotification, t]
  );

  const batchDownload = useCallback(
    async (names: string[]) => {
      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;

      setBatchDownloading(true);
      setActionResult(null);
      try {
        const { archive, feedback } = await createAuthFilesBatchArchive(
          uniqueNames,
          authFilesApi.downloadText
        );

        if (feedback.failures.length > 0) {
          openActionResult(
            buildAuthFilesActionFeedback(
              'batch-download',
              feedback.totalCount,
              feedback.successCount,
              feedback.failures
            )
          );
        }

        if (!archive) {
          showNotification(t('auth_files.batch_download_failed'), 'error');
          return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        downloadBlob({
          filename: `auth-files-batch-${timestamp}.zip`,
          blob: archive,
        });

        if (feedback.failures.length === 0) {
          showNotification(
            t('auth_files.batch_download_success', { count: feedback.totalCount }),
            'success'
          );
        } else {
          showNotification(
            t('auth_files.batch_download_partial', {
              success: feedback.successCount,
              failed: feedback.failures.length,
            }),
            'warning'
          );
        }
      } catch (err: unknown) {
        const errorMessage = normalizeAuthFilesActionError(err, t);
        showNotification(
          `${t('auth_files.batch_download_failed')}${errorMessage ? `: ${errorMessage}` : ''}`,
          'error'
        );
      } finally {
        setBatchDownloading(false);
      }
    },
    [openActionResult, showNotification, t]
  );

  const closeActionResult = useCallback(() => {
    setActionResult(null);
  }, []);

  return {
    files,
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
