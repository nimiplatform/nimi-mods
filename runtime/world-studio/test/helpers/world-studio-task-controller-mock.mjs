function nowIso() {
  return new Date().toISOString();
}

function toTaskId(kind) {
  return `world-studio-task:${String(kind || 'task')}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function toRuntimeRecord() {
  return {
    abortController: new AbortController(),
    pauseRequested: false,
    cancelRequested: false,
  };
}

function toErrorParts(error) {
  const message = String(
    error && typeof error === 'object' && 'message' in error
      ? error.message || ''
      : error || '',
  ).trim();
  const codeMatch = message.match(/[A-Z][A-Z0-9_]{2,}/);
  return {
    message: message || 'Task failed',
    code: codeMatch ? codeMatch[0] : null,
  };
}

function isTerminalStatus(status) {
  return status === 'CANCELED' || status === 'FAILED' || status === 'COMPLETED';
}

export function createMockTaskController() {
  let activeTask = null;
  let expertMode = false;
  const recentTasks = [];
  const runtimes = new Map();

  function getRuntime(taskId) {
    const runtime = runtimes.get(taskId);
    if (runtime) return runtime;
    const created = toRuntimeRecord();
    runtimes.set(taskId, created);
    return created;
  }

  function finalizeTask(taskId, patch) {
    if (!activeTask || activeTask.id !== taskId) return;
    const finalTask = {
      ...activeTask,
      status: patch.status,
      canPause: false,
      canResume: false,
      canCancel: false,
      progress: patch.status === 'COMPLETED' ? 1 : activeTask.progress,
      message: patch.message ?? activeTask.message,
      errorCode: patch.errorCode ?? activeTask.errorCode,
      errorMessage: patch.errorMessage ?? activeTask.errorMessage,
      updatedAt: nowIso(),
      finishedAt: nowIso(),
    };
    activeTask = null;
    recentTasks.unshift(finalTask);
    if (recentTasks.length > 20) recentTasks.length = 20;
    runtimes.delete(taskId);
  }

  return {
    getActiveTask() {
      return activeTask;
    },
    getTaskById(taskId) {
      const normalized = String(taskId || '').trim();
      if (!normalized) return null;
      if (activeTask && activeTask.id === normalized) return activeTask;
      return recentTasks.find((task) => task.id === normalized) || null;
    },
    getRecentTasks() {
      return [...recentTasks];
    },
    getAbortSignal(taskId) {
      const task = this.getTaskById(taskId);
      if (!task) return null;
      return getRuntime(task.id).abortController.signal;
    },
    startTask(input) {
      if (activeTask && !isTerminalStatus(activeTask.status)) return null;
      const now = nowIso();
      const taskId = toTaskId(input.kind);
      const checkpoint = input.checkpoint
        ? {
          checkpointVersion: Math.max(1, Number(input.checkpoint.checkpointVersion) || 1),
          step: input.checkpoint.step,
          chunkTotal: input.checkpoint.chunkTotal,
          chunkCompleted: input.checkpoint.chunkCompleted,
          chunkFailed: input.checkpoint.chunkFailed,
          payload: input.checkpoint.payload,
        }
        : null;

      activeTask = {
        id: taskId,
        kind: input.kind,
        status: 'RUNNING',
        label: input.label,
        atomic: Boolean(input.atomic),
        resumable: Boolean(input.resumable),
        canPause: Boolean(input.canPause),
        canResume: false,
        canCancel: input.canCancel !== false,
        progress: 0,
        startedAt: now,
        updatedAt: now,
        finishedAt: null,
        message: input.message || null,
        errorMessage: null,
        errorCode: null,
        checkpoint,
      };

      const runtime = getRuntime(taskId);
      return {
        taskId,
        abortSignal: runtime.abortController.signal,
      };
    },
    updateTask(taskId, patch) {
      if (!activeTask || activeTask.id !== taskId) return;
      activeTask = {
        ...activeTask,
        ...patch,
        updatedAt: nowIso(),
      };
    },
    completeTask(taskId, message) {
      finalizeTask(taskId, {
        status: 'COMPLETED',
        message: message || 'Task completed',
      });
    },
    failTask(taskId, error) {
      const parsed = toErrorParts(error);
      finalizeTask(taskId, {
        status: 'FAILED',
        message: parsed.message,
        errorCode: parsed.code,
        errorMessage: parsed.message,
      });
    },
    cancelTask(taskId, message) {
      finalizeTask(taskId, {
        status: 'CANCELED',
        message: message || 'Task canceled',
        errorCode: 'WORLD_STUDIO_TASK_CANCELED',
        errorMessage: message || 'Task canceled',
      });
    },
    pauseTask(taskId, message) {
      if (!activeTask || activeTask.id !== taskId) return;
      activeTask = {
        ...activeTask,
        status: 'PAUSED',
        canPause: false,
        canResume: true,
        canCancel: true,
        message: message || 'Task paused',
        updatedAt: nowIso(),
      };
    },
    resumeTask(taskId, message) {
      if (!activeTask || activeTask.id !== taskId) return false;
      const runtime = getRuntime(taskId);
      runtime.pauseRequested = false;
      activeTask = {
        ...activeTask,
        status: 'RUNNING',
        canPause: true,
        canResume: false,
        canCancel: true,
        message: message || 'Task resumed',
        updatedAt: nowIso(),
      };
      return true;
    },
    requestPause(taskId) {
      if (!activeTask || activeTask.id !== taskId || !activeTask.canPause) return false;
      const runtime = getRuntime(taskId);
      runtime.pauseRequested = true;
      activeTask = {
        ...activeTask,
        status: 'PAUSE_REQUESTED',
        canPause: false,
        canResume: false,
        canCancel: true,
        message: 'Pause requested',
        updatedAt: nowIso(),
      };
      return true;
    },
    requestCancel(taskId) {
      if (!activeTask || activeTask.id !== taskId || !activeTask.canCancel) return false;
      const runtime = getRuntime(taskId);
      runtime.cancelRequested = true;
      runtime.abortController.abort();
      activeTask = {
        ...activeTask,
        status: 'CANCEL_REQUESTED',
        canPause: false,
        canResume: false,
        canCancel: false,
        message: 'Cancel requested',
        updatedAt: nowIso(),
      };
      return true;
    },
    shouldPause(taskId) {
      return Boolean(getRuntime(taskId).pauseRequested);
    },
    shouldCancel(taskId) {
      return Boolean(getRuntime(taskId).cancelRequested);
    },
    async waitWhilePaused(taskId) {
      if (!this.shouldPause(taskId)) return 'resume';
      return 'resume';
    },
    setCheckpoint(taskId, patch) {
      if (!activeTask || activeTask.id !== taskId) return;
      const previousVersion = activeTask.checkpoint?.checkpointVersion || 0;
      activeTask = {
        ...activeTask,
        checkpoint: {
          checkpointVersion: Math.max(previousVersion + 1, Number(patch.checkpointVersion) || previousVersion + 1),
          step: patch.step,
          chunkTotal: patch.chunkTotal,
          chunkCompleted: patch.chunkCompleted,
          chunkFailed: patch.chunkFailed,
          payload: patch.payload,
        },
        updatedAt: nowIso(),
      };
    },
    setExpertMode(value) {
      expertMode = Boolean(value);
    },
    // Useful for debugging tests if needed.
    __getExpertMode() {
      return expertMode;
    },
  };
}
