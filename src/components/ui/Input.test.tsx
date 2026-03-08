import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  it('默认补齐可关联的 name 属性', () => {
    render(<Input label="管理密钥" type="password" />);

    const input = screen.getByLabelText('管理密钥');
    expect(input.getAttribute('id')).toBeTruthy();
    expect(input.getAttribute('name')).toBeTruthy();
  });

  it('保留显式传入的 name', () => {
    render(<Input label="地址" name="api-base" />);

    expect(screen.getByLabelText('地址').getAttribute('name')).toBe('api-base');
  });
});
