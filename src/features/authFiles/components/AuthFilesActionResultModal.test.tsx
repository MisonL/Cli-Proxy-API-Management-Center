import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthFilesActionResultModal } from './AuthFilesActionResultModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'auth_files.batch_delete_result_title': '批量删除结果',
        'notification.delete_failed': '删除失败',
        'common.close': '关闭',
      };
      if (key === 'auth_files.batch_result_summary') {
        return `总计 ${options?.total ?? 0} 个，成功 ${options?.success ?? 0} 个`;
      }
      if (key === 'auth_files.batch_delete_partial') {
        return `批量删除完成，成功 ${options?.success ?? 0} 个，失败 ${options?.failed ?? 0} 个`;
      }
      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock('@/components/ui/Modal', () => ({
  Modal: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean;
    title: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
  }) =>
    open ? (
      <div>
        <h1>{title}</h1>
        {children}
        {footer}
      </div>
    ) : null,
}));

describe('AuthFilesActionResultModal', () => {
  it('展示动作失败明细并支持关闭', () => {
    const handleClose = vi.fn();

    render(
      <AuthFilesActionResultModal
        open
        onClose={handleClose}
        result={{
          action: 'batch-delete',
          totalCount: 4,
          successCount: 2,
          failures: [
            { name: 'a.json', message: '403 forbidden' },
            { name: 'b.json', message: 'timeout' },
          ],
        }}
      />
    );

    expect(screen.getByText('批量删除结果')).toBeTruthy();
    expect(screen.getByText('批量删除完成，成功 2 个，失败 2 个')).toBeTruthy();
    expect(screen.getByText('总计 4 个，成功 2 个')).toBeTruthy();
    expect(screen.getByText('a.json')).toBeTruthy();
    expect(screen.getByText('403 forbidden')).toBeTruthy();

    fireEvent.click(screen.getByText('关闭'));
    expect(handleClose).toHaveBeenCalledOnce();
  });
});
