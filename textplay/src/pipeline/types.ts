import type { ModAiClient } from '@nimiplatform/sdk/mod/ai';
import type { HookClient } from '@nimiplatform/sdk/mod/types';
import type { NarrativeEngineModule } from '../../../narrative-engine/src/index.js';
import type { TextplayRenderRequest } from '../data/schemas.js';
import type {
  TextplayNormalizedRenderInput,
  TextplayPresenceReport,
  TextplayRenderMeta,
  TextplayRunEvent,
  TextplayRunSnapshot,
  TextplayWarning,
} from '../types.js';

export type TextplayPipelineStep =
  | 'received'
  | 'normalize'
  | 'filter-visibility'
  | 'build-prompt'
  | 'generate'
  | 'wrap-output'
  | 'fallback-render'
  | 'persist-best-effort';

export type TextplayPipelineDependencies = {
  hookClient: HookClient;
  aiClient: Pick<ModAiClient, 'generateText'>;
  narrativeEngine: NarrativeEngineModule;
  abortSignal?: AbortSignal;
};

export type TextplayRenderExecutionInput = {
  request: TextplayRenderRequest;
  deps: TextplayPipelineDependencies;
  presenceReports: TextplayPresenceReport[];
  resumeSnapshot?: {
    checkpointToken: string;
    stepInputHash: string;
    lastCompletedUnit: string;
  };
};

export type TextplayPipelineMutableState = {
  runEvents: TextplayRunEvent[];
  runSnapshot: TextplayRunSnapshot;
  warnings: TextplayWarning[];
  checkpointToken: string;
  stepInputHash: string;
  lastCompletedUnit: string;
};

export type TextplayGenerateResult = {
  text: string;
  promptTraceId: string;
  route: {
    source: string;
    connectorId: string;
    model: string;
    provider: string;
    endpoint: string;
  };
};

export type TextplayWrapOutputInput = {
  normalized: TextplayNormalizedRenderInput;
  generated: TextplayGenerateResult;
  sourceEventIds: string[];
  presenceReports: TextplayPresenceReport[];
  warnings: TextplayWarning[];
  runSnapshot: TextplayRunSnapshot;
};

export type TextplayWrapOutputResult = {
  text: string;
  meta: TextplayRenderMeta;
};
