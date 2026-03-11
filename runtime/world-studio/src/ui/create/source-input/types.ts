import type { ChunkTaskResult, WorldStudioParseJobState } from '../../../contracts.js';

export type SourceEncoding = 'utf-8' | 'gb18030' | 'utf-16le';
export type RetryScope = 'all' | 'json' | 'coarse' | 'fine';

export type SourceInputPanelProps = {
  sourceText: string;
  sourceRef: string;
  sourceMode: 'TEXT' | 'FILE';
  sourceEncoding: SourceEncoding;
  filePreviewText: string;
  parseJob: WorldStudioParseJobState;
  chunkTasks: ChunkTaskResult[];
  onSourceTextChange: (value: string) => void;
  onSourceRefChange: (value: string) => void;
  onSourceEncodingChange: (value: SourceEncoding) => void;
  onSelectSourceFile: (file: File | null) => void;
  onRunPhase1: () => void;
  onRunFailedChunks?: () => void;
  onRunFailedChunksByErrorCode?: (errorCode: string) => void;
  retryWithFineRoute?: boolean;
  onRetryWithFineRouteChange?: (value: boolean) => void;
  retryScope?: RetryScope;
  onRetryScopeChange?: (value: RetryScope) => void;
  retryConcurrency?: number;
  onRetryConcurrencyChange?: (value: number) => void;
  retryErrorCode?: string | null;
  onClearRetryErrorCode?: () => void;
  expertMode?: boolean;
  working: boolean;
};
