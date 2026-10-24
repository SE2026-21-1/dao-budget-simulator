export type ContractRole = 'governor' | 'timelock' | 'treasury' | 'budget_token';
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface ContractConfig {
  role: ContractRole;
  address: string;
  deploymentBlock: bigint;
  abiVersion: string;
}

export interface IndexerConfig {
  rpcUrl: string;
  chainId: bigint;
  deploymentId: string;
  fromBlock: bigint;
  toBlock: bigint | 'latest';
  batchSize: bigint;
  contracts: ContractConfig[];
  /** Number of following blocks required; BE03 defaults to 2. */
  confirmations?: number;
}

export interface BlockHeader {
  number: bigint;
  hash: string;
  parentHash: string;
  timestamp: bigint;
  transactions: string[];
}

export interface NormalizedLog {
  contract: ContractConfig;
  blockNumber: bigint;
  blockHash: string;
  transactionHash: string;
  transactionIndex: bigint;
  logIndex: bigint;
  topics: string[];
  data: string;
  rawLog: JsonObject;
}

export type DecodeResult =
  | { status: 'decoded'; eventName: string; payload: JsonObject; abiVersion: string }
  | { status: 'unknown_topic'; code: 'UNKNOWN_TOPIC'; message: string; abiVersion: string }
  | { status: 'decode_error'; code: 'DECODE_ERROR'; message: string; abiVersion: string };

export interface DecodedLog {
  log: NormalizedLog;
  decode: DecodeResult;
}

export interface LogBatch {
  fromBlock: bigint;
  toBlock: bigint;
  blocks: BlockHeader[];
  logs: DecodedLog[];
  scannedSources?: string[];
}

export interface Checkpoint {
  number: bigint;
  hash: string;
}

export interface DecodeIssue {
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
  code: string;
  abiVersion: string;
}

export interface SyncStorage {
  loadCheckpoint(config: IndexerConfig): Promise<Checkpoint | null>;
  writeCheckpointBatch(config: IndexerConfig, batch: LogBatch, expected: Checkpoint | null, head: bigint): Promise<WriteResult>;
  decodeIssues(config: IndexerConfig, at?: bigint): Promise<{ unknownTopics: number; decodeErrors: number; issues?: DecodeIssue[] }>;
}

export interface WriteResult {
  insertedBlocks: number;
  insertedEvents: number;
  duplicateEvents: number;
}

export interface BatchStorage {
  writeBatch(config: IndexerConfig, batch: LogBatch): Promise<WriteResult>;
}
