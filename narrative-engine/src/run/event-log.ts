import { appendNarrativeRunEvent } from '../store/repository.js';
import { ensureNarrativeRunStateTransition } from './state-machine.js';
import type {
  NarrativeRunEnvelope,
  NarrativeRunEvent,
  NarrativeRunEventType,
  NarrativeRunRetryClass,
  NarrativeRunState,
} from '../types.js';

type NarrativeRunEventLogInput = {
  traceId: string;
  runId: string;
  taskId: string;
  parentRunId: string | null;
  idempotencyKey: string;
};

export class NarrativeRunEventLog {
  private readonly traceId: string;

  private readonly runId: string;

  private readonly taskId: string;

  private readonly parentRunId: string | null;

  private readonly idempotencyKey: string;

  private seq: number;

  private attempt: number;

  private state: NarrativeRunState;

  private lastEventType: NarrativeRunEventType;

  constructor(input: NarrativeRunEventLogInput) {
    this.traceId = input.traceId;
    this.runId = input.runId;
    this.taskId = input.taskId;
    this.parentRunId = input.parentRunId;
    this.idempotencyKey = input.idempotencyKey;
    this.seq = 0;
    this.attempt = 1;
    this.state = 'RUNNING';
    this.lastEventType = 'run.start';
  }

  private append(input: {
    step: string;
    eventType: NarrativeRunEventType;
    reasonCode?: string;
    actionHint?: string;
    retryClass?: NarrativeRunRetryClass;
    checkpointToken?: string;
    stepInputHash?: string;
    lastCompletedUnit?: string;
    details?: Record<string, unknown>;
  }): NarrativeRunEvent {
    this.seq += 1;

    const event: NarrativeRunEvent = {
      traceId: this.traceId,
      runId: this.runId,
      parentRunId: this.parentRunId,
      stage: 'narrative-engine',
      step: input.step,
      eventType: input.eventType,
      seq: this.seq,
      attempt: this.attempt,
      timestamp: new Date().toISOString(),
      taskId: this.taskId,
      idempotencyKey: this.idempotencyKey,
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      ...(input.actionHint ? { actionHint: input.actionHint } : {}),
      ...(input.retryClass ? { retryClass: input.retryClass } : {}),
      ...(input.checkpointToken ? { checkpointToken: input.checkpointToken } : {}),
      ...(input.stepInputHash ? { stepInputHash: input.stepInputHash } : {}),
      ...(input.lastCompletedUnit ? { lastCompletedUnit: input.lastCompletedUnit } : {}),
      ...(input.details ? { details: input.details } : {}),
    };

    appendNarrativeRunEvent({
      runId: this.runId,
      event,
    });

    this.lastEventType = input.eventType;
    return event;
  }

  startRun(details?: Record<string, unknown>): NarrativeRunEvent {
    return this.append({
      step: 'run',
      eventType: 'run.start',
      details,
    });
  }

  startStep(step: string, details?: Record<string, unknown>): NarrativeRunEvent {
    return this.append({
      step,
      eventType: 'step.start',
      details,
    });
  }

  chunkStep(step: string, details?: Record<string, unknown>): NarrativeRunEvent {
    return this.append({
      step,
      eventType: 'step.chunk',
      details,
    });
  }

  completeStep(step: string, input?: {
    checkpointToken?: string;
    stepInputHash?: string;
    lastCompletedUnit?: string;
    details?: Record<string, unknown>;
  }): NarrativeRunEvent {
    return this.append({
      step,
      eventType: 'step.complete',
      checkpointToken: input?.checkpointToken,
      stepInputHash: input?.stepInputHash,
      lastCompletedUnit: input?.lastCompletedUnit,
      details: input?.details,
    });
  }

  errorStep(step: string, input: {
    reasonCode: string;
    actionHint: string;
    retryClass: NarrativeRunRetryClass;
    details?: Record<string, unknown>;
  }): NarrativeRunEvent {
    return this.append({
      step,
      eventType: 'step.error',
      reasonCode: input.reasonCode,
      actionHint: input.actionHint,
      retryClass: input.retryClass,
      details: input.details,
    });
  }

  completeRun(details?: Record<string, unknown>): NarrativeRunEvent {
    this.state = ensureNarrativeRunStateTransition(this.state, 'COMPLETED');
    return this.append({
      step: 'run',
      eventType: 'run.complete',
      details,
    });
  }

  failRun(input: {
    reasonCode: string;
    actionHint: string;
    retryClass: NarrativeRunRetryClass;
    details?: Record<string, unknown>;
  }): NarrativeRunEvent {
    this.state = ensureNarrativeRunStateTransition(this.state, 'FAILED');
    return this.append({
      step: 'run',
      eventType: 'run.error',
      reasonCode: input.reasonCode,
      actionHint: input.actionHint,
      retryClass: input.retryClass,
      details: input.details,
    });
  }

  cancelRun(input: {
    reasonCode: string;
    actionHint: string;
    details?: Record<string, unknown>;
  }): NarrativeRunEvent {
    this.state = ensureNarrativeRunStateTransition(this.state, 'CANCEL_REQUESTED');
    this.state = ensureNarrativeRunStateTransition(this.state, 'CANCELED');
    return this.append({
      step: 'run',
      eventType: 'run.canceled',
      reasonCode: input.reasonCode,
      actionHint: input.actionHint,
      retryClass: 'non-retryable',
      details: input.details,
    });
  }

  getEnvelope(): NarrativeRunEnvelope {
    return {
      traceId: this.traceId,
      runId: this.runId,
      taskId: this.taskId,
      state: this.state,
      eventType: this.lastEventType,
      seq: this.seq,
      attempt: this.attempt,
    };
  }
}
