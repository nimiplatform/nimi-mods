import { useCallback, useEffect, useRef } from 'react';
import type { WorldStudioTaskCheckpoint, WorldStudioTaskRecord } from '../../../contracts.js';
import { worldStudioMessage } from '../../../i18n/messages.js';
import { ensureTaskStatusTransition, isTaskTerminalStatus } from './state-machine.js';
import type {
  WorldStudioTaskController,
  WorldStudioTaskControllerInput,
  WorldStudioTaskRuntimeHandle,
  WorldStudioTaskStartInput,
} from './types.js';

type TaskRuntimeRecord = {
  abortController: AbortController;
  pauseRequested: boolean;
  cancelRequested: boolean;
  waiters: Set<(result: 'resume' | 'cancel') => void>;
};

const RECENT_TASK_LIMIT = 20;

function createTaskId(kind: string): string {
  return `world-studio-task:${kind}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toErrorParts(error: unknown): { message: string; code: string | null } {
  const message = String(
    error && typeof error === 'object' && 'message' in error
      ? (error as { message?: unknown }).message || ''
      : error || '',
  ).trim();
  const codeMatch = message.match(/[A-Z][A-Z0-9_]{2,}/);
  return {
    message: message || worldStudioMessage('task.taskFailed', 'Task failed'),
    code: codeMatch ? codeMatch[0] : null,
  };
}

function mergeRecentTasks(
  recentTasks: WorldStudioTaskRecord[],
  task: WorldStudioTaskRecord,
): WorldStudioTaskRecord[] {
  return [task, ...recentTasks.filter((item) => item.id !== task.id)].slice(0, RECENT_TASK_LIMIT);
}

export function useWorldStudioTaskController(
  input: WorldStudioTaskControllerInput,
): WorldStudioTaskController {
  const runtimesRef = useRef<Map<string, TaskRuntimeRecord>>(new Map());
  const snapshotRef = useRef(input.snapshot);
  const patchSnapshotRef = useRef(input.patchSnapshot);
  const recoveredEventTaskIdRef = useRef('');
  snapshotRef.current = input.snapshot;
  patchSnapshotRef.current = input.patchSnapshot;

  const getActiveTask = useCallback(() => {
    return snapshotRef.current.taskState.activeTask;
  }, []);

  const getTaskById = useCallback((taskId: string): WorldStudioTaskRecord | null => {
    const normalizedTaskId = String(taskId || '').trim();
    if (!normalizedTaskId) return null;
    const activeTask = snapshotRef.current.taskState.activeTask;
    if (activeTask?.id === normalizedTaskId) return activeTask;
    return snapshotRef.current.taskState.recentTasks.find((item) => item.id === normalizedTaskId) || null;
  }, []);

  const getRecentTasks = useCallback(() => {
    return snapshotRef.current.taskState.recentTasks;
  }, []);

  const ensureRuntimeRecord = useCallback((taskId: string): TaskRuntimeRecord => {
    const existing = runtimesRef.current.get(taskId);
    if (existing) return existing;
    const created: TaskRuntimeRecord = {
      abortController: new AbortController(),
      pauseRequested: false,
      cancelRequested: false,
      waiters: new Set(),
    };
    runtimesRef.current.set(taskId, created);
    return created;
  }, []);

  const releaseRuntimeRecord = useCallback((taskId: string) => {
    const runtime = runtimesRef.current.get(taskId);
    if (!runtime) return;
    runtime.waiters.forEach((resolver) => resolver('cancel'));
    runtime.waiters.clear();
    runtimesRef.current.delete(taskId);
  }, []);

  const emitTaskEvent = useCallback((event: {
    name: 'start' | 'pause' | 'resume' | 'cancel' | 'recover' | 'done' | 'failed';
    task: WorldStudioTaskRecord;
    errorCode?: string | null;
  }) => {
    if (!input.onTaskEvent) return;
    input.onTaskEvent({
      name: event.name,
      taskId: event.task.id,
      taskKind: event.task.kind,
      checkpointVersion: event.task.checkpoint?.checkpointVersion || null,
      errorCode: event.errorCode,
    });
  }, [input]);

  useEffect(() => {
    const activeTask = input.snapshot.taskState.activeTask;
    if (!activeTask) return;
    if (activeTask.status !== 'PAUSED') return;
    if (!String(activeTask.message || '').includes('Recovered after reload')) return;
    if (recoveredEventTaskIdRef.current === activeTask.id) return;
    recoveredEventTaskIdRef.current = activeTask.id;
    emitTaskEvent({
      name: 'recover',
      task: activeTask,
    });
  }, [emitTaskEvent, input.snapshot.taskState.activeTask]);

  const getAbortSignal = useCallback((taskId: string): AbortSignal | null => {
    const task = getTaskById(taskId);
    if (!task) return null;
    return ensureRuntimeRecord(task.id).abortController.signal;
  }, [ensureRuntimeRecord, getTaskById]);

  const updateTask = useCallback((taskId: string, patch: Partial<WorldStudioTaskRecord>) => {
    const active = snapshotRef.current.taskState.activeTask;
    if (!active || active.id !== taskId) return;
    const nextStatus = patch.status
      ? ensureTaskStatusTransition(active.status, patch.status)
      : active.status;
    const nextTask: WorldStudioTaskRecord = {
      ...active,
      ...patch,
      status: nextStatus,
      updatedAt: nowIso(),
    };
    patchSnapshotRef.current({
      taskState: {
        activeTask: nextTask,
      },
    });
  }, []);

  const finalizeTask = useCallback((taskId: string, patch: {
    status: 'CANCELED' | 'FAILED' | 'COMPLETED';
    message?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }) => {
    const active = snapshotRef.current.taskState.activeTask;
    if (!active || active.id !== taskId) return;
    const nextStatus = ensureTaskStatusTransition(active.status, patch.status);
    const finalTask: WorldStudioTaskRecord = {
      ...active,
      status: nextStatus,
      canPause: false,
      canResume: false,
      canCancel: false,
      progress: nextStatus === 'COMPLETED' ? 1 : active.progress,
      message: patch.message ?? active.message,
      errorCode: patch.errorCode ?? active.errorCode,
      errorMessage: patch.errorMessage ?? active.errorMessage,
      updatedAt: nowIso(),
      finishedAt: nowIso(),
    };
    releaseRuntimeRecord(taskId);
    patchSnapshotRef.current({
      taskState: {
        activeTask: null,
        recentTasks: mergeRecentTasks(snapshotRef.current.taskState.recentTasks, finalTask),
      },
    });
    if (nextStatus === 'COMPLETED') {
      emitTaskEvent({
        name: 'done',
        task: finalTask,
      });
    } else if (nextStatus === 'FAILED') {
      emitTaskEvent({
        name: 'failed',
        task: finalTask,
        errorCode: patch.errorCode || null,
      });
    } else if (nextStatus === 'CANCELED') {
      emitTaskEvent({
        name: 'cancel',
        task: finalTask,
      });
    }
  }, [emitTaskEvent, releaseRuntimeRecord]);

  const startTask = useCallback((taskInput: WorldStudioTaskStartInput): WorldStudioTaskRuntimeHandle | null => {
    const active = snapshotRef.current.taskState.activeTask;
    if (active && !isTaskTerminalStatus(active.status)) return null;
    const now = nowIso();
    const taskId = createTaskId(taskInput.kind);
    const runtime = ensureRuntimeRecord(taskId);
    const checkpoint: WorldStudioTaskCheckpoint | null = taskInput.checkpoint
      ? {
        checkpointVersion: Math.max(1, Number(taskInput.checkpoint.checkpointVersion) || 1),
        step: taskInput.checkpoint.step,
        chunkTotal: taskInput.checkpoint.chunkTotal,
        chunkCompleted: taskInput.checkpoint.chunkCompleted,
        chunkFailed: taskInput.checkpoint.chunkFailed,
        payload: taskInput.checkpoint.payload,
      }
      : null;
    const nextTask: WorldStudioTaskRecord = {
      id: taskId,
      kind: taskInput.kind,
      status: 'RUNNING',
      label: taskInput.label,
      atomic: taskInput.atomic,
      resumable: taskInput.resumable,
      canPause: Boolean(taskInput.canPause),
      canResume: false,
      canCancel: taskInput.canCancel !== false,
      progress: 0,
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
      message: taskInput.message || null,
      errorMessage: null,
      errorCode: null,
      checkpoint,
    };
    patchSnapshotRef.current({
      taskState: {
        activeTask: nextTask,
      },
    });
    emitTaskEvent({
      name: 'start',
      task: nextTask,
    });
    return {
      taskId,
      abortSignal: runtime.abortController.signal,
    };
  }, [emitTaskEvent, ensureRuntimeRecord]);

  const completeTask = useCallback((taskId: string, message?: string | null) => {
    finalizeTask(taskId, {
      status: 'COMPLETED',
      message: message || worldStudioMessage('task.taskCompleted', 'Task completed'),
    });
  }, [finalizeTask]);

  const failTask = useCallback((taskId: string, error: unknown) => {
    const parsed = toErrorParts(error);
    finalizeTask(taskId, {
      status: 'FAILED',
      message: parsed.message,
      errorCode: parsed.code,
      errorMessage: parsed.message,
    });
  }, [finalizeTask]);

  const cancelTask = useCallback((taskId: string, message?: string | null) => {
    finalizeTask(taskId, {
      status: 'CANCELED',
      message: message || worldStudioMessage('task.taskCanceled', 'Task canceled'),
      errorCode: 'WORLD_STUDIO_TASK_CANCELED',
      errorMessage: message || worldStudioMessage('task.taskCanceled', 'Task canceled'),
    });
  }, [finalizeTask]);

  const pauseTask = useCallback((taskId: string, message?: string | null) => {
    const active = snapshotRef.current.taskState.activeTask;
    if (!active || active.id !== taskId) return;
    updateTask(taskId, {
      status: 'PAUSED',
      canPause: false,
      canResume: true,
      canCancel: true,
      message: message || worldStudioMessage('task.taskPaused', 'Task paused'),
    });
    emitTaskEvent({
      name: 'pause',
      task: {
        ...active,
        status: 'PAUSED',
      },
    });
  }, [emitTaskEvent, updateTask]);

  const resumeTask = useCallback((taskId: string, message?: string | null) => {
    const active = snapshotRef.current.taskState.activeTask;
    if (!active || active.id !== taskId) return false;
    const runtime = ensureRuntimeRecord(taskId);
    runtime.pauseRequested = false;
    updateTask(taskId, {
      status: 'RUNNING',
      canPause: true,
      canResume: false,
      canCancel: true,
      message: message || worldStudioMessage('task.taskResumed', 'Task resumed'),
    });
    runtime.waiters.forEach((resolver) => resolver('resume'));
    runtime.waiters.clear();
    emitTaskEvent({
      name: 'resume',
      task: {
        ...active,
        status: 'RUNNING',
      },
    });
    return true;
  }, [emitTaskEvent, ensureRuntimeRecord, updateTask]);

  const requestPause = useCallback((taskId: string) => {
    const active = snapshotRef.current.taskState.activeTask;
    if (!active || active.id !== taskId) return false;
    if (!active.canPause) return false;
    const runtime = ensureRuntimeRecord(taskId);
    runtime.pauseRequested = true;
    updateTask(taskId, {
      status: 'PAUSE_REQUESTED',
      canPause: false,
      canResume: false,
      canCancel: true,
      message: worldStudioMessage('task.pauseRequested', 'Pause requested'),
    });
    return true;
  }, [ensureRuntimeRecord, updateTask]);

  const requestCancel = useCallback((taskId: string) => {
    const active = snapshotRef.current.taskState.activeTask;
    if (!active || active.id !== taskId) return false;
    if (!active.canCancel) return false;
    const runtime = ensureRuntimeRecord(taskId);
    runtime.cancelRequested = true;
    runtime.abortController.abort();
    updateTask(taskId, {
      status: 'CANCEL_REQUESTED',
      canPause: false,
      canResume: false,
      canCancel: false,
      message: worldStudioMessage('task.cancelRequested', 'Cancel requested'),
    });
    runtime.waiters.forEach((resolver) => resolver('cancel'));
    runtime.waiters.clear();
    return true;
  }, [ensureRuntimeRecord, updateTask]);

  const shouldPause = useCallback((taskId: string) => {
    const runtime = runtimesRef.current.get(taskId);
    return Boolean(runtime?.pauseRequested);
  }, []);

  const shouldCancel = useCallback((taskId: string) => {
    const runtime = runtimesRef.current.get(taskId);
    return Boolean(runtime?.cancelRequested);
  }, []);

  const waitWhilePaused = useCallback(async (taskId: string): Promise<'resume' | 'cancel'> => {
    const runtime = ensureRuntimeRecord(taskId);
    if (!runtime.pauseRequested) return 'resume';
    pauseTask(taskId, worldStudioMessage('task.taskPausedResume', 'Task paused. Resume to continue.'));
    return await new Promise<'resume' | 'cancel'>((resolve) => {
      runtime.waiters.add(resolve);
    });
  }, [ensureRuntimeRecord, pauseTask]);

  const setCheckpoint = useCallback((taskId: string, patch: Omit<WorldStudioTaskCheckpoint, 'checkpointVersion'> & {
    checkpointVersion?: number;
  }) => {
    const active = snapshotRef.current.taskState.activeTask;
    if (!active || active.id !== taskId) return;
    const previousVersion = active.checkpoint?.checkpointVersion || 0;
    updateTask(taskId, {
      checkpoint: {
        checkpointVersion: Math.max(previousVersion + 1, Number(patch.checkpointVersion) || previousVersion + 1),
        step: patch.step,
        chunkTotal: patch.chunkTotal,
        chunkCompleted: patch.chunkCompleted,
        chunkFailed: patch.chunkFailed,
        payload: patch.payload,
      },
    });
  }, [updateTask]);

  const setExpertMode = useCallback((value: boolean) => {
    patchSnapshotRef.current({
      taskState: {
        expertMode: value,
      },
    });
  }, []);

  return {
    getActiveTask,
    getTaskById,
    getRecentTasks,
    getAbortSignal,
    startTask,
    updateTask,
    completeTask,
    failTask,
    cancelTask,
    pauseTask,
    resumeTask,
    requestPause,
    requestCancel,
    shouldPause,
    shouldCancel,
    waitWhilePaused,
    setCheckpoint,
    setExpertMode,
  };
}
