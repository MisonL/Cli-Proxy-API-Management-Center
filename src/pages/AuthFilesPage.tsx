import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { animate } from 'motion/mini';
import type { AnimationPlaybackControlsWithThen } from 'motion-dom';
import { useInterval } from '@/hooks/useInterval';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { copyToClipboard } from '@/utils/clipboard';
import { formatDateTime, formatFileSize } from '@/utils/format';
import {
  MAX_CARD_PAGE_SIZE,
  MIN_CARD_PAGE_SIZE,
  QUOTA_PROVIDER_TYPES,
  clampCardPageSize,
  formatModified,
  getAuthFileStatusMessage,
  getTypeColor,
  getTypeLabel,
  isRuntimeOnlyAuthFile,
  normalizeProviderKey,
  resolveAuthFileStats,
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import { AuthFileCard } from '@/features/authFiles/components/AuthFileCard';
import { AuthFilesActionResultModal } from '@/features/authFiles/components/AuthFilesActionResultModal.tsx';
import { AuthFileDetailModal } from '@/features/authFiles/components/AuthFileDetailModal';
import { AuthFileModelsModal } from '@/features/authFiles/components/AuthFileModelsModal';
import { AuthFilesPrefixProxyEditorModal } from '@/features/authFiles/components/AuthFilesPrefixProxyEditorModal';
import { OAuthExcludedCard } from '@/features/authFiles/components/OAuthExcludedCard';
import { OAuthModelAliasCard } from '@/features/authFiles/components/OAuthModelAliasCard';
import { useAuthFilesData } from '@/features/authFiles/hooks/useAuthFilesData';
import { useAuthFilesModels } from '@/features/authFiles/hooks/useAuthFilesModels';
import { useAuthFilesOauth } from '@/features/authFiles/hooks/useAuthFilesOauth';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { useAuthFilesStats } from '@/features/authFiles/hooks/useAuthFilesStats';
import { useAuthFilesStatusBarCache } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import { buildAuthFileActivityMap, getAuthFileLastActiveAt } from '@/features/authFiles/authFilesPageData';
import { useAuthFilesPageData } from '@/features/authFiles/useAuthFilesPageData';
import { readAuthFilesUiState, writeAuthFilesUiState } from '@/features/authFiles/uiState';
import { useAuthStore, useNotificationStore, useThemeStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { normalizeAuthIndex } from '@/utils/usage';
import styles from './AuthFilesPage.module.scss';

const easePower3Out = (progress: number) => 1 - (1 - progress) ** 4;
const easePower2In = (progress: number) => progress ** 3;
const BATCH_BAR_BASE_TRANSFORM = 'translateX(-50%)';
const BATCH_BAR_HIDDEN_TRANSFORM = 'translateX(-50%) translateY(56px)';
const AUTH_FILES_LIST_VIEW_STORAGE_KEY = 'cli-proxy-auth-files-list-view-v1';
const AUTH_FILE_STATUS_FILTERS = new Set([
  'all',
  'healthy',
  'disabled',
  'unavailable',
  'warning',
  'quota-limited',
]);
const AUTH_FILE_ACTIVITY_FILTERS = new Set(['all', '24h', '7d']);
const AUTH_FILE_SORT_OPTIONS = new Set([
  'name',
  'modified-desc',
  'active-desc',
  'success-desc',
  'failure-desc',
]);
const AUTH_FILE_VIEW_MODES = new Set(['diagram', 'list']);

type QuickFilterPresetId =
  | 'all'
  | 'problems'
  | 'disabled'
  | 'quota-limited'
  | 'active-24h'
  | 'active-7d';

const loadStoredAuthFilesListViewMode = (): 'cards' | 'list' => {
  try {
    if (typeof localStorage === 'undefined') {
      return 'cards';
    }
    return localStorage.getItem(AUTH_FILES_LIST_VIEW_STORAGE_KEY) === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
};

export function AuthFilesPage() {
  const { t, i18n } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;
  const navigate = useNavigate();

  const [filter, setFilter] = useState<'all' | string>('all');
  const [problemOnly, setProblemOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'healthy' | 'disabled' | 'unavailable' | 'warning' | 'quota-limited'
  >('all');
  const [activityFilter, setActivityFilter] = useState<'all' | '24h' | '7d'>('all');
  const [sortBy, setSortBy] = useState<
    'name' | 'modified-desc' | 'active-desc' | 'success-desc' | 'failure-desc'
  >('modified-desc');
  const [activityReferenceNow, setActivityReferenceNow] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);
  const [pageSizeInput, setPageSizeInput] = useState('9');
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<AuthFileItem | null>(null);
  const [viewMode, setViewMode] = useState<'diagram' | 'list'>('list');
  const [fileViewMode, setFileViewMode] = useState<'cards' | 'list'>(
    loadStoredAuthFilesListViewMode
  );
  const [batchActionBarVisible, setBatchActionBarVisible] = useState(false);
  const floatingBatchActionsRef = useRef<HTMLDivElement>(null);
  const batchActionAnimationRef = useRef<AnimationPlaybackControlsWithThen | null>(null);
  const previousSelectionCountRef = useRef(0);
  const selectionCountRef = useRef(0);

  const { keyStats, usageDetails, loadKeyStats, refreshKeyStats } = useAuthFilesStats();
  const {
    files,
    selectedFiles,
    selectionCount,
    loading,
    error,
    uploading,
    deleting,
    deletingAll,
    statusUpdating,
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
    batchDownloading,
    closeActionResult,
  } = useAuthFilesData({ refreshKeyStats });

  const statusBarCache = useAuthFilesStatusBarCache(files, usageDetails);

  const {
    excluded,
    excludedError,
    modelAlias,
    modelAliasError,
    allProviderModels,
    loadExcluded,
    loadModelAlias,
    deleteExcluded,
    deleteModelAlias,
    handleMappingUpdate,
    handleDeleteLink,
    handleToggleFork,
    handleRenameAlias,
    handleDeleteAlias,
  } = useAuthFilesOauth({ viewMode, files });

  const {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal,
  } = useAuthFilesModels();

  const {
    prefixProxyEditor,
    prefixProxyUpdatedText,
    prefixProxyDirty,
    openPrefixProxyEditor,
    closePrefixProxyEditor,
    handlePrefixProxyChange,
    handlePrefixProxySave,
  } = useAuthFilesPrefixProxyEditor({
    disableControls: connectionStatus !== 'connected',
    loadFiles,
    loadKeyStats: refreshKeyStats,
  });

  const disableControls = connectionStatus !== 'connected';
  const normalizedFilter = normalizeProviderKey(String(filter));
  const quotaFilterType: QuotaProviderType | null = QUOTA_PROVIDER_TYPES.has(
    normalizedFilter as QuotaProviderType
  )
    ? (normalizedFilter as QuotaProviderType)
    : null;

  useEffect(() => {
    const persisted = readAuthFilesUiState();
    if (!persisted) return;

    if (typeof persisted.filter === 'string' && persisted.filter.trim()) {
      setFilter(persisted.filter);
    }
    if (typeof persisted.problemOnly === 'boolean') {
      setProblemOnly(persisted.problemOnly);
    }
    if (typeof persisted.search === 'string') {
      setSearch(persisted.search);
    }
    if (
      typeof persisted.statusFilter === 'string' &&
      AUTH_FILE_STATUS_FILTERS.has(persisted.statusFilter)
    ) {
      setStatusFilter(persisted.statusFilter);
    }
    if (
      typeof persisted.activityFilter === 'string' &&
      AUTH_FILE_ACTIVITY_FILTERS.has(persisted.activityFilter)
    ) {
      setActivityFilter(persisted.activityFilter);
    }
    if (typeof persisted.sortBy === 'string' && AUTH_FILE_SORT_OPTIONS.has(persisted.sortBy)) {
      setSortBy(persisted.sortBy);
    }
    if (typeof persisted.viewMode === 'string' && AUTH_FILE_VIEW_MODES.has(persisted.viewMode)) {
      setViewMode(persisted.viewMode);
    }
    if (typeof persisted.page === 'number' && Number.isFinite(persisted.page)) {
      setPage(Math.max(1, Math.round(persisted.page)));
    }
    if (typeof persisted.pageSize === 'number' && Number.isFinite(persisted.pageSize)) {
      setPageSize(clampCardPageSize(persisted.pageSize));
    }
  }, []);

  useEffect(() => {
    writeAuthFilesUiState({
      filter,
      problemOnly,
      search,
      statusFilter,
      activityFilter,
      sortBy,
      viewMode,
      page,
      pageSize,
    });
  }, [activityFilter, filter, page, pageSize, problemOnly, search, sortBy, statusFilter, viewMode]);

  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(AUTH_FILES_LIST_VIEW_STORAGE_KEY, fileViewMode);
    } catch {
      // Ignore storage errors.
    }
  }, [fileViewMode]);

  useEffect(() => {
    setPageSizeInput(String(pageSize));
  }, [pageSize]);

  const commitPageSizeInput = (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      setPageSizeInput(String(pageSize));
      return;
    }

    const value = Number(trimmed);
    if (!Number.isFinite(value)) {
      setPageSizeInput(String(pageSize));
      return;
    }

    const next = clampCardPageSize(value);
    setPageSize(next);
    setPageSizeInput(String(next));
    setPage(1);
  };

  const handlePageSizeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.currentTarget.value;
    setPageSizeInput(rawValue);

    const trimmed = rawValue.trim();
    if (!trimmed) return;

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;

    const rounded = Math.round(parsed);
    if (rounded < MIN_CARD_PAGE_SIZE || rounded > MAX_CARD_PAGE_SIZE) return;

    setPageSize(rounded);
    setPage(1);
  };

  const handleHeaderRefresh = useCallback(async () => {
    await Promise.all([loadFiles(), refreshKeyStats(), loadExcluded(), loadModelAlias()]);
  }, [loadFiles, refreshKeyStats, loadExcluded, loadModelAlias]);

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    if (!isCurrentLayer) return;
    loadFiles();
    void loadKeyStats().catch(() => {});
    loadExcluded();
    loadModelAlias();
  }, [isCurrentLayer, loadFiles, loadKeyStats, loadExcluded, loadModelAlias]);

  useInterval(
    () => {
      void refreshKeyStats().catch(() => {});
    },
    isCurrentLayer ? 240_000 : null
  );

  useEffect(() => {
    setActivityReferenceNow(Date.now());
  }, [usageDetails]);

  const deferredSearch = useDeferredValue(search);
  const searchPending = deferredSearch !== search;
  const fileActivity = useMemo(() => buildAuthFileActivityMap(usageDetails), [usageDetails]);

  const {
    existingTypes,
    typeCounts,
    filtered,
    currentPage,
    totalPages,
    pageItems,
    selectablePageItems,
    selectedNames,
  } = useAuthFilesPageData({
    files,
    selectedFiles,
    keyStats,
    usageDetails,
    filters: {
      filter,
      problemOnly,
      search: deferredSearch,
      statusFilter,
      activityFilter,
      sortBy,
      page,
      pageSize,
      activityReferenceNow,
      },
  });

  const quickFilterPresetId: QuickFilterPresetId | null = (() => {
    if (search.trim() || filter !== 'all') {
      return null;
    }
    if (problemOnly && statusFilter === 'all' && activityFilter === 'all') {
      return 'problems';
    }
    if (!problemOnly && statusFilter === 'disabled' && activityFilter === 'all') {
      return 'disabled';
    }
    if (!problemOnly && statusFilter === 'quota-limited' && activityFilter === 'all') {
      return 'quota-limited';
    }
    if (!problemOnly && statusFilter === 'all' && activityFilter === '24h') {
      return 'active-24h';
    }
    if (!problemOnly && statusFilter === 'all' && activityFilter === '7d') {
      return 'active-7d';
    }
    if (!problemOnly && statusFilter === 'all' && activityFilter === 'all') {
      return 'all';
    }
    return null;
  })();

  const applyQuickFilterPreset = useCallback((presetId: QuickFilterPresetId) => {
    setPage(1);
    if (presetId === 'all') {
      setFilter('all');
      setProblemOnly(false);
      setSearch('');
      setStatusFilter('all');
      setActivityFilter('all');
      return;
    }
    setFilter('all');
    setSearch('');
    if (presetId === 'problems') {
      setProblemOnly(true);
      setStatusFilter('all');
      setActivityFilter('all');
      return;
    }
    setProblemOnly(false);
    if (presetId === 'disabled') {
      setStatusFilter('disabled');
      setActivityFilter('all');
      return;
    }
    if (presetId === 'quota-limited') {
      setStatusFilter('quota-limited');
      setActivityFilter('all');
      return;
    }
    setStatusFilter('all');
    setActivityFilter(presetId === 'active-24h' ? '24h' : '7d');
  }, []);

  const showDetails = (file: AuthFileItem) => {
    setSelectedFile(file);
    setDetailModalOpen(true);
  };

  const copyTextWithNotification = useCallback(
    async (text: string) => {
      const copied = await copyToClipboard(text);
      showNotification(
        copied
          ? t('notification.link_copied', { defaultValue: 'Copied to clipboard' })
          : t('notification.copy_failed', { defaultValue: 'Copy failed' }),
        copied ? 'success' : 'error'
      );
    },
    [showNotification, t]
  );

  const openExcludedEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-excluded${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true },
      });
    },
    [filter, navigate]
  );

  const openModelAliasEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-model-alias${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true },
      });
    },
    [filter, navigate]
  );

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const actionsEl = floatingBatchActionsRef.current;
    if (!actionsEl) {
      document.documentElement.style.removeProperty('--auth-files-action-bar-height');
      return;
    }

    const updatePadding = () => {
      const height = actionsEl.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--auth-files-action-bar-height', `${height}px`);
    };

    updatePadding();
    window.addEventListener('resize', updatePadding);

    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePadding);
    ro?.observe(actionsEl);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updatePadding);
      document.documentElement.style.removeProperty('--auth-files-action-bar-height');
    };
  }, [batchActionBarVisible, selectionCount]);

  useEffect(() => {
    selectionCountRef.current = selectionCount;
    if (selectionCount > 0) {
      setBatchActionBarVisible(true);
    }
  }, [selectionCount]);

  useLayoutEffect(() => {
    if (!batchActionBarVisible) return;
    const currentCount = selectionCount;
    const previousCount = previousSelectionCountRef.current;
    const actionsEl = floatingBatchActionsRef.current;
    if (!actionsEl) return;

    batchActionAnimationRef.current?.stop();
    batchActionAnimationRef.current = null;

    if (currentCount > 0 && previousCount === 0) {
      batchActionAnimationRef.current = animate(
        actionsEl,
        {
          transform: [BATCH_BAR_HIDDEN_TRANSFORM, BATCH_BAR_BASE_TRANSFORM],
          opacity: [0, 1],
        },
        {
          duration: 0.28,
          ease: easePower3Out,
          onComplete: () => {
            actionsEl.style.transform = BATCH_BAR_BASE_TRANSFORM;
            actionsEl.style.opacity = '1';
          },
        }
      );
    } else if (currentCount === 0 && previousCount > 0) {
      batchActionAnimationRef.current = animate(
        actionsEl,
        {
          transform: [BATCH_BAR_BASE_TRANSFORM, BATCH_BAR_HIDDEN_TRANSFORM],
          opacity: [1, 0],
        },
        {
          duration: 0.22,
          ease: easePower2In,
          onComplete: () => {
            if (selectionCountRef.current === 0) {
              setBatchActionBarVisible(false);
            }
          },
        }
      );
    }

    previousSelectionCountRef.current = currentCount;
  }, [batchActionBarVisible, selectionCount]);

  useEffect(
    () => () => {
      batchActionAnimationRef.current?.stop();
      batchActionAnimationRef.current = null;
    },
    []
  );

  const renderFilterTags = () => (
    <div className={styles.filterTags}>
      {existingTypes.map((type) => {
        const isActive = filter === type;
        const color =
          type === 'all'
            ? { bg: 'var(--bg-tertiary)', text: 'var(--text-primary)' }
            : getTypeColor(type, resolvedTheme);
        const activeTextColor = resolvedTheme === 'dark' ? '#111827' : '#fff';
        return (
          <button
            key={type}
            className={`${styles.filterTag} ${isActive ? styles.filterTagActive : ''}`}
            style={{
              backgroundColor: isActive ? color.text : color.bg,
              color: isActive ? activeTextColor : color.text,
              borderColor: color.text,
            }}
            onClick={() => {
              setFilter(type);
              setPage(1);
            }}
          >
            <span className={styles.filterTagLabel}>{getTypeLabel(t, type)}</span>
            <span className={styles.filterTagCount}>{typeCounts[type] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );

  const renderQuickFilterButtons = () => {
    const presets: Array<{ id: QuickFilterPresetId; label: string }> = [
      { id: 'problems', label: t('auth_files.problem_filter_only') },
      { id: 'disabled', label: t('auth_files.status_filter_disabled') },
      { id: 'quota-limited', label: t('auth_files.status_filter_quota_limited') },
      { id: 'active-24h', label: t('auth_files.activity_filter_24h') },
      { id: 'active-7d', label: t('auth_files.activity_filter_7d') },
      { id: 'all', label: t('auth_files.quick_filter_clear') },
    ];

    return (
      <div className={styles.quickFilterSection}>
        <div className={styles.quickFilterLabel}>{t('auth_files.quick_filters_label')}</div>
        <div className={styles.quickFilterButtons}>
          {presets.map((preset) => {
            const isActive = quickFilterPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`${styles.quickFilterButton} ${
                  isActive ? styles.quickFilterButtonActive : ''
                }`}
                onClick={() => applyQuickFilterPreset(preset.id)}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderFileStatus = (file: AuthFileItem) => {
    const statusItems: Array<{ key: string; className?: string; label: string }> = [];
    if (file.disabled) {
      statusItems.push({ key: 'disabled', label: t('auth_files.health_status_disabled') });
    }
    if (file.unavailable) {
      statusItems.push({
        key: 'unavailable',
        className: styles.fileStatusDanger,
        label: t('auth_files.status_filter_unavailable'),
      });
    }
    if (file.quotaExceeded) {
      statusItems.push({
        key: 'quota',
        className: styles.fileStatusWarning,
        label: t('auth_files.status_filter_quota_limited'),
      });
    }
    const statusMessage = getAuthFileStatusMessage(file);
    if (!statusItems.length) {
      statusItems.push({ key: 'healthy', label: t('auth_files.health_status_healthy') });
    }

    return (
      <div className={styles.fileStatusBlock}>
        <div className={styles.fileStatusList}>
          {statusItems.map((item) => (
            <span
              key={item.key}
              className={`${styles.fileStatusPill} ${item.className ?? ''}`}
            >
              {item.label}
            </span>
          ))}
        </div>
        {statusMessage ? <div className={styles.fileStatusMessage}>{statusMessage}</div> : null}
      </div>
    );
  };

  const renderListView = () => (
    <div className={styles.fileTableWrapper}>
      <table className={styles.fileTable}>
        <thead>
          <tr>
            <th>{t('auth_files.list_selection')}</th>
            <th>{t('auth_files.file_name_label')}</th>
            <th>{t('auth_files.health_status_label')}</th>
            <th>{t('auth_files.file_modified')}</th>
            <th>{t('auth_files.file_size')}</th>
            <th>{t('auth_files.list_last_active')}</th>
            <th>{t('auth_files.list_actions')}</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((file) => {
            const selectable = !isRuntimeOnlyAuthFile(file);
            const typeValue = String(file.type || file.provider || 'unknown');
            const typeColor = getTypeColor(typeValue, resolvedTheme);
            const stats = resolveAuthFileStats(file, keyStats);
            const lastActiveAt = getAuthFileLastActiveAt(file, fileActivity);
            const authIndex = normalizeAuthIndex(file.authIndex ?? file['auth_index']);

            return (
              <tr key={file.name}>
                <td>
                  <button
                    type="button"
                    className={`${styles.selectionToggle} ${
                      selectedFiles.has(file.name) ? styles.selectionToggleActive : ''
                    }`}
                    onClick={() => toggleSelect(file.name)}
                    disabled={!selectable}
                    aria-pressed={selectedFiles.has(file.name)}
                    title={
                      selectable
                        ? t('auth_files.list_select_item')
                        : t('auth_files.list_selection_unavailable')
                    }
                  >
                    {selectedFiles.has(file.name) ? '✓' : ''}
                  </button>
                </td>
                <td>
                  <div className={styles.fileListPrimary}>
                    <div className={styles.fileListPrimaryHeader}>
                      <span
                        className={styles.typeBadge}
                        style={{
                          backgroundColor: typeColor.bg,
                          color: typeColor.text,
                          ...(typeColor.border ? { border: typeColor.border } : {}),
                        }}
                      >
                        {getTypeLabel(t, typeValue)}
                      </span>
                      <strong className={styles.fileName}>{file.name}</strong>
                    </div>
                    <div className={styles.fileListMeta}>
                      <span>
                        {t('auth_files.list_requests')}: {stats.success + stats.failure}
                      </span>
                      <span>
                        {t('auth_files.list_success')}: {stats.success}
                      </span>
                      <span>
                        {t('auth_files.list_failure')}: {stats.failure}
                      </span>
                      {authIndex ? <span>auth_index: {authIndex}</span> : null}
                    </div>
                  </div>
                </td>
                <td>{renderFileStatus(file)}</td>
                <td>{formatModified(file)}</td>
                <td>{file.size ? formatFileSize(file.size) : '-'}</td>
                <td>
                  {lastActiveAt
                    ? formatDateTime(new Date(lastActiveAt), i18n.language)
                    : '--'}
                </td>
                <td>
                  <div className={styles.fileRowActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => showDetails(file)}
                    >
                      {t('auth_files.list_action_details')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void showModels(file)}
                      disabled={disableControls}
                    >
                      {t('auth_files.models_button')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleDownload(file.name)}
                    >
                      {t('auth_files.download_button')}
                    </Button>
                    <Button
                      size="sm"
                      variant={file.disabled ? 'primary' : 'secondary'}
                      onClick={() => void handleStatusToggle(file, Boolean(file.disabled))}
                      loading={statusUpdating[file.name] === true}
                      disabled={disableControls}
                    >
                      {file.disabled ? t('auth_files.batch_enable') : t('auth_files.batch_disable')}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderFileViewModeToggle = () => (
    <div className={styles.viewModeToolbar}>
      <div className={styles.viewModeGroup}>
        <button
          type="button"
          className={`${styles.viewModeButton} ${
            fileViewMode === 'cards' ? styles.viewModeButtonActive : ''
          }`}
          onClick={() => setFileViewMode('cards')}
        >
          {t('auth_files.view_mode_cards')}
        </button>
        <button
          type="button"
          className={`${styles.viewModeButton} ${
            fileViewMode === 'list' ? styles.viewModeButtonActive : ''
          }`}
          onClick={() => setFileViewMode('list')}
        >
          {t('auth_files.view_mode_list')}
        </button>
      </div>
      {filtered.length > 0 ? (
        <div className={styles.viewModeSummary}>
          {t('auth_files.pagination_info', {
            current: currentPage,
            total: totalPages,
            count: filtered.length,
          })}
        </div>
      ) : null}
    </div>
  );

  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{t('auth_files.title_section')}</span>
      {files.length > 0 && <span className={styles.countBadge}>{files.length}</span>}
    </div>
  );

  const deleteAllButtonLabel = problemOnly
    ? filter === 'all'
      ? t('auth_files.delete_problem_button')
      : t('auth_files.delete_problem_button_with_type', { type: getTypeLabel(t, filter) })
    : filter === 'all'
      ? t('auth_files.delete_all_button')
      : `${t('common.delete')} ${getTypeLabel(t, filter)}`;

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('auth_files.title')}</h1>
        <p className={styles.description}>{t('auth_files.description')}</p>
      </div>

      <Card
        title={titleNode}
        extra={
          <div className={styles.headerActions}>
            <Button variant="secondary" size="sm" onClick={handleHeaderRefresh} disabled={loading}>
              {t('common.refresh')}
            </Button>
            <Button
              size="sm"
              onClick={handleUploadClick}
              disabled={disableControls || uploading}
              loading={uploading}
            >
              {t('auth_files.upload_button')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                handleDeleteAll({
                  filter,
                  problemOnly,
                  onResetFilterToAll: () => setFilter('all'),
                  onResetProblemOnly: () => setProblemOnly(false),
                })
              }
              disabled={disableControls || loading || deletingAll}
              loading={deletingAll}
            >
              {deleteAllButtonLabel}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        }
      >
        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={styles.filterSection}>
          {renderFilterTags()}
          {renderQuickFilterButtons()}

          <div className={styles.filterControls}>
            <div className={styles.filterItem}>
              <label>{t('auth_files.search_label')}</label>
              {searchPending ? (
                <span className={styles.filterPendingBadge}>{t('common.loading')}</span>
              ) : null}
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={t('auth_files.search_placeholder')}
              />
            </div>
            <div className={styles.filterItem}>
              <label>{t('auth_files.status_filter_label')}</label>
              <select
                className={styles.pageSizeSelect}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as typeof statusFilter);
                  setPage(1);
                }}
              >
                <option value="all">{t('auth_files.filter_all')}</option>
                <option value="healthy">{t('auth_files.status_filter_healthy')}</option>
                <option value="disabled">{t('auth_files.status_filter_disabled')}</option>
                <option value="unavailable">{t('auth_files.status_filter_unavailable')}</option>
                <option value="warning">{t('auth_files.status_filter_warning')}</option>
                <option value="quota-limited">{t('auth_files.status_filter_quota_limited')}</option>
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>{t('auth_files.activity_filter_label')}</label>
              <select
                className={styles.pageSizeSelect}
                value={activityFilter}
                onChange={(e) => {
                  setActivityFilter(e.target.value as typeof activityFilter);
                  setPage(1);
                }}
              >
                <option value="all">{t('auth_files.filter_all')}</option>
                <option value="24h">{t('auth_files.activity_filter_24h')}</option>
                <option value="7d">{t('auth_files.activity_filter_7d')}</option>
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>{t('auth_files.sort_label')}</label>
              <select
                className={styles.pageSizeSelect}
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as typeof sortBy);
                  setPage(1);
                }}
              >
                <option value="modified-desc">{t('auth_files.sort_modified_desc')}</option>
                <option value="active-desc">{t('auth_files.sort_active_desc')}</option>
                <option value="success-desc">{t('auth_files.sort_success_desc')}</option>
                <option value="failure-desc">{t('auth_files.sort_failure_desc')}</option>
                <option value="name">{t('auth_files.sort_name')}</option>
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>{t('auth_files.page_size_label')}</label>
              <input
                className={styles.pageSizeSelect}
                type="number"
                min={MIN_CARD_PAGE_SIZE}
                max={MAX_CARD_PAGE_SIZE}
                step={1}
                value={pageSizeInput}
                onChange={handlePageSizeChange}
                onBlur={(e) => commitPageSizeInput(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
              />
            </div>
            <div className={`${styles.filterItem} ${styles.filterToggleItem}`}>
              <label>{t('auth_files.problem_filter_label')}</label>
              <div className={styles.filterToggle}>
                <ToggleSwitch
                  checked={problemOnly}
                  onChange={(value) => {
                    setProblemOnly(value);
                    setPage(1);
                  }}
                  ariaLabel={t('auth_files.problem_filter_only')}
                  label={
                    <span className={styles.filterToggleLabel}>
                      {t('auth_files.problem_filter_only')}
                    </span>
                  }
                />
              </div>
            </div>
          </div>
        </div>

        {renderFileViewModeToggle()}

        {loading ? (
          <div className={styles.hint}>{t('common.loading')}</div>
        ) : pageItems.length === 0 ? (
          <EmptyState
            title={t('auth_files.search_empty_title')}
            description={t('auth_files.search_empty_desc')}
          />
        ) : fileViewMode === 'list' ? (
          renderListView()
        ) : (
          <div
            className={`${styles.fileGrid} ${quotaFilterType ? styles.fileGridQuotaManaged : ''}`}
          >
            {pageItems.map((file) => (
              <AuthFileCard
                key={file.name}
                file={file}
                selected={selectedFiles.has(file.name)}
                resolvedTheme={resolvedTheme}
                disableControls={disableControls}
                deleting={deleting}
                statusUpdating={statusUpdating}
                quotaFilterType={quotaFilterType}
                keyStats={keyStats}
                statusBarCache={statusBarCache}
                onShowModels={showModels}
                onShowDetails={showDetails}
                onDownload={handleDownload}
                onOpenPrefixProxyEditor={openPrefixProxyEditor}
                onDelete={handleDelete}
                onToggleStatus={handleStatusToggle}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}

        {!loading && filtered.length > pageSize && (
          <div className={styles.pagination}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
            >
              {t('auth_files.pagination_prev')}
            </Button>
            <div className={styles.pageInfo}>
              {t('auth_files.pagination_info', {
                current: currentPage,
                total: totalPages,
                count: filtered.length,
              })}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
            >
              {t('auth_files.pagination_next')}
            </Button>
          </div>
        )}
      </Card>

      <OAuthExcludedCard
        disableControls={disableControls}
        excludedError={excludedError}
        excluded={excluded}
        onAdd={() => openExcludedEditor()}
        onEdit={openExcludedEditor}
        onDelete={deleteExcluded}
      />

      <OAuthModelAliasCard
        disableControls={disableControls}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onAdd={() => openModelAliasEditor()}
        onEditProvider={openModelAliasEditor}
        onDeleteProvider={deleteModelAlias}
        modelAliasError={modelAliasError}
        modelAlias={modelAlias}
        allProviderModels={allProviderModels}
        onUpdate={handleMappingUpdate}
        onDeleteLink={handleDeleteLink}
        onToggleFork={handleToggleFork}
        onRenameAlias={handleRenameAlias}
        onDeleteAlias={handleDeleteAlias}
      />

      <AuthFileDetailModal
        open={detailModalOpen}
        file={selectedFile}
        onClose={() => setDetailModalOpen(false)}
        onCopyText={copyTextWithNotification}
      />

      <AuthFileModelsModal
        open={modelsModalOpen}
        fileName={modelsFileName}
        fileType={modelsFileType}
        loading={modelsLoading}
        error={modelsError}
        models={modelsList}
        excluded={excluded}
        onClose={closeModelsModal}
        onCopyText={copyTextWithNotification}
      />

      <AuthFilesPrefixProxyEditorModal
        disableControls={disableControls}
        editor={prefixProxyEditor}
        updatedText={prefixProxyUpdatedText}
        dirty={prefixProxyDirty}
        onClose={closePrefixProxyEditor}
        onSave={handlePrefixProxySave}
        onChange={handlePrefixProxyChange}
      />

      <AuthFilesActionResultModal
        open={actionResult !== null}
        result={actionResult}
        onClose={closeActionResult}
      />

      {batchActionBarVisible && typeof document !== 'undefined'
        ? createPortal(
            <div className={styles.batchActionContainer} ref={floatingBatchActionsRef}>
              <div className={styles.batchActionBar}>
                <div className={styles.batchActionLeft}>
                  <span className={styles.batchSelectionText}>
                    {t('auth_files.batch_selected', { count: selectionCount })}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => selectAllVisible(pageItems)}
                    disabled={selectablePageItems.length === 0}
                  >
                    {t('auth_files.batch_select_all')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>
                    {t('auth_files.batch_deselect')}
                  </Button>
                </div>
                <div className={styles.batchActionRight}>
                  <Button
                    size="sm"
                    onClick={() => batchSetStatus(selectedNames, true)}
                    disabled={disableControls || selectedNames.length === 0}
                  >
                    {t('auth_files.batch_enable')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => batchSetStatus(selectedNames, false)}
                    disabled={disableControls || selectedNames.length === 0}
                  >
                    {t('auth_files.batch_disable')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => batchDelete(selectedNames)}
                    disabled={disableControls || selectedNames.length === 0}
                  >
                    {t('common.delete')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void batchDownload(selectedNames)}
                    disabled={disableControls || selectedNames.length === 0 || batchDownloading}
                    loading={batchDownloading}
                  >
                    {t('auth_files.batch_download')}
                  </Button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
