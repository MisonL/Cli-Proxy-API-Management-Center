import JSZip from 'jszip';

export interface CredentialsBatchDownloadFailure {
  name: string;
  message: string;
}

export interface CredentialsBatchDownloadFeedback {
  successCount: number;
  totalCount: number;
  failures: CredentialsBatchDownloadFailure[];
}

export interface CredentialsBatchDownloadProgress {
  completed: number;
  total: number;
  successCount: number;
  failureCount: number;
}

export interface CredentialsBatchArchiveItem<TTarget = string> {
  archiveName: string;
  target: TTarget;
  label?: string;
}

export interface CredentialsBatchDownloadOptions {
  onProgress?: (progress: CredentialsBatchDownloadProgress) => void;
  concurrency?: number;
}

type ZipArchive = {
  file: (name: string, data: string) => void;
  generateAsync: (options: { type: 'blob' }) => Promise<Blob>;
};

const normalizeErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return 'Unknown error';
};

const buildArchiveName = (name: string, seen: Map<string, number>) => {
  const current = seen.get(name) ?? 0;
  seen.set(name, current + 1);
  if (current === 0) return name;

  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0) {
    return `${name} (${current + 1})`;
  }
  const base = name.slice(0, dotIndex);
  const ext = name.slice(dotIndex);
  return `${base} (${current + 1})${ext}`;
};

export const createCredentialsBatchArchive = async <TTarget = string>(
  items: CredentialsBatchArchiveItem<TTarget>[],
  downloadText: (target: TTarget) => Promise<string>,
  createZip: () => ZipArchive = () => new JSZip(),
  options: CredentialsBatchDownloadOptions = {}
): Promise<{ archive: Blob | null; feedback: CredentialsBatchDownloadFeedback }> => {
  const zip = createZip();
  const failures: CredentialsBatchDownloadFailure[] = [];
  let successCount = 0;
  const usedArchiveNames = new Map<string, number>();
  const totalCount = items.length;
  let completed = 0;
  const reportProgress = () => {
    options.onProgress?.({
      completed,
      total: totalCount,
      successCount,
      failureCount: failures.length,
    });
  };
  reportProgress();

  const concurrency =
    totalCount === 0
      ? 0
      : Math.min(Math.max(options.concurrency ?? 1, 1), totalCount);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= totalCount) return;
      const item = items[currentIndex];
      try {
        const text = await downloadText(item.target);
        zip.file(buildArchiveName(item.archiveName, usedArchiveNames), text);
        successCount += 1;
      } catch (error: unknown) {
        failures.push({
          name: item.label ?? item.archiveName,
          message: normalizeErrorMessage(error),
        });
      } finally {
        completed += 1;
        reportProgress();
      }
    }
  };

  if (concurrency > 0) {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  }

  const archive = successCount > 0 ? await zip.generateAsync({ type: 'blob' }) : null;

  return {
    archive,
    feedback: {
      successCount,
      totalCount,
      failures,
    },
  };
};
