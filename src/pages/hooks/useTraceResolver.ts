import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { platformApi, type RequestTraceEvent } from '@/services/api/platform';
import type { ParsedLogLine } from './logTypes';

const TRACEABLE_EXACT_PATHS = new Set([
  '/v1/chat/completions',
  '/v1/completions',
  '/v1/messages',
  '/v1/responses',
]);
const TRACEABLE_PREFIX_PATHS = ['/v1beta/models', '/api/provider/'];

const normalizeTracePath = (value?: string) =>
  String(value ?? '')
    .replace(/^"+|"+$/g, '')
    .split('?')[0]
    .trim();

const normalizeTraceablePath = (value?: string): string => {
  const normalized = normalizeTracePath(value);
  if (!normalized || normalized === '/') return normalized;
  return normalized.replace(/\/+$/, '');
};

export const isTraceableRequestPath = (value?: string): boolean => {
  const normalizedPath = normalizeTraceablePath(value);
  if (!normalizedPath) return false;
  if (TRACEABLE_EXACT_PATHS.has(normalizedPath)) return true;
  return TRACEABLE_PREFIX_PATHS.some((prefix) => normalizedPath.startsWith(prefix));
};

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err !== 'object' || err === null) return '';
  if (!('message' in err)) return '';

  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
};

interface UseTraceResolverOptions {
  connectionStatus: string;
  requestLogDownloading: boolean;
}

interface UseTraceResolverReturn {
  traceLogLine: ParsedLogLine | null;
  traceLoading: boolean;
  traceError: string;
  traceEvents: RequestTraceEvent[];
  loadTraceUsageDetails: () => Promise<void>;
  refreshTraceUsageDetails: () => Promise<void>;
  openTraceModal: (line: ParsedLogLine) => void;
  closeTraceModal: () => void;
}

export function useTraceResolver(options: UseTraceResolverOptions): UseTraceResolverReturn {
  const { connectionStatus, requestLogDownloading } = options;
  const { t } = useTranslation();
  const [traceLogLine, setTraceLogLine] = useState<ParsedLogLine | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState('');
  const [traceEvents, setTraceEvents] = useState<RequestTraceEvent[]>([]);

  const loadTraceByRequestID = useCallback(
    async (requestID: string) => {
      const trimmed = String(requestID ?? '').trim();
      if (!trimmed) {
        setTraceEvents([]);
        setTraceError(t('logs.trace_request_id_missing'));
        return;
      }

      setTraceLoading(true);
      setTraceError('');
      try {
        const response = await platformApi.getTraceByRequestID(trimmed);
        setTraceEvents(Array.isArray(response?.items) ? response.items : []);
      } catch (err: unknown) {
        setTraceEvents([]);
        setTraceError(getErrorMessage(err) || t('logs.trace_usage_load_error'));
      } finally {
        setTraceLoading(false);
      }
    },
    [t]
  );

  const loadTraceUsageDetails = useCallback(async () => {
    await loadTraceByRequestID(traceLogLine?.requestId ?? '');
  }, [loadTraceByRequestID, traceLogLine?.requestId]);

  const refreshTraceUsageDetails = useCallback(async () => {
    await loadTraceByRequestID(traceLogLine?.requestId ?? '');
  }, [loadTraceByRequestID, traceLogLine?.requestId]);

  useEffect(() => {
    if (connectionStatus === 'connected') {
      setTraceLoading(false);
      setTraceError('');
      setTraceEvents([]);
    }
  }, [connectionStatus]);

  const openTraceModal = useCallback(
    (line: ParsedLogLine) => {
      if (!isTraceableRequestPath(line.path)) return;
      setTraceLogLine(line);
      setTraceEvents([]);
      setTraceError('');
      if (!line.requestId) {
        setTraceError(t('logs.trace_request_id_missing'));
        return;
      }
      void loadTraceByRequestID(line.requestId);
    },
    [loadTraceByRequestID, t]
  );

  const closeTraceModal = useCallback(() => {
    if (requestLogDownloading) return;
    setTraceLogLine(null);
    setTraceEvents([]);
    setTraceError('');
  }, [requestLogDownloading]);

  return {
    traceLogLine,
    traceLoading,
    traceError,
    traceEvents,
    loadTraceUsageDetails,
    refreshTraceUsageDetails,
    openTraceModal,
    closeTraceModal,
  };
}
