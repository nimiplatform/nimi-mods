import type {
  WorldStudioCreateStep,
  WorldStudioTaskCheckpoint,
  WorldStudioTaskKind,
  WorldStudioTaskRecord,
  WorldStudioWorkspaceSnapshot,
} from '../../../contracts.js';

export type WorldStudioTaskStep = WorldStudioCreateStep | 'MAINTAIN';

export type WorldStudioTaskStartInput = {
  kind: WorldStudioTaskKind;
  label: string;
  atomic: boolean;
  resumable: boolean;
  canPause?: boolean;
  canCancel?: boolean;
  step: WorldStudioTaskStep;
  message?: string | null;
  checkpoint?: Omit<WorldStudioTaskCheckpoint, 'checkpointVersion'> & {
    checkpointVersion?: number;
  };
};

export type WorldStudioTaskControllerInput = {
  snapshot: WorldStudioWorkspaceSnapshot;
  patchSnapshot: (patch: {
    taskState?: Partial<WorldStudioWorkspaceSnapshot['taskState']>;
  }) => void;
  onTaskEvent?: (event: {
    name: 'start' | 'pause' | 'resume' | 'cancel' | 'recover' | 'done' | 'failed';
    taskId: string;
    taskKind: WorldStudioTaskKind;
    checkpointVersion: number | null;
    errorCode?: string | null;
  }) => void;
};

export type WorldStudioTaskRuntimeHandle = {
  taskId: string;
  abortSignal: AbortSignal;
};

export type WorldStudioTaskController = {
  getActiveTask: () => WorldStudioTaskRecord | null;
  getTaskById: (taskId: string) => WorldStudioTaskRecord | null;
  getRecentTasks: () => WorldStudioTaskRecord[];
  getAbortSignal: (taskId: string) => AbortSignal | null;
  startTask: (input: WorldStudioTaskStartInput) => WorldStudioTaskRuntimeHandle | null;
  updateTask: (taskId: string, patch: Partial<WorldStudioTaskRecord>) => void;
  completeTask: (taskId: string, message?: string | null) => void;
  failTask: (taskId: string, error: unknown) => void;
  cancelTask: (taskId: string, message?: string | null) => void;
  pauseTask: (taskId: string, message?: string | null) => void;
  resumeTask: (taskId: string, message?: string | null) => boolean;
  requestPause: (taskId: string) => boolean;
  requestCancel: (taskId: string) => boolean;
  shouldPause: (taskId: string) => boolean;
  shouldCancel: (taskId: string) => boolean;
  waitWhilePaused: (taskId: string) => Promise<'resume' | 'cancel'>;
  setCheckpoint: (
    taskId: string,
    patch: Omit<WorldStudioTaskCheckpoint, 'checkpointVersion'> & { checkpointVersion?: number },
  ) => void;
  setExpertMode: (value: boolean) => void;
};
