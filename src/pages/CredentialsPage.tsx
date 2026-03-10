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
  getCredentialStableKey,
  getCredentialStatusMessage,
  getTypeColor,
  getTypeLabel,
  isRuntimeOnlyCredential,
  normalizeProviderKey,
  resolveCredentialStats,
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/credentials/constants';
import { CredentialCard } from '@/features/credentials/components/CredentialCard';
import { CredentialsActionResultModal } from '@/features/credentials/components/CredentialsActionResultModal.tsx';
import { CredentialDetailModal } from '@/features/credentials/components/CredentialDetailModal';
import { CredentialModelsModal } from '@/features/credentials/components/CredentialModelsModal';
import { CredentialsPrefixProxyEditorModal } from '@/features/credentials/components/CredentialsPrefixProxyEditorModal';
import { OAuthExcludedCard } from '@/features/credentials/components/OAuthExcludedCard';
import { OAuthModelAliasCard } from '@/features/credentials/components/OAuthModelAliasCard';
import { useCredentialsData } from '@/features/credentials/hooks/useCredentialsData';
import { useCredentialsModels } from '@/features/credentials/hooks/useCredentialsModels';
import { useCredentialsOauth } from '@/features/credentials/hooks/useCredentialsOauth';
import { useCredentialsPrefixProxyEditor } from '@/features/credentials/hooks/useCredentialsPrefixProxyEditor';
import { useCredentialsStats } from '@/features/credentials/hooks/useCredentialsStats';
import { useCredentialsStatusBarCache } from '@/features/credentials/hooks/useCredentialsStatusBarCache';
import {
  buildCredentialActivityMap,
  buildCredentialActivityMapFromFiles,
  buildCredentialTypeCounts,
  getCredentialLastActiveAt,
} from '@/features/credentials/credentialsPageData';
import { useCredentialsPageData } from '@/features/credentials/useCredentialsPageData';
import {
  readCredentialsUiState,
  writeCredentialsUiState,
} from '@/features/credentials/credentialsUiState';
import { useAuthStore, useNotificationStore, useThemeStore } from '@/stores';
import type { CredentialItem } from '@/types';
import { normalizeAuthIndex } from '@/utils/usage';
import styles from './CredentialsPage.module.scss';

const easePower3Out = (progress: number) => 1 - (1 - progress) ** 4;
const easePower2In = (progress: number) => progress ** 3;
const BATCH_BAR_BASE_TRANSFORM = 'translateX(-50%)';
const BATCH_BAR_HIDDEN_TRANSFORM = 'translateX(-50%) translateY(56px)';
const CREDENTIALS_LIST_VIEW_STORAGE_KEY = 'cli-proxy-credentials-list-view-v1';
const CREDENTIAL_STATUS_FILTERS = new Set([
  'all',
  'healthy',
  'disabled',
  'unavailable',
  'warning',
  'quota-limited',
]);
const CREDENTIAL_ACTIVITY_FILTERS = new Set(['all', '24h', '7d']);
const CREDENTIAL_SORT_OPTIONS = new Set([
  'name',
  'modified-desc',
  'active-desc',
  'success-desc',
  'failure-desc',
]);
const CREDENTIAL_VIEW_MODES = new Set(['diagram', 'list']);

type QuickFilterPresetId =
  | 'all'
  | 'problems'
  | 'disabled'
  | 'quota-limited'
  | 'active-24h'
  | 'active-7d';

