import type { TFunction } from 'i18next';

export type CredentialsActionKind =
  | 'upload'
  | 'batch-download'
  | 'batch-delete'
  | 'batch-enable'
  | 'batch-disable';

export interface CredentialsActionFailure {
  name: string;
  message: string;
}

export interface CredentialsActionFeedback {
  action: CredentialsActionKind;
  totalCount: number;
  successCount: number;
  failures: CredentialsActionFailure[];
}

export const normalizeCredentialsActionError = (
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

export const collectCredentialsSettledOutcome = (
  names: string[],
  results: PromiseSettledResult<unknown>[],
  resolveMessage: (reason: unknown) => string
) => {
  const successNames: string[] = [];
  const failures: CredentialsActionFailure[] = [];

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

export const buildCredentialsActionFeedback = (
  action: CredentialsActionKind,
  totalCount: number,
  successCount: number,
  failures: CredentialsActionFailure[]
): CredentialsActionFeedback => ({
  action,
  totalCount,
  successCount,
  failures,
});
