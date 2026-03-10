import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { IconGithub, IconBookOpen, IconExternalLink, IconCode } from '@/components/ui/icons';
import {
  useAuthStore,
  useConfigStore,
  useNotificationStore,
  useModelsStore,
  useThemeStore,
} from '@/stores';
import {
  configApi,
  platformApi,
  systemApi,
  type PlatformStatusResponse,
  type QuotaRefreshPolicy,
} from '@/services/api';
import { apiKeysApi } from '@/services/api/apiKeys';
import { classifyModels } from '@/utils/models';
import { STORAGE_KEY_AUTH } from '@/utils/constants';
import { INLINE_LOGO_JPEG } from '@/assets/logoInline';
import iconGemini from '@/assets/icons/gemini.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import iconQwen from '@/assets/icons/qwen.svg';
import iconKimiLight from '@/assets/icons/kimi-light.svg';
import iconKimiDark from '@/assets/icons/kimi-dark.svg';
import iconGlm from '@/assets/icons/glm.svg';
import iconGrok from '@/assets/icons/grok.svg';
import iconDeepseek from '@/assets/icons/deepseek.svg';
import iconMinimax from '@/assets/icons/minimax.svg';
import { UsagePersistenceStatusPanel } from '@/components/usage/UsagePersistenceStatusPanel';
import styles from './SystemPage.module.scss';
import type { SelfCheckItem } from '@/types';
import {
  LOGIN_STORAGE_KEYS,
  buildSystemModelStatus,
  getSystemSelfCheckTone,
  normalizeSelfChecks,
  normalizeSystemErrorMessage,
} from './systemPageState';
import { formatDateTime } from '@/utils/format';
import { normalizeApiKeyList } from '@/utils/apiKeys';
import type { UsagePersistenceStatus } from '@/types';

const getStatusCode = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null;
  if ('status' in error && typeof (error as { status?: unknown }).status === 'number') {
    return (error as { status: number }).status;
  }
  return null;
};

const MODEL_CATEGORY_ICONS: Record<string, string | { light: string; dark: string }> = {
  gpt: { light: iconOpenaiLight, dark: iconOpenaiDark },
  claude: iconClaude,
  gemini: iconGemini,
  qwen: iconQwen,
  kimi: { light: iconKimiLight, dark: iconKimiDark },
  glm: iconGlm,
  grok: iconGrok,
  deepseek: iconDeepseek,
  minimax: iconMinimax,
};

