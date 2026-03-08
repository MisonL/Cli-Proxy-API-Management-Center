import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UsagePersistenceStatusPanel } from './UsagePersistenceStatusPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'common.loading': '加载中',
        'common.yes': '是',
        'common.no': '否',
        'usage_stats.persistence_enabled': '已开启持久化',
        'usage_stats.persistence_disabled': '未开启持久化',
        'usage_stats.persistence_file': '持久化文件',
        'usage_stats.persistence_file_exists': '文件存在',
        'usage_stats.persistence_file_size': '文件大小',
        'usage_stats.persistence_last_flush': '最近写盘',
        'usage_stats.persistence_last_load': '最近恢复',
        'usage_stats.persistence_last_load_result': '最近恢复结果',
        'usage_stats.persistence_last_modified': '最近修改',
        'usage_stats.persistence_last_error': '最近错误',
        'usage_stats.persistence_enabled_hint': '已按配置周期自动落盘',
        'usage_stats.persistence_disabled_hint': '当前仍为原版内存模式',
      };
      return translations[key] ?? key;
    },
    i18n: { language: 'zh-CN' },
  }),
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

describe('UsagePersistenceStatusPanel', () => {
  it('在默认模式下渲染持久化状态内容', () => {
    render(
      <UsagePersistenceStatusPanel
        status={{
          enabled: true,
          file_path: '/workspace/usage-backups/usage-statistics.json',
          file_exists: true,
          file_size_bytes: 2048,
          last_flush_at: '2026-03-08T11:00:00.000Z',
          last_load_at: '2026-03-08T10:00:00.000Z',
          last_load_added: 10,
          last_load_skipped: 2,
          last_modified_at: '2026-03-08T11:30:00.000Z',
        }}
      />
    );

    expect(screen.getByText('已开启持久化')).toBeTruthy();
    expect(
      screen.getByText((content) =>
        content.includes('/workspace/usage-backups/usage-statistics.json')
      )
    ).toBeTruthy();
    expect(screen.getByText('+10 / 2')).toBeTruthy();
  });

  it('在隐藏空状态时只展示加载与错误，并支持 footer', () => {
    const { rerender } = render(
      <UsagePersistenceStatusPanel status={null} loading hideWhenEmpty error="boom" />
    );

    expect(screen.getByText('boom')).toBeTruthy();
    expect(screen.getByText('加载中')).toBeTruthy();

    rerender(
      <UsagePersistenceStatusPanel
        status={{
          enabled: false,
          file_exists: false,
        }}
        hideWhenEmpty
        footer={<button>打开使用统计</button>}
      />
    );

    expect(screen.getByText('未开启持久化')).toBeTruthy();
    expect(screen.getByText('打开使用统计')).toBeTruthy();
  });
});
