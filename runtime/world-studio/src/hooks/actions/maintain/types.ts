import type {
  EventNodeDraft,
  WorldLorebookDraftRow,
  WorldStudioSnapshotPatch,
  WorldStudioWorkspaceSnapshot,
} from '../../../contracts.js';
import type {
  StatusBannerInput,
  WorldStudioMutations,
  WorldStudioQueries,
} from '../create/types.js';
import type { WorldStudioTaskController } from '../task-control/types.js';

export type WorldStudioMaintainActionContext = {
  flowId: string;
  selectedWorldId: string;
  eventSyncMode: 'merge' | 'replace';
  eventsGraph: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] };
  snapshot: WorldStudioWorkspaceSnapshot;
  patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
  mutations: WorldStudioMutations;
  queries: WorldStudioQueries;
  setStatusBanner: (input: StatusBannerInput) => void;
  setError: (message: string | null) => void;
  setNotice: (message: string | null) => void;
  taskController: WorldStudioTaskController;
};

export type WorldStudioMaintainActionPayload = {
  force?: boolean;
  taskId?: string;
  throwOnError?: boolean;
};

export type WorldStudioMaintainActionResult = {
  nextEditorSnapshotVersion?: string;
  nextLorebooks?: WorldLorebookDraftRow[];
};
