import type {
  LocalChatCompiledMediaExecution,
  LocalChatMediaGenerationSpec,
  LocalChatMediaRouteSource,
  LocalChatResolvedMediaRoute,
} from '../../types.js';
import type { MediaPlannerTrigger } from './media-planner.js';

export type MediaIntentSource = LocalChatMediaGenerationSpec['intentSource'];
export type MediaDecisionSource = MediaIntentSource | 'none';
export type MediaDependencyStatus = 'ready' | 'missing' | 'degraded' | 'unknown';
export type MediaExecutionStatus = 'none' | 'blocked' | 'pending' | 'ready' | 'failed';
export type MediaRouteSource = LocalChatMediaRouteSource;

export type PendingMediaIntent = {
  type: 'image' | 'video';
  prompt: string;
  source: MediaIntentSource;
  plannerTrigger: MediaPlannerTrigger;
  plannerConfidence?: number;
  plannerSuggestsNsfw?: boolean;
  pendingMessageId: string;
};

export type PreparedMediaExecution = {
  spec: LocalChatMediaGenerationSpec;
  specHash: string;
  compiled: LocalChatCompiledMediaExecution;
  pendingMessageId: string;
};

export type MediaPromptTracePatch = {
  plannerUsed: boolean;
  plannerKind: 'none' | 'image' | 'video';
  plannerTrigger: MediaPlannerTrigger;
  plannerConfidence: number | null;
  plannerBlockedReason: string | null;
  mediaDecisionSource: MediaDecisionSource;
  mediaDecisionKind: 'none' | 'image' | 'video';
  mediaExecutionStatus: MediaExecutionStatus;
  mediaExecutionRouteSource: MediaRouteSource | null;
  mediaExecutionRouteModel: string | null;
  mediaExecutionReason: string | null;
  mediaSpecHash: string | null;
  mediaCompilerRevision: string | null;
  mediaRouteResolvedBy: LocalChatResolvedMediaRoute['resolvedBy'] | null;
  mediaCacheStatus: 'none' | 'hit' | 'miss' | null;
  mediaShadowText: string | null;
};

export type MediaExecutionDecision =
  | {
      kind: 'none';
      promptTracePatch: MediaPromptTracePatch;
    }
  | {
      kind: 'blocked';
      intent: PendingMediaIntent;
      prepared: PreparedMediaExecution;
      blockedReason: string;
      routeSource: MediaRouteSource;
      resolvedRoute: LocalChatResolvedMediaRoute | null;
      promptTracePatch: MediaPromptTracePatch;
    }
  | {
      kind: 'execute';
      intent: PendingMediaIntent;
      prepared: PreparedMediaExecution;
      resolvedRoute: LocalChatResolvedMediaRoute;
      promptTracePatch: MediaPromptTracePatch;
    };

export function createDefaultMediaPromptTracePatch(): MediaPromptTracePatch {
  return {
    plannerUsed: false,
    plannerKind: 'none',
    plannerTrigger: 'none',
    plannerConfidence: null,
    plannerBlockedReason: null,
    mediaDecisionSource: 'none',
    mediaDecisionKind: 'none',
    mediaExecutionStatus: 'none',
    mediaExecutionRouteSource: null,
    mediaExecutionRouteModel: null,
    mediaExecutionReason: null,
    mediaSpecHash: null,
    mediaCompilerRevision: null,
    mediaRouteResolvedBy: null,
    mediaCacheStatus: null,
    mediaShadowText: null,
  };
}
