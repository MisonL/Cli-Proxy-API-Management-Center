import type { ChangeEvent, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OAuthPage } from './OAuthPage';

const mocks = vi.hoisted(() => ({
  showNotification: vi.fn(),
  startAuth: vi.fn(),
  getAuthStatus: vi.fn(),
  submitCallback: vi.fn(),
  iflowCookieAuth: vi.fn(),
  importCredential: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'nav.oauth': 'OAuth',
        'common.login': '登录',
        'auth_login.codex_oauth_title': 'Codex',
        'auth_login.codex_oauth_hint': 'Codex hint',
        'auth_login.codex_oauth_url_label': 'Codex URL',
        'auth_login.anthropic_oauth_title': 'Anthropic',
        'auth_login.anthropic_oauth_hint': 'Anthropic hint',
        'auth_login.anthropic_oauth_url_label': 'Anthropic URL',
        'auth_login.antigravity_oauth_title': 'Antigravity',
        'auth_login.antigravity_oauth_hint': 'Antigravity hint',
        'auth_login.antigravity_oauth_url_label': 'Antigravity URL',
        'auth_login.gemini_cli_oauth_title': 'Gemini CLI',
        'auth_login.gemini_cli_oauth_hint': 'Gemini CLI hint',
        'auth_login.gemini_cli_oauth_url_label': 'Gemini CLI URL',
        'auth_login.kimi_oauth_title': 'Kimi',
        'auth_login.kimi_oauth_hint': 'Kimi hint',
        'auth_login.kimi_oauth_url_label': 'Kimi URL',
        'auth_login.qwen_oauth_title': 'Qwen',
        'auth_login.qwen_oauth_hint': 'Qwen hint',
        'auth_login.qwen_oauth_url_label': 'Qwen URL',
        'auth_login.gemini_cli_project_id_label': 'Project ID',
        'auth_login.gemini_cli_project_id_hint': 'Optional project ID',
        'auth_login.gemini_cli_project_id_placeholder': 'ALL',
        'auth_login.oauth_callback_label': '回调 URL',
        'auth_login.oauth_callback_hint': '回调提示',
        'auth_login.oauth_callback_placeholder': 'http://localhost/callback',
        'auth_login.oauth_callback_button': '提交回调',
        'auth_login.oauth_callback_required': '请先填写回调 URL',
        'auth_login.oauth_callback_success': '提交成功',
        'auth_login.oauth_callback_error': '提交失败',
        'auth_login.oauth_callback_status_success': '已提交',
        'auth_login.oauth_callback_status_error': '提交失败',
        'auth_login.iflow_cookie_title': 'iFlow Cookie 登录',
        'auth_login.iflow_cookie_hint': 'Cookie 提示',
        'auth_login.iflow_cookie_key_hint': 'Cookie Key 提示',
        'auth_login.iflow_cookie_label': 'Cookie 内容',
        'auth_login.iflow_cookie_placeholder': 'BXAuth=demo;',
        'auth_login.iflow_cookie_button': '提交 Cookie',
        'auth_login.iflow_cookie_required': '请输入 Cookie',
        'auth_login.iflow_cookie_status_success': 'Cookie 成功',
        'auth_login.iflow_cookie_status_error': 'Cookie 失败',
        'auth_login.iflow_cookie_start_error': 'Cookie 提交失败',
        'auth_login.iflow_cookie_status_duplicate': '配置重复',
        'auth_login.iflow_cookie_result_title': 'Cookie 登录结果',
        'auth_login.iflow_cookie_result_email': '账号',
        'auth_login.iflow_cookie_result_expired': '过期时间',
        'auth_login.iflow_cookie_result_credential_id': '凭证 ID',
        'auth_login.iflow_cookie_result_credential_ref': '凭证引用',
        'auth_login.iflow_cookie_result_credential_name': '凭证名',
        'auth_login.iflow_cookie_result_runtime_id': '运行时 ID',
        'auth_login.iflow_cookie_result_type': '类型',
        'vertex_import.title': 'Vertex 导入',
        'vertex_import.description': 'Vertex 描述',
        'vertex_import.location_label': '区域',
        'vertex_import.location_hint': '区域提示',
        'vertex_import.location_placeholder': 'us-central1',
        'vertex_import.file_label': '凭证文件',
        'vertex_import.choose_file': '选择文件',
        'vertex_import.file_placeholder': '未选择文件',
        'vertex_import.file_hint': '文件提示',
        'vertex_import.file_required': '请选择文件',
        'vertex_import.import_button': '导入 Vertex',
        'vertex_import.success': '导入成功',
        'vertex_import.result_title': '导入结果',
        'vertex_import.result_project': '项目 ID',
        'vertex_import.result_email': '服务账号',
        'vertex_import.result_location': '区域',
        'vertex_import.result_credential_id': '凭证 ID',
        'vertex_import.result_credential_ref': '凭证引用',
        'vertex_import.result_credential_name': '凭证名',
        'vertex_import.result_runtime_id': '运行时 ID',
        'notification.upload_failed': '上传失败',
        'notification.link_copied': '复制成功',
        'notification.copy_failed': '复制失败',
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/stores', () => ({
  useNotificationStore: (
    selector?: (state: { showNotification: typeof mocks.showNotification }) => unknown
  ) =>
    selector
      ? selector({ showNotification: mocks.showNotification })
      : { showNotification: mocks.showNotification },
  useThemeStore: (selector: (state: { resolvedTheme: 'light' | 'dark' }) => unknown) =>
    selector({ resolvedTheme: 'light' }),
}));

