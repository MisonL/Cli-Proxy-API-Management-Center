import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';

const mocks = vi.hoisted(() => ({
  fetchModels: vi.fn(async () => []),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'dashboard.title': '仪表盘',
        'dashboard.subtitle': '概览',
        'dashboard.current_config': '当前配置',
        'dashboard.routing_strategy': '路由策略',
        'dashboard.management_keys': '管理密钥',
        'dashboard.oauth_credentials': 'OAuth 凭证',
        'dashboard.available_models': '可用模型',
        'dashboard.available_models_desc': '模型总数',
        'dashboard.edit_settings': '编辑设置',
        'nav.config_management': '配置面板',
        'nav.ai_providers': 'AI 提供商',
        'nav.credentials': '凭证',
        'common.connected': '已连接',
        'common.connecting': '连接中',
        'common.disconnected': '未连接',
        'common.yes': '是',
        'common.no': '否',
        'basic_settings.debug_enable': '调试模式',
        'basic_settings.usage_statistics_enable': '使用统计',
        'basic_settings.logging_to_file_enable': '写入日志文件',
        'basic_settings.retry_count_label': '重试次数',
        'basic_settings.ws_auth_enable': 'WebSocket 认证',
        'basic_settings.routing_strategy_round_robin': '轮询',
        'basic_settings.routing_strategy_fill_first': '填满优先',
      };
      return translations[key] ?? key;
    },
    i18n: { language: 'zh-CN' },
  }),
}));

vi.mock('@/components/ui/icons', () => ({
  IconKey: () => <span>key</span>,
  IconBot: () => <span>bot</span>,
  IconFileText: () => <span>file</span>,
  IconSatellite: () => <span>sat</span>,
}));

vi.mock('@/services/api', () => ({
  apiKeysApi: { list: vi.fn(async () => []) },
  providersApi: {
    getGeminiKeys: vi.fn(async () => []),
    getCodexConfigs: vi.fn(async () => []),
    getClaudeConfigs: vi.fn(async () => []),
    getOpenAIProviders: vi.fn(async () => []),
  },
  credentialsApi: { list: vi.fn(async () => ({ files: [] })) },
}));

vi.mock('@/stores', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      connectionStatus: 'connected',
      serverVersion: 'v6-test',
      serverBuildDate: '2026-03-08T00:00:49.000Z',
      apiBase: 'http://127.0.0.1:19317',
    }),
  useConfigStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      config: {
        debug: false,
        usageStatisticsEnabled: true,
        loggingToFile: true,
        requestRetry: 0,
        wsAuth: false,
        routingStrategy: '',
      },
    }),
  useModelsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      models: [],
      loading: false,
      fetchModels: mocks.fetchModels,
    }),
}));

describe('DashboardPage', () => {
  it('未显式配置路由策略时回退显示默认轮询', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByText('路由策略')).toBeTruthy();
    expect(screen.getByText('轮询')).toBeTruthy();
  });
});
