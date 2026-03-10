import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { credentialsApi } from '@/services/api';
import type { CredentialItem } from '@/types';
import { useNotificationStore } from '@/stores';
import { formatFileSize } from '@/utils/format';
import { MAX_CREDENTIAL_SIZE } from '@/utils/constants';
import {
  getCredentialStableKey,
  normalizeExcludedModels,
  parseDisableCoolingValue,
  parseExcludedModelsText,
  parsePriorityValue,
} from '@/features/credentials/constants';

export type PrefixProxyEditorField =
  | 'prefix'
  | 'proxyUrl'
  | 'priority'
  | 'excludedModelsText'
  | 'disableCooling'
  | 'websocket';

export type PrefixProxyEditorFieldValue = string | boolean;

export type PrefixProxyEditorState = {
  fileKey: string;
  fileName: string;
  fileTarget: Pick<CredentialItem, 'name' | 'id' | 'runtimeId' | 'platformBacked'>;
  isCodexFile: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  originalText: string;
  rawText: string;
  json: Record<string, unknown> | null;
  prefix: string;
  proxyUrl: string;
  priority: string;
  excludedModelsText: string;
  disableCooling: string;
  websocket: boolean;
};

export type UseCredentialsPrefixProxyEditorOptions = {
  disableControls: boolean;
  loadFiles: () => Promise<boolean>;
  loadKeyStats: () => Promise<void>;
};

export type UseCredentialsPrefixProxyEditorResult = {
  prefixProxyEditor: PrefixProxyEditorState | null;
  prefixProxyUpdatedText: string;
  prefixProxyDirty: boolean;
  openPrefixProxyEditor: (
    file: Pick<CredentialItem, 'name' | 'type' | 'provider' | 'id' | 'runtimeId' | 'platformBacked'>
  ) => Promise<void>;
  closePrefixProxyEditor: () => void;
  handlePrefixProxyChange: (
    field: PrefixProxyEditorField,
    value: PrefixProxyEditorFieldValue
  ) => void;
  handlePrefixProxySave: () => Promise<void>;
};

const buildPrefixProxyUpdatedText = (editor: PrefixProxyEditorState | null): string => {
  if (!editor?.json) return editor?.rawText ?? '';
  const next: Record<string, unknown> = { ...editor.json };
  if ('prefix' in next || editor.prefix.trim()) {
    next.prefix = editor.prefix;
  }
  if ('proxy_url' in next || editor.proxyUrl.trim()) {
    next.proxy_url = editor.proxyUrl;
  }

  const parsedPriority = parsePriorityValue(editor.priority);
  if (parsedPriority !== undefined) {
    next.priority = parsedPriority;
  } else if ('priority' in next) {
    delete next.priority;
  }

  const excludedModels = parseExcludedModelsText(editor.excludedModelsText);
  if (excludedModels.length > 0) {
    next.excluded_models = excludedModels;
  } else if ('excluded_models' in next) {
    delete next.excluded_models;
  }

  const parsedDisableCooling = parseDisableCoolingValue(editor.disableCooling);
  if (parsedDisableCooling !== undefined) {
    next.disable_cooling = parsedDisableCooling;
  } else if ('disable_cooling' in next) {
    delete next.disable_cooling;
  }

  if (editor.isCodexFile) {
    next.websocket = editor.websocket;
  }

  return JSON.stringify(next);
};

