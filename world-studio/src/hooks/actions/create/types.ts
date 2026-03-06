import type { MutableRefObject } from 'react';
import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import type {
  WorldStudioCreateStep,
  WorldStudioSnapshotPatch,
  WorldStudioWorkspaceSnapshot,
} from '../../../contracts.js';
import type {
  DistillRouteBindingMap,
  Phase1Result,
  Phase2Result,
} from '../../../generation/pipeline.js';
import type { SupportedEncoding } from '../../../engine/encoding.js';
import type { LandingState } from '../../../ui/types.js';
import type { useWorldStudioMutations } from '../../use-world-studio-mutations.js';
import type { useWorldStudioResourceQueries } from '../../use-world-studio-queries.js';
import type { WorldStudioTaskController } from '../task-control/types.js';
import type { WorldStudioRuntimeAiClient } from '../../../runtime-ai-client.js';

export type WorldStudioMutations = ReturnType<typeof useWorldStudioMutations>;
export type WorldStudioQueries = ReturnType<typeof useWorldStudioResourceQueries>;

export type StatusBannerInput = {
  kind: 'success' | 'warn' | 'info' | 'error';
  message: string;
};

export type ResolveEffectiveRouteBindingsInput = {
  mode: 'all' | 'failed';
  retryWithFineRoute: boolean;
  runtimeDefaultBinding?: RuntimeRouteBinding | null;
};

export type WorldStudioCreateActionsInput = {
  aiClient: WorldStudioRuntimeAiClient;
  flowId: string;
  sourceEncoding: SupportedEncoding;
  setSourceEncoding: (value: SupportedEncoding) => void;
  sourceMode: 'TEXT' | 'FILE';
  setSourceMode: (value: 'TEXT' | 'FILE') => void;
  setFilePreviewText: (value: string) => void;
  sourceChunksRef: MutableRefObject<string[]>;
  sourceRawTextRef: MutableRefObject<string>;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
  snapshot: WorldStudioWorkspaceSnapshot;
  patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
  patchPanel: (patch: Partial<WorldStudioWorkspaceSnapshot['panel']>) => void;
  setCreateStep: (step: WorldStudioCreateStep) => void;
  setPhase1: (value: Phase1Result | null) => void;
  setPhase2: (value: Phase2Result | null) => void;
  phase1: Phase1Result | null;
  retryConcurrency: number;
  retryErrorCode: string | null;
  retryScope: 'all' | 'json' | 'coarse' | 'fine';
  retryWithFineRoute: boolean;
  resolveEffectiveRouteBindings: (input: ResolveEffectiveRouteBindingsInput) => DistillRouteBindingMap;
  resolveRuntimeDefaultRouteBinding: () => Promise<RuntimeRouteBinding | null>;
  bindingMap: DistillRouteBindingMap;
  runtimeDefaultRouteBinding: RuntimeRouteBinding | null;
  selectedDraftId: string;
  selectedWorldId: string;
  setLanding: (value: LandingState) => void;
  mutations: WorldStudioMutations;
  queries: WorldStudioQueries;
  setStatusBanner: (input: StatusBannerInput) => void;
  setError: (message: string | null) => void;
  setNotice: (message: string | null) => void;
  taskController: WorldStudioTaskController;
};