vi.mock('@/services/api/oauth', () => ({
  oauthApi: {
    startAuth: mocks.startAuth,
    getAuthStatus: mocks.getAuthStatus,
    submitCallback: mocks.submitCallback,
    iflowCookieAuth: mocks.iflowCookieAuth,
  },
}));

vi.mock('@/services/api/vertex', () => ({
  vertexApi: {
    importCredential: mocks.importCredential,
  },
}));

vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: vi.fn(async () => true),
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({
    title,
    extra,
    children,
  }: {
    title: ReactNode;
    extra?: ReactNode;
    children: ReactNode;
  }) => (
    <section>
      <div>{title}</div>
      {extra}
      {children}
    </section>
  ),
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock('@/components/ui/Input', () => ({
  Input: ({
    label,
    value,
    onChange,
    placeholder,
  }: {
    label?: string;
    value?: string;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
  }) => (
    <label>
      <span>{label}</span>
      <input value={value ?? ''} onChange={onChange} placeholder={placeholder} />
    </label>
  ),
}));

describe('OAuthPage', () => {
  beforeEach(() => {
    mocks.showNotification.mockReset();
    mocks.startAuth.mockReset();
    mocks.getAuthStatus.mockReset();
    mocks.submitCallback.mockReset();
    mocks.iflowCookieAuth.mockReset();
    mocks.importCredential.mockReset();
  });

  it('Vertex 导入结果优先显示统一的新凭证字段', async () => {
    mocks.importCredential.mockResolvedValue({
      status: 'ok',
      credential_ref: '/runtime/credentials/vertex-demo.json',
      credential_name: 'vertex-demo.json',
      runtime_id: 'vertex-demo.json',
      project_id: 'demo-project',
      email: 'service@example.com',
      location: 'asia-east1',
    });

    const { container } = render(<OAuthPage />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!fileInput) {
      throw new Error('未找到 Vertex 文件输入框');
    }

    fireEvent.change(fileInput, {
      target: {
        files: [new File(['{}'], 'vertex.json', { type: 'application/json' })],
      },
    });

    fireEvent.click(screen.getByText('导入 Vertex'));

    await waitFor(() => {
      expect(screen.getByText('/runtime/credentials/vertex-demo.json')).toBeTruthy();
    });

    expect(screen.getByText('凭证引用')).toBeTruthy();
    expect(screen.getAllByText('vertex-demo.json').length).toBeGreaterThan(0);
    expect(screen.getByText('service@example.com')).toBeTruthy();
  });

  it('iFlow Cookie 结果不再展示旧保存路径字段', async () => {
    mocks.iflowCookieAuth.mockResolvedValue({
      status: 'ok',
      credential_ref: '/runtime/credentials/iflow-demo.json',
      credential_name: 'iflow-demo.json',
      runtime_id: 'iflow-demo.json',
      email: 'user@example.com',
      expired: '2026-03-09T12:00:00Z',
      type: 'iflow',
    });

    render(<OAuthPage />);

    const cookieInputs = screen.getAllByPlaceholderText('BXAuth=demo;');
    fireEvent.change(cookieInputs[cookieInputs.length - 1], {
      target: { value: 'BXAuth=test;' },
    });
    const submitButtons = screen.getAllByText('提交 Cookie');
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('/runtime/credentials/iflow-demo.json')).toBeTruthy();
    });

    expect(screen.queryByText('保存路径')).toBeNull();
    expect(screen.getAllByText('凭证引用').length).toBeGreaterThan(0);
    expect(screen.getAllByText('iflow-demo.json').length).toBeGreaterThan(0);
  });
});