export function SystemPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { showNotification, showConfirmation } = useNotificationStore();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const auth = useAuthStore();
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const clearCache = useConfigStore((state) => state.clearCache);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);

  const models = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const modelsError = useModelsStore((state) => state.error);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const [modelStatus, setModelStatus] = useState<{
    type: 'success' | 'warning' | 'error' | 'muted';
    message: string;
  }>();
  const [requestLogModalOpen, setRequestLogModalOpen] = useState(false);
  const [requestLogDraft, setRequestLogDraft] = useState(false);
  const [requestLogTouched, setRequestLogTouched] = useState(false);
  const [requestLogSaving, setRequestLogSaving] = useState(false);
  const [selfChecks, setSelfChecks] = useState<SelfCheckItem[]>([]);
  const [selfCheckLoading, setSelfCheckLoading] = useState(false);
  const [selfCheckError, setSelfCheckError] = useState('');
  const [persistenceStatus, setPersistenceStatus] = useState<UsagePersistenceStatus | null>(null);
  const [persistenceLoading, setPersistenceLoading] = useState(false);
  const [persistenceError, setPersistenceError] = useState('');
  const [platformStatus, setPlatformStatus] = useState<PlatformStatusResponse | null>(null);
  const [quotaPolicies, setQuotaPolicies] = useState<QuotaRefreshPolicy[]>([]);
  const [quotaPoliciesDraft, setQuotaPoliciesDraft] = useState<QuotaRefreshPolicy[]>([]);
  const [platformLoading, setPlatformLoading] = useState(false);
  const [platformSaving, setPlatformSaving] = useState(false);
  const [platformError, setPlatformError] = useState('');

  const apiKeysCache = useRef<string[]>([]);
  const versionTapCount = useRef(0);
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const otherLabel = useMemo(
    () => (i18n.language?.toLowerCase().startsWith('zh') ? '其他' : 'Other'),
    [i18n.language]
  );
  const groupedModels = useMemo(() => classifyModels(models, { otherLabel }), [models, otherLabel]);
  const requestLogEnabled = config?.requestLog ?? false;
  const requestLogDirty = requestLogDraft !== requestLogEnabled;
  const canEditRequestLog = auth.connectionStatus === 'connected' && Boolean(config);
  const quotaPoliciesDirty = JSON.stringify(quotaPoliciesDraft) !== JSON.stringify(quotaPolicies);

  const appVersion = __APP_VERSION__ || t('system_info.version_unknown');
  const apiVersion = auth.serverVersion || t('system_info.version_unknown');
  const buildTime = auth.serverBuildDate
    ? formatDateTime(auth.serverBuildDate, i18n.language)
    : t('system_info.version_unknown');
  const resolvedBuildTime = buildTime === '--' ? t('system_info.version_unknown') : buildTime;

  const getIconForCategory = (categoryId: string): string | null => {
    const iconEntry = MODEL_CATEGORY_ICONS[categoryId];
    if (!iconEntry) return null;
    if (typeof iconEntry === 'string') return iconEntry;
    return resolvedTheme === 'dark' ? iconEntry.dark : iconEntry.light;
  };

  const resolveApiKeysForModels = useCallback(async () => {
    if (apiKeysCache.current.length) {
      return apiKeysCache.current;
    }

    const configKeys = normalizeApiKeyList(config?.apiKeys);
    if (configKeys.length) {
      apiKeysCache.current = configKeys;
      return configKeys;
    }

    try {
      const list = await apiKeysApi.list();
      const normalized = normalizeApiKeyList(list);
      if (normalized.length) {
        apiKeysCache.current = normalized;
      }
      return normalized;
    } catch (err) {
      console.warn('Auto loading API keys for models failed:', err);
      return [];
    }
  }, [config?.apiKeys]);

  const fetchModels = useCallback(
    async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
      if (auth.connectionStatus !== 'connected') {
        setModelStatus(buildSystemModelStatus(t, 'connection-required'));
        return;
      }

      if (!auth.apiBase) {
        showNotification(t('notification.connection_required'), 'warning');
        return;
      }

      if (forceRefresh) {
        apiKeysCache.current = [];
      }

      setModelStatus(buildSystemModelStatus(t, 'loading'));
      try {
        const apiKeys = await resolveApiKeysForModels();
        const primaryKey = apiKeys[0];
        const list = await fetchModelsFromStore(auth.apiBase, primaryKey, forceRefresh);
        const hasModels = list.length > 0;
        setModelStatus(
          buildSystemModelStatus(t, hasModels ? 'success' : 'empty', {
            count: list.length,
          })
        );
      } catch (err: unknown) {
        setModelStatus(
          buildSystemModelStatus(t, 'error', {
            message: normalizeSystemErrorMessage(err),
          })
        );
      }
    },
    [
      auth.apiBase,
      auth.connectionStatus,
      fetchModelsFromStore,
      resolveApiKeysForModels,
      showNotification,
      t,
    ]
  );

  const loadSelfCheck = useCallback(async () => {
    setSelfCheckLoading(true);
    setSelfCheckError('');
    try {
      const data = await systemApi.getSelfCheck();
      setSelfChecks(normalizeSelfChecks(data?.checks));
    } catch (error: unknown) {
      setSelfCheckError(normalizeSystemErrorMessage(error, t('notification.refresh_failed')));
    } finally {
      setSelfCheckLoading(false);
    }
  }, [t]);

  const loadPersistenceStatus = useCallback(async () => {
    setPersistenceLoading(true);
    setPersistenceError('');
    try {
      const data = await systemApi.getUsagePersistenceStatus();
      setPersistenceStatus(data ?? null);
    } catch (error: unknown) {
      setPersistenceError(normalizeSystemErrorMessage(error, t('notification.refresh_failed')));
    } finally {
      setPersistenceLoading(false);
    }
  }, [t]);

  const loadPlatformSettings = useCallback(async () => {
    setPlatformLoading(true);
    setPlatformError('');
    try {
      const status = await platformApi.getStatus();
      if (!status?.enabled) {
        setPlatformStatus(status ?? null);
        setQuotaPolicies([]);
        setQuotaPoliciesDraft([]);
        return;
      }
      const policyResponse = await platformApi.getQuotaRefreshPolicies();
      setPlatformStatus(status ?? null);
      setQuotaPolicies(policyResponse?.policies ?? []);
      setQuotaPoliciesDraft(policyResponse?.policies ?? []);
    } catch (error: unknown) {
      const statusCode = getStatusCode(error);
      setPlatformStatus(null);
      setQuotaPolicies([]);
      setQuotaPoliciesDraft([]);
      if (statusCode === 404 || statusCode === 503) {
        setPlatformError('');
        return;
      }
      setPlatformError(normalizeSystemErrorMessage(error, t('notification.refresh_failed')));
    } finally {
      setPlatformLoading(false);
    }
  }, [t]);

  const handleHeaderRefresh = useCallback(async () => {
    await Promise.all([
      fetchConfig(undefined, true),
      loadSelfCheck(),
      loadPersistenceStatus(),
      loadPlatformSettings(),
      fetchModels({ forceRefresh: true }),
    ]);
  }, [fetchConfig, fetchModels, loadPersistenceStatus, loadPlatformSettings, loadSelfCheck]);

  useHeaderRefresh(handleHeaderRefresh);

  const handleClearLoginStorage = () => {
    showConfirmation({
      title: t('system_info.clear_login_title', { defaultValue: 'Clear Login Storage' }),
      message: t('system_info.clear_login_confirm'),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: () => {
        auth.logout();
        if (typeof localStorage === 'undefined') return;
        const keysToRemove = [STORAGE_KEY_AUTH, ...LOGIN_STORAGE_KEYS];
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        showNotification(t('notification.login_storage_cleared'), 'success');
      },
    });
  };

  const openRequestLogModal = useCallback(() => {
    setRequestLogTouched(false);
    setRequestLogDraft(requestLogEnabled);
    setRequestLogModalOpen(true);
  }, [requestLogEnabled]);

  const handleInfoVersionTap = useCallback(() => {
    versionTapCount.current += 1;
    if (versionTapTimer.current) {
      clearTimeout(versionTapTimer.current);
    }

    if (versionTapCount.current >= 7) {
      versionTapCount.current = 0;
      versionTapTimer.current = null;
      openRequestLogModal();
      return;
    }

    versionTapTimer.current = setTimeout(() => {
      versionTapCount.current = 0;
      versionTapTimer.current = null;
    }, 1500);
  }, [openRequestLogModal]);

  const handleRequestLogClose = useCallback(() => {
    setRequestLogModalOpen(false);
    setRequestLogTouched(false);
  }, []);

  const handleRequestLogSave = async () => {
    if (!canEditRequestLog) return;
    if (!requestLogDirty) {
      setRequestLogModalOpen(false);
      return;
    }

    const previous = requestLogEnabled;
    setRequestLogSaving(true);
    updateConfigValue('request-log', requestLogDraft);

    try {
      await configApi.updateRequestLog(requestLogDraft);
      clearCache('request-log');
      showNotification(t('notification.request_log_updated'), 'success');
      setRequestLogModalOpen(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      updateConfigValue('request-log', previous);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setRequestLogSaving(false);
    }
  };

  useEffect(() => {
    fetchConfig().catch(() => {
      // ignore
    });
  }, [fetchConfig]);

  useEffect(() => {
    void loadSelfCheck();
  }, [loadSelfCheck]);

  useEffect(() => {
    void loadPersistenceStatus();
  }, [loadPersistenceStatus]);

  useEffect(() => {
    void loadPlatformSettings();
  }, [loadPlatformSettings]);

  useEffect(() => {
    if (requestLogModalOpen && !requestLogTouched) {
      setRequestLogDraft(requestLogEnabled);
    }
  }, [requestLogModalOpen, requestLogTouched, requestLogEnabled]);

  useEffect(() => {
    return () => {
      if (versionTapTimer.current) {
        clearTimeout(versionTapTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  const handlePolicyFieldChange = useCallback(
    (provider: string, field: keyof QuotaRefreshPolicy, value: boolean | number) => {
      setQuotaPoliciesDraft((prev) =>
        prev.map((item) =>
          item.provider === provider ? { ...item, [field]: value } : item
        )
      );
    },
    []
  );

  const handleSavePlatformPolicies = useCallback(async () => {
    setPlatformSaving(true);
    try {
      const result = await platformApi.updateQuotaRefreshPolicies(quotaPoliciesDraft);
      const nextPolicies = result?.policies ?? quotaPoliciesDraft;
      setQuotaPolicies(nextPolicies);
      setQuotaPoliciesDraft(nextPolicies);
      showNotification(
        t('system_info.platform_policy_saved', { defaultValue: '刷新策略已保存' }),
        'success'
      );
    } catch (error: unknown) {
      showNotification(
        normalizeSystemErrorMessage(error, t('notification.update_failed')),
        'error'
      );
    } finally {
      setPlatformSaving(false);
    }
  }, [quotaPoliciesDraft, showNotification, t]);

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('system_info.title')}</h1>
      <div className={styles.content}>
        <Card className={styles.aboutCard}>
          <div className={styles.aboutHeader}>
            <img src={INLINE_LOGO_JPEG} alt="CPAMC" className={styles.aboutLogo} />
            <div className={styles.aboutTitle}>{t('system_info.about_title')}</div>
          </div>

          <div className={styles.aboutInfoGrid}>
            <button
              type="button"
              className={`${styles.infoTile} ${styles.tapTile}`}
              onClick={handleInfoVersionTap}
            >
              <div className={styles.tileLabel}>{t('footer.version')}</div>
              <div className={styles.tileValue}>{appVersion}</div>
            </button>

            <div className={styles.infoTile}>
              <div className={styles.tileLabel}>{t('footer.api_version')}</div>
              <div className={styles.tileValue}>{apiVersion}</div>
            </div>

            <div className={styles.infoTile}>
              <div className={styles.tileLabel}>{t('footer.build_date')}</div>
              <div className={styles.tileValue}>{resolvedBuildTime}</div>
            </div>

            <div className={styles.infoTile}>
              <div className={styles.tileLabel}>{t('connection.status')}</div>
              <div className={styles.tileValue}>{t(`common.${auth.connectionStatus}_status`)}</div>
              <div className={styles.tileSub}>{auth.apiBase || '-'}</div>
            </div>
          </div>

          <div className={styles.aboutActions}>
            <Button variant="secondary" size="sm" onClick={() => fetchConfig(undefined, true)}>
              {t('common.refresh')}
            </Button>
          </div>
        </Card>

        <Card title={t('system_info.quick_links_title')}>
          <p className={styles.sectionDescription}>{t('system_info.quick_links_desc')}</p>
          <div className={styles.quickLinks}>
            <a
              href="https://github.com/router-for-me/CLIProxyAPI"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkCard}
            >
              <div className={`${styles.linkIcon} ${styles.github}`}>
                <IconGithub size={22} />
              </div>
              <div className={styles.linkContent}>
                <div className={styles.linkTitle}>
                  {t('system_info.link_main_repo')}
                  <IconExternalLink size={14} />
                </div>
                <div className={styles.linkDesc}>{t('system_info.link_main_repo_desc')}</div>
              </div>
            </a>

            <a
              href="https://github.com/router-for-me/Cli-Proxy-API-Management-Center"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkCard}
            >
              <div className={`${styles.linkIcon} ${styles.github}`}>
                <IconCode size={22} />
              </div>
              <div className={styles.linkContent}>
                <div className={styles.linkTitle}>
                  {t('system_info.link_webui_repo')}
                  <IconExternalLink size={14} />
                </div>
                <div className={styles.linkDesc}>{t('system_info.link_webui_repo_desc')}</div>
              </div>
            </a>

            <a
              href="https://help.router-for.me/"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkCard}
            >
              <div className={`${styles.linkIcon} ${styles.docs}`}>
                <IconBookOpen size={22} />
              </div>
              <div className={styles.linkContent}>
                <div className={styles.linkTitle}>
                  {t('system_info.link_docs')}
                  <IconExternalLink size={14} />
                </div>
                <div className={styles.linkDesc}>{t('system_info.link_docs_desc')}</div>
              </div>
            </a>
          </div>
        </Card>

        <Card
          title={t('system_info.self_check_title')}
          extra={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadSelfCheck()}
              loading={selfCheckLoading}
            >
              {t('common.refresh')}
            </Button>
          }
        >
          <p className={styles.sectionDescription}>{t('system_info.self_check_desc')}</p>
          {selfCheckError && <div className="error-box">{selfCheckError}</div>}
          {selfCheckLoading && selfChecks.length === 0 ? (
            <div className="hint">{t('common.loading')}</div>
          ) : selfChecks.length === 0 ? (
            <div className="hint">{t('system_info.self_check_empty')}</div>
          ) : (
            <div className={styles.selfCheckList}>
              {selfChecks.map((item) => (
                <div key={item.id} className={styles.selfCheckItem}>
                  <div className={styles.selfCheckHeader}>
                    <div className={styles.selfCheckTitleRow}>
                      <strong className={styles.selfCheckTitle}>{item.title}</strong>
                      <span className={`status-badge ${getSystemSelfCheckTone(item.status)}`}>
                        {t(`system_info.self_check_status_${item.status}`)}
                      </span>
                    </div>
                    <span className={styles.selfCheckMessage}>{item.message}</span>
                  </div>
                  {item.details ? (
                    <div className={styles.selfCheckDetails}>{item.details}</div>
                  ) : null}
                  {item.suggestion ? (
                    <div className={styles.selfCheckSuggestion}>{item.suggestion}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title={t('system_info.platform_title', { defaultValue: '平台配额刷新策略' })}
          extra={
            <div className={styles.aboutActions}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadPlatformSettings()}
                loading={platformLoading}
              >
                {t('common.refresh')}
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSavePlatformPolicies()}
                loading={platformSaving}
                disabled={platformLoading || platformSaving || !quotaPoliciesDirty}
              >
                {t('common.save')}
              </Button>
            </div>
          }
        >
          <p className={styles.sectionDescription}>
            {t('system_info.platform_desc', {
              defaultValue: '统一控制后端额度快照的后台刷新频率、超时与并发，页面手动刷新仍可用于加急触发。',
            })}
          </p>
          {platformError && <div className="error-box">{platformError}</div>}
          {platformStatus?.enabled ? (
            <div className={styles.aboutInfoGrid}>
              <div className={styles.infoTile}>
                <div className={styles.tileLabel}>
                  {t('system_info.platform_role', { defaultValue: '平台角色' })}
                </div>
                <div className={styles.tileValue}>{platformStatus.role}</div>
                <div className={styles.tileSub}>{platformStatus.database_schema}</div>
              </div>
              <div className={styles.infoTile}>
                <div className={styles.tileLabel}>
                  {t('system_info.platform_workspace', { defaultValue: '租户 / 工作区' })}
                </div>
                <div className={styles.tileValue}>
                  {platformStatus.tenant_slug} / {platformStatus.workspace_slug}
                </div>
                <div className={styles.tileSub}>{platformStatus.nats_stream}</div>
              </div>
            </div>
          ) : null}
          {platformLoading ? (
            <div className="hint">{t('common.loading')}</div>
          ) : quotaPoliciesDraft.length === 0 ? (
            <div className="hint">
              {t('system_info.platform_empty', { defaultValue: '当前未启用平台聚合后端。' })}
            </div>
          ) : (
            <div className={styles.policyGrid}>
              {quotaPoliciesDraft.map((policy) => (
                <div key={policy.provider} className={styles.policyCard}>
                  <div className={styles.policyHeader}>
                    <div>
                      <strong className={styles.policyTitle}>{policy.provider}</strong>
                      <div className={styles.tileSub}>
                        {t('system_info.platform_policy_subtitle', {
                          defaultValue: '后台定时刷新策略',
                        })}
                      </div>
                    </div>
                    <ToggleSwitch
                      checked={policy.enabled}
                      onChange={(value) =>
                        handlePolicyFieldChange(policy.provider, 'enabled', value)
                      }
                      ariaLabel={`${policy.provider}-enabled`}
                    />
                  </div>
                  <div className={styles.policyFieldGrid}>
                    <label className={styles.policyField}>
                      <span>{t('system_info.platform_interval', { defaultValue: '刷新间隔(秒)' })}</span>
                      <input
                        className={styles.policyInput}
                        type="number"
                        min={30}
                        step={30}
                        value={policy.interval_seconds}
                        onChange={(event) =>
                          handlePolicyFieldChange(
                            policy.provider,
                            'interval_seconds',
                            Number(event.target.value) || 0
                          )
                        }
                      />
                    </label>
                    <label className={styles.policyField}>
                      <span>{t('system_info.platform_timeout', { defaultValue: '单次超时(秒)' })}</span>
                      <input
                        className={styles.policyInput}
                        type="number"
                        min={5}
                        step={5}
                        value={policy.timeout_seconds}
                        onChange={(event) =>
                          handlePolicyFieldChange(
                            policy.provider,
                            'timeout_seconds',
                            Number(event.target.value) || 0
                          )
                        }
                      />
                    </label>
                    <label className={styles.policyField}>
                      <span>{t('system_info.platform_parallelism', { defaultValue: '并发数' })}</span>
                      <input
                        className={styles.policyInput}
                        type="number"
                        min={1}
                        step={1}
                        value={policy.max_parallelism}
                        onChange={(event) =>
                          handlePolicyFieldChange(
                            policy.provider,
                            'max_parallelism',
                            Number(event.target.value) || 0
                          )
                        }
                      />
                    </label>
                    <label className={styles.policyField}>
                      <span>{t('system_info.platform_stale_after', { defaultValue: '过期阈值(秒)' })}</span>
                      <input
                        className={styles.policyInput}
                        type="number"
                        min={60}
                        step={60}
                        value={policy.stale_after_seconds}
                        onChange={(event) =>
                          handlePolicyFieldChange(
                            policy.provider,
                            'stale_after_seconds',
                            Number(event.target.value) || 0
                          )
                        }
                      />
                    </label>
                    <label className={styles.policyField}>
                      <span>{t('system_info.platform_backoff', { defaultValue: '失败退避(秒)' })}</span>
                      <input
                        className={styles.policyInput}
                        type="number"
                        min={0}
                        step={30}
                        value={policy.failure_backoff_seconds}
                        onChange={(event) =>
                          handlePolicyFieldChange(
                            policy.provider,
                            'failure_backoff_seconds',
                            Number(event.target.value) || 0
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title={t('usage_stats.persistence_title')}
          extra={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadPersistenceStatus()}
              loading={persistenceLoading}
            >
              {t('common.refresh')}
            </Button>
          }
        >
          <p className={styles.sectionDescription}>
            {t('config_management.visual.sections.system.usage_persistence_desc')}
          </p>
          <UsagePersistenceStatusPanel
            status={persistenceStatus}
            error={persistenceError}
            loading={persistenceLoading}
            hideWhenEmpty
            footer={
              persistenceStatus ? (
                <Button variant="ghost" size="sm" onClick={() => navigate('/usage')}>
                  {t('usage_stats.title')}
                </Button>
              ) : null
            }
          />
        </Card>

        <Card
          title={t('system_info.models_title')}
          extra={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchModels({ forceRefresh: true })}
              loading={modelsLoading}
            >
              {t('common.refresh')}
            </Button>
          }
        >
          <p className={styles.sectionDescription}>{t('system_info.models_desc')}</p>
          {modelStatus && (
            <div className={`status-badge ${modelStatus.type}`}>{modelStatus.message}</div>
          )}
          {modelsError && <div className="error-box">{modelsError}</div>}
          {modelsLoading ? (
            <div className="hint">{t('common.loading')}</div>
          ) : models.length === 0 ? (
            <div className="hint">{t('system_info.models_empty')}</div>
          ) : (
            <div className="item-list">
              {groupedModels.map((group) => {
                const iconSrc = getIconForCategory(group.id);
                return (
                  <div key={group.id} className="item-row">
                    <div className="item-meta">
                      <div className={styles.groupTitle}>
                        {iconSrc && <img src={iconSrc} alt="" className={styles.groupIcon} />}
                        <span className="item-title">{group.label}</span>
                      </div>
                      <div className="item-subtitle">
                        {t('system_info.models_count', { count: group.items.length })}
                      </div>
                    </div>
                    <div className={styles.modelTags}>
                      {group.items.map((model) => (
                        <span
                          key={`${model.name}-${model.alias ?? 'default'}`}
                          className={styles.modelTag}
                          title={model.description || ''}
                        >
                          <span className={styles.modelName}>{model.name}</span>
                          {model.alias && <span className={styles.modelAlias}>{model.alias}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title={t('system_info.clear_login_title')}>
          <p className={styles.sectionDescription}>{t('system_info.clear_login_desc')}</p>
          <div className={styles.clearLoginActions}>
            <Button variant="danger" onClick={handleClearLoginStorage}>
              {t('system_info.clear_login_button')}
            </Button>
          </div>
        </Card>
      </div>

      <Modal
        open={requestLogModalOpen}
        onClose={handleRequestLogClose}
        title={t('basic_settings.request_log_title')}
        footer={
          <>
            <Button variant="secondary" onClick={handleRequestLogClose} disabled={requestLogSaving}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleRequestLogSave}
              loading={requestLogSaving}
              disabled={!canEditRequestLog || !requestLogDirty}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="request-log-modal">
          <div className="status-badge warning">{t('basic_settings.request_log_warning')}</div>
          <ToggleSwitch
            label={t('basic_settings.request_log_enable')}
            labelPosition="left"
            checked={requestLogDraft}
            disabled={!canEditRequestLog || requestLogSaving}
            onChange={(value) => {
              setRequestLogDraft(value);
              setRequestLogTouched(true);
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
