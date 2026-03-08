import type { TFunction } from 'i18next';

export type AuthFilesActionKind =
  | 'upload'
  | 'batch-download'
  | 'batch-delete'
  | 'batch-enable'
  | 'batch-disable';

export interface AuthFilesActionFailure {
  name: string;
  message: string;
}

export interface AuthFilesActionFeedback {
  action: AuthFilesActionKind;
  totalCount: number;
  successCount: number;
  failures: AuthFilesActionFailure[];
}

export const normalizeAuthFilesActionError = (
  error: unknown,
  fallback?: string | TFunction
): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  if (typeof fallback === 'function') {
    return (
      fallback('common.unknown_error', {
        defaultValue: 'Unknown error',
      }) || 'Unknown error'
    );
  }
  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback;
  }
  return 'Unknown error';
};

export const collectAuthFilesSettledOutcome = (
  names: string[],
  results: PromiseSettledResult<unknown>[],
  resolveMessage: (reason: unknown) => string
) => {
  const successNames: string[] = [];
  const failures: AuthFilesActionFailure[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successNames.push(names[index] ?? `item-${index + 1}`);
      return;
    }
    failures.push({
      name: names[index] ?? `item-${index + 1}`,
      message: resolveMessage(result.reason),
    });
  });

  return {
    totalCount: names.length,
    successCount: successNames.length,
    successNames,
    failures,
  };
};

export const buildAuthFilesActionFeedback = (
  action: AuthFilesActionKind,
  totalCount: number,
  successCount: number,
  failures: AuthFilesActionFailure[]
): AuthFilesActionFeedback => ({
  action,
  totalCount,
  successCount,
  failures,
});
