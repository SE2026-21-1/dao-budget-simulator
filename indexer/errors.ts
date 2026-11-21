export class IndexerError extends Error {
  constructor(public readonly code: string, message: string, public readonly retryable = false) {
    super(message);
    this.name = 'IndexerError';
  }
}

export function publicError(error: unknown): { code: string; message: string; retryable?: boolean } {
  if (error instanceof IndexerError) {
    return error.retryable
      ? { code: error.code, message: error.message, retryable: true }
      : { code: error.code, message: error.message };
  }
  // Never emit provider response bodies, connection strings or errors containing credentials.
  return { code: 'INDEXER_FAILED', message: 'Indexer operation failed (database or unexpected internal error).' };
}
