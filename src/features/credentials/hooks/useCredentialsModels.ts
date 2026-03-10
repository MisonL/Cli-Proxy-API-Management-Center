import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { credentialsApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { CredentialItem } from '@/types';
import type { CredentialModelItem } from '@/features/credentials/constants';
import { getCredentialStableKey } from '@/features/credentials/constants';

type ModelsError = 'unsupported' | null;

export type UseCredentialsModelsResult = {
  modelsModalOpen: boolean;
  modelsLoading: boolean;
  modelsList: CredentialModelItem[];
  modelsFileName: string;
  modelsFileType: string;
  modelsError: ModelsError;
  showModels: (item: CredentialItem) => Promise<void>;
  closeModelsModal: () => void;
};

export function useCredentialsModels(): UseCredentialsModelsResult {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [modelsModalOpen, setModelsModalOpen] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsList, setModelsList] = useState<CredentialModelItem[]>([]);
  const [modelsFileName, setModelsFileName] = useState('');
  const [modelsFileType, setModelsFileType] = useState('');
  const [modelsError, setModelsError] = useState<ModelsError>(null);
  const modelsCacheRef = useRef<Map<string, CredentialModelItem[]>>(new Map());

  const closeModelsModal = useCallback(() => {
    setModelsModalOpen(false);
  }, []);

  const showModels = useCallback(
    async (item: CredentialItem) => {
      const stableKey = getCredentialStableKey(item);
      setModelsFileName(item.name);
      setModelsFileType(item.type || '');
      setModelsList([]);
      setModelsError(null);
      setModelsModalOpen(true);

      const cached = modelsCacheRef.current.get(stableKey);
      if (cached) {
        setModelsList(cached);
        setModelsLoading(false);
        return;
      }

      setModelsLoading(true);
      try {
        const models = await credentialsApi.getModelsForCredential(item);
        modelsCacheRef.current.set(stableKey, models);
        setModelsList(models);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '';
        if (
          errorMessage.includes('404') ||
          errorMessage.includes('not found') ||
          errorMessage.includes('Not Found')
        ) {
          setModelsError('unsupported');
        } else {
          showNotification(`${t('notification.load_failed')}: ${errorMessage}`, 'error');
        }
      } finally {
        setModelsLoading(false);
      }
    },
    [showNotification, t]
  );

  return {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal
  };
}