const loadStoredCredentialsListViewMode = (): 'cards' | 'list' => {
  try {
    if (typeof localStorage === 'undefined') {
      return 'cards';
    }
    const stored = localStorage.getItem(CREDENTIALS_LIST_VIEW_STORAGE_KEY);
    return stored === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
};

export function CredentialsPage() {
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
  const [selectedFile, setSelectedFile] = useState<CredentialItem | null>(null);
  const [viewMode, setViewMode] = useState<'diagram' | 'list'>('list');
  const [fileViewMode, setFileViewMode] = useState<'cards' | 'list'>(
    loadStoredCredentialsListViewMode
  );
  const [batchActionBarVisible, setBatchActionBarVisible] = useState(false);
  const floatingBatchActionsRef = useRef<HTMLDivElement>(null);
  const batchActionAnimationRef = useRef<AnimationPlaybackControlsWithThen | null>(null);
  const previousSelectionCountRef = useRef(0);
  const selectionCountRef = useRef(0);
  const auxiliaryDataLoadedRef = useRef(false);
  const deferredSearch = useDeferredValue(search);
  const searchPending = deferredSearch !== search;
  const normalizedFilter = normalizeProviderKey(String(filter));
  const platformStatusFilter = statusFilter !== 'all' ? statusFilter : problemOnly ? 'warning' : '';
  const credentialsQuery = useMemo(
    () => ({
      page,
      pageSize,
      search: deferredSearch,
      provider: normalizedFilter === 'all' ? '' : normalizedFilter,
      status: platformStatusFilter,
      activity: activityFilter === 'all' ? '' : activityFilter,
      sort: sortBy,
    }),
    [activityFilter, deferredSearch, normalizedFilter, page, pageSize, platformStatusFilter, sortBy]
  );

  const { keyStats, usageDetails, loadKeyStats, refreshKeyStats } = useCredentialsStats();
  const {
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
  } = useCredentialsData({
    refreshKeyStats,
    query: credentialsQuery,
    onPageChange: setPage,
  });

  const effectiveKeyStats = useMemo(
    () => (platformBacked ? { bySource: {}, bySelectionKey: {} } : keyStats),
    [keyStats, platformBacked]
  );
  const effectiveUsageDetails = useMemo(
    () => (platformBacked ? [] : usageDetails),
    [platformBacked, usageDetails]
  );

  const statusBarCache = useCredentialsStatusBarCache(files, effectiveUsageDetails);

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
  } = useCredentialsOauth({ viewMode, files });

  const {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal,
  } = useCredentialsModels();

  const {
    prefixProxyEditor,
    prefixProxyUpdatedText,
    prefixProxyDirty,
    openPrefixProxyEditor,
    closePrefixProxyEditor,
    handlePrefixProxyChange,
    handlePrefixProxySave,
  } = useCredentialsPrefixProxyEditor({
    disableControls: connectionStatus !== 'connected',
    loadFiles,
    loadKeyStats: refreshKeyStats,
  });

  const disableControls = connectionStatus !== 'connected';
  const quotaFilterType: QuotaProviderType | null = QUOTA_PROVIDER_TYPES.has(
    normalizedFilter as QuotaProviderType
  )
    ? (normalizedFilter as QuotaProviderType)
    : null;

  useEffect(() => {
    const persisted = readCredentialsUiState();
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
      CREDENTIAL_STATUS_FILTERS.has(persisted.statusFilter)
    ) {
      setStatusFilter(persisted.statusFilter);
    }
    if (
      typeof persisted.activityFilter === 'string' &&
      CREDENTIAL_ACTIVITY_FILTERS.has(persisted.activityFilter)
    ) {
      setActivityFilter(persisted.activityFilter);
    }
    if (typeof persisted.sortBy === 'string' && CREDENTIAL_SORT_OPTIONS.has(persisted.sortBy)) {
      setSortBy(persisted.sortBy);
    }
    if (typeof persisted.viewMode === 'string' && CREDENTIAL_VIEW_MODES.has(persisted.viewMode)) {
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
    writeCredentialsUiState({
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
      localStorage.setItem(CREDENTIALS_LIST_VIEW_STORAGE_KEY, fileViewMode);
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
    const isPlatformBacked = await loadFiles();
    await Promise.all([
      isPlatformBacked ? Promise.resolve() : refreshKeyStats(),
      loadExcluded(),
      loadModelAlias(),
    ]);
  }, [loadFiles, refreshKeyStats, loadExcluded, loadModelAlias]);

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    if (!isCurrentLayer) return;
    void (async () => {
      const isPlatformBacked = await loadFiles();
      if (!isPlatformBacked && !auxiliaryDataLoadedRef.current) {
        void loadKeyStats().catch(() => {});
      }
    })();
  }, [isCurrentLayer, loadFiles, loadKeyStats]);

  useEffect(() => {
    if (!isCurrentLayer || auxiliaryDataLoadedRef.current) return;
    auxiliaryDataLoadedRef.current = true;
    void loadExcluded();
    void loadModelAlias();
  }, [isCurrentLayer, loadExcluded, loadModelAlias]);

  useInterval(
    () => {
      void refreshKeyStats().catch(() => {});
    },
    isCurrentLayer && !platformBacked ? 240_000 : null
  );

  useEffect(() => {
    setActivityReferenceNow(Date.now());
  }, [effectiveUsageDetails, files]);

  const fileActivity = useMemo(
    () =>
      platformBacked
        ? buildCredentialActivityMapFromFiles(files)
        : buildCredentialActivityMap(effectiveUsageDetails),
    [effectiveUsageDetails, files, platformBacked]
  );

  const {
    typeCounts,
    filtered,
    currentPage,
    totalPages,
    pageItems,
    selectablePageItems,
    selectedNames,
  } = useCredentialsPageData({
    files,
    selectedFiles,
    keyStats: effectiveKeyStats,
    usageDetails: effectiveUsageDetails,
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
  const effectiveExistingTypes = useMemo(() => {
    if (!platformBacked) {
      const legacyCounts = buildCredentialTypeCounts(files);
      return [
        'all',
        ...Object.keys(legacyCounts)
          .filter((key) => key !== 'all')
          .sort((left, right) => left.localeCompare(right)),
      ];
    }
    return ['all', ...Object.keys(providerFacets).sort((left, right) => left.localeCompare(right))];
  }, [files, platformBacked, providerFacets]);
  const effectiveTypeCounts = useMemo(() => {
    if (!platformBacked) return typeCounts;
    const facetTotal = Object.values(providerFacets).reduce((sum, count) => sum + count, 0);
    return {
      all: facetTotal || totalFiles,
      ...providerFacets,
    };
  }, [platformBacked, providerFacets, totalFiles, typeCounts]);
  const filteredCount = platformBacked ? totalFiles : filtered.length;
  const effectiveCurrentPage = platformBacked ? page : currentPage;
  const effectiveTotalPages = platformBacked
    ? Math.max(1, Math.ceil(totalFiles / pageSize))
    : totalPages;
  const effectivePageItems = platformBacked ? files : pageItems;
  const effectiveSelectablePageItems = useMemo(
    () =>
      platformBacked ? files.filter((file) => !isRuntimeOnlyCredential(file)) : selectablePageItems,
    [files, platformBacked, selectablePageItems]
  );

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

  const showDetails = (file: CredentialItem) => {
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
      navigate(`/credentials/oauth-excluded${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromCredentials: true },
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
      navigate(`/credentials/oauth-model-alias${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromCredentials: true },
      });
    },
    [filter, navigate]
  );

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const actionsEl = floatingBatchActionsRef.current;
    if (!actionsEl) {
      document.documentElement.style.removeProperty('--credentials-action-bar-height');
      return;
    }

    const updatePadding = () => {
      const height = actionsEl.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--credentials-action-bar-height', `${height}px`);
    };

    updatePadding();
    window.addEventListener('resize', updatePadding);

    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePadding);
    ro?.observe(actionsEl);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updatePadding);
      document.documentElement.style.removeProperty('--credentials-action-bar-height');
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
      {effectiveExistingTypes.map((type) => {
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
            <span className={styles.filterTagCount}>{effectiveTypeCounts[type] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );

  const renderQuickFilterButtons = () => {
    const presets: Array<{ id: QuickFilterPresetId; label: string }> = [
      { id: 'problems', label: t('credentials.problem_filter_only') },
      { id: 'disabled', label: t('credentials.status_filter_disabled') },
      { id: 'quota-limited', label: t('credentials.status_filter_quota_limited') },
      { id: 'active-24h', label: t('credentials.activity_filter_24h') },
      { id: 'active-7d', label: t('credentials.activity_filter_7d') },
      { id: 'all', label: t('credentials.quick_filter_clear') },
    ];

    return (
      <div className={styles.quickFilterSection}>
        <div className={styles.quickFilterLabel}>{t('credentials.quick_filters_label')}</div>
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

  const renderFileStatus = (file: CredentialItem) => {
    const statusItems: Array<{ key: string; className?: string; label: string }> = [];
    if (file.disabled) {
      statusItems.push({ key: 'disabled', label: t('credentials.health_status_disabled') });
    }
    if (file.unavailable) {
      statusItems.push({
        key: 'unavailable',
        className: styles.fileStatusDanger,
        label: t('credentials.status_filter_unavailable'),
      });
    }
    if (file.quotaExceeded) {
      statusItems.push({
        key: 'quota',
        className: styles.fileStatusWarning,
        label: t('credentials.status_filter_quota_limited'),
      });
    }
    const statusMessage = getCredentialStatusMessage(file);
    if (!statusItems.length) {
      statusItems.push({ key: 'healthy', label: t('credentials.health_status_healthy') });
    }

    return (
      <div className={styles.fileStatusBlock}>
        <div className={styles.fileStatusList}>
          {statusItems.map((item) => (
            <span key={item.key} className={`${styles.fileStatusPill} ${item.className ?? ''}`}>
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
            <th>{t('credentials.list_selection')}</th>
            <th>{t('credentials.file_name_label')}</th>
            <th>{t('credentials.health_status_label')}</th>
            <th>{t('credentials.file_modified')}</th>
            <th>{t('credentials.file_size')}</th>
            <th>{t('credentials.list_last_active')}</th>
            <th>{t('credentials.list_actions')}</th>
          </tr>
        </thead>
        <tbody>
          {effectivePageItems.map((file) => {
            const selectable = !isRuntimeOnlyCredential(file);
            const typeValue = String(file.type || file.provider || 'unknown');
            const typeColor = getTypeColor(typeValue, resolvedTheme);
            const stats = resolveCredentialStats(file, effectiveKeyStats);
            const lastActiveAt = getCredentialLastActiveAt(file, fileActivity);
            const selectionKey = normalizeAuthIndex(file.selectionKey);

            return (
              <tr key={getCredentialStableKey(file)}>
                <td>
                  <button
                    type="button"
                    className={`${styles.selectionToggle} ${
                      selectedFiles.has(getCredentialStableKey(file))
                        ? styles.selectionToggleActive
                        : ''
                    }`}
                    onClick={() => toggleSelect(getCredentialStableKey(file))}
                    disabled={!selectable}
                    aria-pressed={selectedFiles.has(getCredentialStableKey(file))}
                    title={
                      selectable
                        ? t('credentials.list_select_item')
                        : t('credentials.list_selection_unavailable')
                    }
                  >
                    {selectedFiles.has(getCredentialStableKey(file)) ? '✓' : ''}
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
                        {t('credentials.list_requests')}: {stats.success + stats.failure}
                      </span>
                      <span>
                        {t('credentials.list_success')}: {stats.success}
                      </span>
                      <span>
                        {t('credentials.list_failure')}: {stats.failure}
                      </span>
                      {selectionKey ? <span>selection_key: {selectionKey}</span> : null}
                    </div>
                  </div>
                </td>
                <td>{renderFileStatus(file)}</td>
                <td>{formatModified(file)}</td>
                <td>{file.size ? formatFileSize(file.size) : '-'}</td>
                <td>
                  {lastActiveAt ? formatDateTime(new Date(lastActiveAt), i18n.language) : '--'}
                </td>
                <td>
                  <div className={styles.fileRowActions}>
                    <Button variant="secondary" size="sm" onClick={() => showDetails(file)}>
                      {t('credentials.list_action_details')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void showModels(file)}
                      disabled={disableControls}
                    >
                      {t('credentials.models_button')}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => void handleDownload(file)}>
                      {t('credentials.download_button')}
                    </Button>
                    <Button
                      size="sm"
                      variant={file.disabled ? 'primary' : 'secondary'}
                      onClick={() => void handleStatusToggle(file, Boolean(file.disabled))}
                      loading={statusUpdating[getCredentialStableKey(file)] === true}
                      disabled={disableControls}
                    >
                      {file.disabled
                        ? t('credentials.batch_enable')
                        : t('credentials.batch_disable')}
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
          {t('credentials.view_mode_cards')}
        </button>
        <button
          type="button"
          className={`${styles.viewModeButton} ${
            fileViewMode === 'list' ? styles.viewModeButtonActive : ''
          }`}
          onClick={() => setFileViewMode('list')}
        >
          {t('credentials.view_mode_list')}
        </button>
      </div>
      {filteredCount > 0 ? (
        <div className={styles.viewModeSummary}>
          {t('credentials.pagination_info', {
            current: effectiveCurrentPage,
            total: effectiveTotalPages,
            count: filteredCount,
          })}
        </div>
      ) : null}
    </div>
  );

  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{t('credentials.title_section')}</span>
      {filteredCount > 0 && <span className={styles.countBadge}>{filteredCount}</span>}
    </div>
  );

  const deleteAllButtonLabel = problemOnly
    ? filter === 'all'
      ? t('credentials.delete_problem_button')
      : t('credentials.delete_problem_button_with_type', { type: getTypeLabel(t, filter) })
    : filter === 'all'
      ? t('credentials.delete_all_button')
      : `${t('common.delete')} ${getTypeLabel(t, filter)}`;

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('credentials.title')}</h1>
        <p className={styles.description}>{t('credentials.description')}</p>
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
              {t('credentials.upload_button')}
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
              <label>{t('credentials.search_label')}</label>
              {searchPending ? (
                <span className={styles.filterPendingBadge}>{t('common.loading')}</span>
              ) : null}
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={t('credentials.search_placeholder')}
              />
            </div>
            <div className={styles.filterItem}>
              <label>{t('credentials.status_filter_label')}</label>
              <select
                className={styles.pageSizeSelect}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as typeof statusFilter);
                  setPage(1);
                }}
              >
                <option value="all">{t('credentials.filter_all')}</option>
                <option value="healthy">{t('credentials.status_filter_healthy')}</option>
                <option value="disabled">{t('credentials.status_filter_disabled')}</option>
                <option value="unavailable">{t('credentials.status_filter_unavailable')}</option>
                <option value="warning">{t('credentials.status_filter_warning')}</option>
                <option value="quota-limited">
                  {t('credentials.status_filter_quota_limited')}
                </option>
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>{t('credentials.activity_filter_label')}</label>
              <select
                className={styles.pageSizeSelect}
                value={activityFilter}
                onChange={(e) => {
                  setActivityFilter(e.target.value as typeof activityFilter);
                  setPage(1);
                }}
              >
                <option value="all">{t('credentials.filter_all')}</option>
                <option value="24h">{t('credentials.activity_filter_24h')}</option>
                <option value="7d">{t('credentials.activity_filter_7d')}</option>
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>{t('credentials.sort_label')}</label>
              <select
                className={styles.pageSizeSelect}
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as typeof sortBy);
                  setPage(1);
                }}
              >
                <option value="modified-desc">{t('credentials.sort_modified_desc')}</option>
                <option value="active-desc">{t('credentials.sort_active_desc')}</option>
                <option value="success-desc">{t('credentials.sort_success_desc')}</option>
                <option value="failure-desc">{t('credentials.sort_failure_desc')}</option>
                <option value="name">{t('credentials.sort_name')}</option>
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>{t('credentials.page_size_label')}</label>
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
              <label>{t('credentials.problem_filter_label')}</label>
              <div className={styles.filterToggle}>
                <ToggleSwitch
                  checked={problemOnly}
                  onChange={(value) => {
                    setProblemOnly(value);
                    setPage(1);
                  }}
                  ariaLabel={t('credentials.problem_filter_only')}
                  label={
                    <span className={styles.filterToggleLabel}>
                      {t('credentials.problem_filter_only')}
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
        ) : effectivePageItems.length === 0 ? (
          <EmptyState
            title={t('credentials.search_empty_title')}
            description={t('credentials.search_empty_desc')}
          />
        ) : fileViewMode === 'list' ? (
          renderListView()
        ) : (
          <div
            className={`${styles.fileGrid} ${quotaFilterType ? styles.fileGridQuotaManaged : ''}`}
          >
            {effectivePageItems.map((file) => (
              <CredentialCard
                key={getCredentialStableKey(file)}
                file={file}
                selected={selectedFiles.has(getCredentialStableKey(file))}
                resolvedTheme={resolvedTheme}
                disableControls={disableControls}
                deleting={deleting}
                statusUpdating={statusUpdating}
                quotaFilterType={quotaFilterType}
                keyStats={effectiveKeyStats}
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

        {!loading && filteredCount > pageSize && (
          <div className={styles.pagination}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.max(1, effectiveCurrentPage - 1))}
              disabled={effectiveCurrentPage <= 1}
            >
              {t('credentials.pagination_prev')}
            </Button>
            <div className={styles.pageInfo}>
              {t('credentials.pagination_info', {
                current: effectiveCurrentPage,
                total: effectiveTotalPages,
                count: filteredCount,
              })}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.min(effectiveTotalPages, effectiveCurrentPage + 1))}
              disabled={effectiveCurrentPage >= effectiveTotalPages}
            >
              {t('credentials.pagination_next')}
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

      <CredentialDetailModal
        open={detailModalOpen}
        file={selectedFile}
        onClose={() => setDetailModalOpen(false)}
        onCopyText={copyTextWithNotification}
      />

      <CredentialModelsModal
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

      <CredentialsPrefixProxyEditorModal
        disableControls={disableControls}
        editor={prefixProxyEditor}
        updatedText={prefixProxyUpdatedText}
        dirty={prefixProxyDirty}
        onClose={closePrefixProxyEditor}
        onSave={handlePrefixProxySave}
        onChange={handlePrefixProxyChange}
      />

      <CredentialsActionResultModal
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
                    {t('credentials.batch_selected', { count: selectionCount })}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => selectAllVisible(effectivePageItems)}
                    disabled={effectiveSelectablePageItems.length === 0}
                  >
                    {t('credentials.batch_select_all')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>
                    {t('credentials.batch_deselect')}
                  </Button>
                </div>
                <div className={styles.batchActionRight}>
                  <Button
                    size="sm"
                    onClick={() => batchSetStatus(selectedNames, true)}
                    disabled={disableControls || selectedNames.length === 0}
                  >
                    {t('credentials.batch_enable')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => batchSetStatus(selectedNames, false)}
                    disabled={disableControls || selectedNames.length === 0}
                  >
                    {t('credentials.batch_disable')}
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
                    {t('credentials.batch_download')}
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
