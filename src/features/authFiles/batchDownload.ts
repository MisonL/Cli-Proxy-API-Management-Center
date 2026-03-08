import JSZip from 'jszip';

export interface AuthFilesBatchDownloadFailure {
  name: string;
  message: string;
}

export interface AuthFilesBatchDownloadFeedback {
  successCount: number;
  totalCount: number;
  failures: AuthFilesBatchDownloadFailure[];
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

export const createAuthFilesBatchArchive = async (
  names: string[],
  downloadText: (name: string) => Promise<string>,
  createZip: () => ZipArchive = () => new JSZip()
): Promise<{ archive: Blob | null; feedback: AuthFilesBatchDownloadFeedback }> => {
  const uniqueNames = Array.from(new Set(names));
  const zip = createZip();
  const failures: AuthFilesBatchDownloadFailure[] = [];
  let successCount = 0;

  for (const name of uniqueNames) {
    try {
      const text = await downloadText(name);
      zip.file(name, text);
      successCount += 1;
    } catch (error: unknown) {
      failures.push({
        name,
        message: normalizeErrorMessage(error),
      });
    }
  }

  const archive = successCount > 0 ? await zip.generateAsync({ type: 'blob' }) : null;

  return {
    archive,
    feedback: {
      successCount,
      totalCount: uniqueNames.length,
      failures,
    },
  };
};