export function useCredentialsPrefixProxyEditor(
  options: UseCredentialsPrefixProxyEditorOptions
): UseCredentialsPrefixProxyEditorResult {
  const { disableControls, loadFiles, loadKeyStats } = options;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [prefixProxyEditor, setPrefixProxyEditor] = useState<PrefixProxyEditorState | null>(null);

  const prefixProxyUpdatedText = buildPrefixProxyUpdatedText(prefixProxyEditor);
  const prefixProxyDirty =
    Boolean(prefixProxyEditor?.json) &&
    Boolean(prefixProxyEditor?.originalText) &&
    prefixProxyUpdatedText !== prefixProxyEditor?.originalText;

  const closePrefixProxyEditor = () => {
    setPrefixProxyEditor(null);
  };

  const openPrefixProxyEditor = async (
    file: Pick<CredentialItem, 'name' | 'type' | 'provider' | 'id' | 'runtimeId' | 'platformBacked'>
  ) => {
    const fileKey = getCredentialStableKey(file);
    const name = file.name;
    const normalizedType = String(file.type ?? '')
      .trim()
      .toLowerCase();
    const normalizedProvider = String(file.provider ?? '')
      .trim()
      .toLowerCase();
    const isCodexFile = normalizedType === 'codex' || normalizedProvider === 'codex';

    if (disableControls) return;
    if (prefixProxyEditor?.fileKey === fileKey) {
      setPrefixProxyEditor(null);
      return;
    }

    setPrefixProxyEditor({
      fileKey,
      fileName: name,
      fileTarget: {
        name,
        id: file.id,
        runtimeId: file.runtimeId,
        platformBacked: file.platformBacked,
      },
      isCodexFile,
      loading: true,
      saving: false,
      error: null,
      originalText: '',
      rawText: '',
      json: null,
      prefix: '',
      proxyUrl: '',
      priority: '',
      excludedModelsText: '',
      disableCooling: '',
      websocket: false,
    });

    try {
      const rawText = await credentialsApi.downloadText(file);
      const trimmed = rawText.trim();

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed) as unknown;
      } catch {
        setPrefixProxyEditor((prev) => {
          if (!prev || prev.fileKey !== fileKey) return prev;
          return {
            ...prev,
            loading: false,
            error: t('credentials.prefix_proxy_invalid_json'),
            rawText: trimmed,
            originalText: trimmed,
          };
        });
        return;
      }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setPrefixProxyEditor((prev) => {
          if (!prev || prev.fileKey !== fileKey) return prev;
          return {
            ...prev,
            loading: false,
            error: t('credentials.prefix_proxy_invalid_json'),
            rawText: trimmed,
            originalText: trimmed,
          };
        });
        return;
      }

      const json = { ...(parsed as Record<string, unknown>) };
      if (isCodexFile) {
        const websocketValue = parseDisableCoolingValue(json.websocket);
        json.websocket = websocketValue ?? false;
      }
      const originalText = JSON.stringify(json);
      const prefix = typeof json.prefix === 'string' ? json.prefix : '';
      const proxyUrl = typeof json.proxy_url === 'string' ? json.proxy_url : '';
      const priority = parsePriorityValue(json.priority);
      const excludedModels = normalizeExcludedModels(json.excluded_models);
      const disableCoolingValue = parseDisableCoolingValue(json.disable_cooling);
      const websocketValue = parseDisableCoolingValue(json.websocket);

      setPrefixProxyEditor((prev) => {
        if (!prev || prev.fileKey !== fileKey) return prev;
        return {
          ...prev,
          loading: false,
          originalText,
          rawText: originalText,
          json,
          prefix,
          proxyUrl,
          priority: priority !== undefined ? String(priority) : '',
          excludedModelsText: excludedModels.join('\n'),
          disableCooling:
            disableCoolingValue === undefined ? '' : disableCoolingValue ? 'true' : 'false',
          websocket: websocketValue ?? false,
          error: null,
        };
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.download_failed');
      setPrefixProxyEditor((prev) => {
        if (!prev || prev.fileKey !== fileKey) return prev;
        return { ...prev, loading: false, error: errorMessage, rawText: '' };
      });
      showNotification(`${t('notification.download_failed')}: ${errorMessage}`, 'error');
    }
  };

  const handlePrefixProxyChange = (
    field: PrefixProxyEditorField,
    value: PrefixProxyEditorFieldValue
  ) => {
    setPrefixProxyEditor((prev) => {
      if (!prev) return prev;
      if (field === 'prefix') return { ...prev, prefix: String(value) };
      if (field === 'proxyUrl') return { ...prev, proxyUrl: String(value) };
      if (field === 'priority') return { ...prev, priority: String(value) };
      if (field === 'excludedModelsText') return { ...prev, excludedModelsText: String(value) };
      if (field === 'disableCooling') return { ...prev, disableCooling: String(value) };
      return { ...prev, websocket: Boolean(value) };
    });
  };

  const handlePrefixProxySave = async () => {
    if (!prefixProxyEditor?.json) return;
    if (!prefixProxyDirty) return;

    const name = prefixProxyEditor.fileName;
    const target = prefixProxyEditor.fileTarget;
    const payload = prefixProxyUpdatedText;
    const fileSize = new Blob([payload]).size;
    if (fileSize > MAX_CREDENTIAL_SIZE) {
      showNotification(
        t('credentials.upload_error_size', { maxSize: formatFileSize(MAX_CREDENTIAL_SIZE) }),
        'error'
      );
      return;
    }

    setPrefixProxyEditor((prev) => {
      if (!prev || prev.fileName !== name) return prev;
      return { ...prev, saving: true };
    });

    try {
      await credentialsApi.saveText(target, payload);
      showNotification(t('credentials.prefix_proxy_saved_success', { name }), 'success');
      await loadFiles();
      await loadKeyStats();
      setPrefixProxyEditor(null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.upload_failed')}: ${errorMessage}`, 'error');
      setPrefixProxyEditor((prev) => {
        if (!prev || prev.fileName !== name) return prev;
        return { ...prev, saving: false };
      });
    }
  };

  return {
    prefixProxyEditor,
    prefixProxyUpdatedText,
    prefixProxyDirty,
    openPrefixProxyEditor,
    closePrefixProxyEditor,
    handlePrefixProxyChange,
    handlePrefixProxySave,
  };
}
