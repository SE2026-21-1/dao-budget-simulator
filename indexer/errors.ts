export class IndexerError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'IndexerError';
  }
}

export function publicError(error: unknown): { code: string; message: string } {
  if (error instanceof IndexerError) return { code: error.code, message: error.message };
  // Never emit provider response bodies, connection strings or errors containing credentials.
  return { code: 'INDEXER_FAILED', message: 'Indexer operation failed (database or unexpected internal error).' };
}
