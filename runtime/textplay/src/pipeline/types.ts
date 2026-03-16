import type { NarrativeEngineModule } from '../../../../modules/narrative-engine/src/index.js';
import type { TextplayRenderRequest } from '../data/schemas.js';
import type { TextplayLanguage, TextplayNormalizedRenderInput, TextplayPresenceReport, TextplayRenderMeta, TextplayRunEvent, TextplayRunSnapshot, TextplayWarning, } from '../types.js';
import type { TextplayRuntimeAiClient } from '../runtime-ai-client.js';
import { type HookClient, type ModRuntimeClient } from "@nimiplatform/sdk/mod";
export type TextplayPipelineStep = 'received' | 'normalize' | 'filter-visibility' | 'build-prompt' | 'generate' | 'wrap-output' | 'fallback-render' | 'persist-best-effort';
export type TextplayPipelineDependencies = {
    hookClient: HookClient;
    runtimeClient: ModRuntimeClient['route'];
    aiClient: Pick<TextplayRuntimeAiClient, 'generateText'>;
    narrativeEngine: NarrativeEngineModule;
    abortSignal?: AbortSignal;
};
export type TextplayRenderLocale = 'en' | 'zh';
export type TextplayRenderExecutionInput = {
    renderLocale: TextplayRenderLocale;
    storyLanguage: TextplayLanguage;
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
