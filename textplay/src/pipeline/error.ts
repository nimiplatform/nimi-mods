import { TEXTPLAY_CHAIN_REASON } from '../contracts.js';
import type { TextplayChainReasonCode, TextplayReasonCode } from '../contracts.js';

export class TextplayPipelineError extends Error {
  readonly reasonCode: TextplayReasonCode;

  readonly actionHint: string;

  readonly stage: string;

  readonly chainReasonCode: TextplayChainReasonCode;

  readonly retryClass: 'retryable' | 'non-retryable';

  constructor(input: {
    reasonCode: TextplayReasonCode;
    actionHint: string;
    message: string;
    stage: string;
    chainReasonCode?: TextplayChainReasonCode;
    retryClass?: 'retryable' | 'non-retryable';
  }) {
    super(input.message);
    this.reasonCode = input.reasonCode;
    this.actionHint = input.actionHint;
    this.stage = input.stage;
    this.chainReasonCode = input.chainReasonCode || mapReasonCodeToChainReason(input.reasonCode);
    this.retryClass = input.retryClass || 'non-retryable';
  }
}

export function mapReasonCodeToChainReason(reasonCode: string): TextplayChainReasonCode {
  if (
    reasonCode === 'TEXTPLAY_INPUT_INVALID'
    || reasonCode === 'TEXTPLAY_CONTEXT_MISSING_CRITICAL'
    || reasonCode === 'TEXTPLAY_POV_VIOLATION_DETECTED'
  ) {
    return TEXTPLAY_CHAIN_REASON.RENDER_INPUT_INVALID;
  }

  if (reasonCode === 'TEXTPLAY_ROUTE_UNAVAILABLE') {
    return TEXTPLAY_CHAIN_REASON.ROUTE_UNAVAILABLE;
  }

  return TEXTPLAY_CHAIN_REASON.RENDER_FAILED;
}
