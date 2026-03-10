import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { useVisualConfig, getVisualConfigValidationErrors } from './useVisualConfig';
import { DEFAULT_USAGE_PERSISTENCE_FILE, DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';

afterEach(() => {
  cleanup();
});

describe('useVisualConfig', () => {
  it('从 YAML 读取 usage 持久化配置时会正确映射开关与路径', () => {
    const { result } = renderHook(() => useVisualConfig());
    const yaml = `
usage-statistics-enabled: true
usage-persistence-file: /workspace/usage-backups/custom.json
`;

    let loadResult: ReturnType<typeof result.current.loadVisualValuesFromYaml> | undefined;
    act(() => {
      loadResult = result.current.loadVisualValuesFromYaml(yaml);
    });

    expect(loadResult).toEqual({ ok: true });
    expect(result.current.visualValues.usageStatisticsEnabled).toBe(true);
    expect(result.current.visualValues.usagePersistenceEnabled).toBe(true);
    expect(result.current.visualValues.usagePersistenceFile).toBe(
      '/workspace/usage-backups/custom.json'
    );
  });

  it('关闭 usage 持久化后会从生成的 YAML 中移除配置键', () => {
    const { result } = renderHook(() => useVisualConfig());
    const yaml = 'usage-persistence-file: /workspace/usage-backups/custom.json\n';

    act(() => {
      result.current.loadVisualValuesFromYaml(yaml);
    });
    act(() => {
      result.current.setVisualValues({ usagePersistenceEnabled: false });
    });

    const nextYaml = result.current.applyVisualChangesToYaml(yaml);
    const parsed = (parseYaml(nextYaml) as Record<string, unknown>) ?? {};

    expect(parsed['usage-persistence-file']).toBeUndefined();
  });

  it('开启 usage 持久化但路径为空时会回退到默认路径', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({
        usagePersistenceEnabled: true,
        usagePersistenceFile: '',
      });
    });

    const nextYaml = result.current.applyVisualChangesToYaml('');
    const parsed = (parseYaml(nextYaml) as Record<string, unknown>) ?? {};

    expect(parsed['usage-persistence-file']).toBe(DEFAULT_USAGE_PERSISTENCE_FILE);
  });

  it('开启 usage 持久化时要求必须填写路径', () => {
    const errors = getVisualConfigValidationErrors({
      ...DEFAULT_VISUAL_VALUES,
      streaming: { ...DEFAULT_VISUAL_VALUES.streaming },
      usagePersistenceEnabled: true,
      usagePersistenceFile: '',
    });

    expect(errors.usagePersistenceFile).toBe('required_when_enabled');
  });

  it('读取到 retired credentials-dir 时会报错', () => {
    const { result } = renderHook(() => useVisualConfig());

    let loadResult: ReturnType<typeof result.current.loadVisualValuesFromYaml> | undefined;
    act(() => {
      loadResult = result.current.loadVisualValuesFromYaml('credentials-dir: /tmp/legacy-auths\n');
    });

    expect(loadResult).toEqual({
      ok: false,
      error:
        'config key credentials-dir is no longer supported; migrate legacy JSON credentials first and remove credentials-dir',
    });
  });

  it('写回 YAML 时不会重新生成 retired credentials-dir', () => {
    const { result } = renderHook(() => useVisualConfig());

    const nextYaml = result.current.applyVisualChangesToYaml('credentials-dir: /tmp/legacy-auths\n');
    const parsed = (parseYaml(nextYaml) as Record<string, unknown>) ?? {};

    expect(parsed['credentials-dir']).toBeUndefined();
  });
});
