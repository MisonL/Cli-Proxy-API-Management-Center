import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VisualConfigEditor } from './VisualConfigEditor';
import { DEFAULT_USAGE_PERSISTENCE_FILE, DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./VisualConfigEditorBlocks', () => ({
  ApiKeysCardEditor: () => null,
  PayloadFilterRulesEditor: () => null,
  PayloadRulesEditor: () => null,
}));

afterEach(() => {
  cleanup();
});

function buildValues(overrides: Partial<typeof DEFAULT_VISUAL_VALUES> = {}) {
  return {
    ...DEFAULT_VISUAL_VALUES,
    streaming: { ...DEFAULT_VISUAL_VALUES.streaming },
    ...overrides,
  };
}

describe('VisualConfigEditor', () => {
  it('开启 usage 持久化时会向上层回传默认路径', () => {
    const onChange = vi.fn();

    render(
      <VisualConfigEditor
        values={buildValues()}
        onChange={onChange}
      />
    );

    fireEvent.click(
      screen.getByLabelText('config_management.visual.sections.system.usage_persistence')
    );

    expect(onChange).toHaveBeenCalledWith({
      usagePersistenceEnabled: true,
      usagePersistenceFile: DEFAULT_USAGE_PERSISTENCE_FILE,
    });
  });

  it('关闭 usage 持久化时会保留用户当前填写的路径', () => {
    const onChange = vi.fn();
    const customPath = '/workspace/usage-backups/manual.json';

    render(
      <VisualConfigEditor
        values={buildValues({
          usagePersistenceEnabled: true,
          usagePersistenceFile: customPath,
        })}
        onChange={onChange}
      />
    );

    expect(
      screen.getByLabelText('config_management.visual.sections.system.usage_persistence_file')
    ).toBeTruthy();

    fireEvent.click(
      screen.getByLabelText('config_management.visual.sections.system.usage_persistence')
    );

    expect(onChange).toHaveBeenCalledWith({
      usagePersistenceEnabled: false,
      usagePersistenceFile: customPath,
    });
  });
});
