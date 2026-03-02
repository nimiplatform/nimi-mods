import {
  type VideoPlayReasonCode,
  type VideoPlayRetryClass,
  VIDEOPLAY_REASON,
  VIDEOPLAY_RETRY_CLASS,
} from './contracts.js';

export class VideoPlayError extends Error {
  readonly reasonCode: VideoPlayReasonCode;

  readonly actionHint: string;

  readonly retryClass: VideoPlayRetryClass;

  readonly stage: string;

  readonly details?: Record<string, unknown>;

  constructor(input: {
    reasonCode: VideoPlayReasonCode;
    actionHint: string;
    stage: string;
    message?: string;
    retryClass?: VideoPlayRetryClass;
    details?: Record<string, unknown>;
  }) {
    super(input.message || `${input.reasonCode}:${input.stage}`);
    this.name = 'VideoPlayError';
    this.reasonCode = input.reasonCode;
    this.actionHint = input.actionHint;
    this.retryClass = input.retryClass || VIDEOPLAY_RETRY_CLASS.NON_RETRYABLE;
    this.stage = input.stage;
    this.details = input.details;
  }
}

export function toVideoPlayError(error: unknown, fallback: {
  reasonCode: VideoPlayReasonCode;
  actionHint: string;
  stage: string;
  retryClass?: VideoPlayRetryClass;
}): VideoPlayError {
  if (error instanceof VideoPlayError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error || '');
  return new VideoPlayError({
    reasonCode: fallback.reasonCode,
    actionHint: fallback.actionHint,
    stage: fallback.stage,
    retryClass: fallback.retryClass,
    message,
  });
}

export function inputInvalidError(message: string, details?: Record<string, unknown>) {
  return new VideoPlayError({
    reasonCode: VIDEOPLAY_REASON.INPUT_INVALID,
    actionHint: 'Fix input schema and value bounds, then retry.',
    stage: 'orchestrator',
    message,
    details,
  });
}
