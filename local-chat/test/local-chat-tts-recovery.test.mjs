import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractTtsFailureReasonCode,
  isRetryableTtsModelFailure,
  selectNextTtsModelCandidate,
} from '../src/services/tts/recovery.ts';

test('extractTtsFailureReasonCode reads structured reasonCode from error object', () => {
  const reasonCode = extractTtsFailureReasonCode({
    reasonCode: 'AI_MODEL_NOT_FOUND',
    actionHint: 'switch_tts_model_or_refresh_connector_models',
  });
  assert.equal(reasonCode, 'AI_MODEL_NOT_FOUND');
});

test('extractTtsFailureReasonCode parses AI reason from error message', () => {
  const reasonCode = extractTtsFailureReasonCode(new Error('rpc error: AI_MODALITY_NOT_SUPPORTED'));
  assert.equal(reasonCode, 'AI_MODALITY_NOT_SUPPORTED');
});

test('extractTtsFailureReasonCode prefers AI reason from message over non-AI object reason', () => {
  const reasonCode = extractTtsFailureReasonCode({
    reasonCode: 'RUNTIME_CALL_FAILED',
    message: 'rpc error: code = InvalidArgument desc = {"reasonCode":"AI_MEDIA_OPTION_UNSUPPORTED"}',
  });
  assert.equal(reasonCode, 'AI_MEDIA_OPTION_UNSUPPORTED');
});

test('isRetryableTtsModelFailure only allows model-correctable categories', () => {
  assert.equal(isRetryableTtsModelFailure('AI_MODEL_NOT_FOUND'), true);
  assert.equal(isRetryableTtsModelFailure('AI_MODALITY_NOT_SUPPORTED'), true);
  assert.equal(isRetryableTtsModelFailure('AI_MEDIA_OPTION_UNSUPPORTED'), true);
  assert.equal(isRetryableTtsModelFailure('AI_INPUT_INVALID'), false);
});

test('selectNextTtsModelCandidate returns next model once and does not loop', () => {
  const models = ['cloud/qwen-tts-1', 'cloud/qwen-tts-2', 'cloud/qwen-tts-3'];
  assert.equal(selectNextTtsModelCandidate(models, 'cloud/qwen-tts-1'), 'cloud/qwen-tts-2');
  assert.equal(selectNextTtsModelCandidate(models, 'cloud/qwen-tts-3'), '');
  assert.equal(selectNextTtsModelCandidate(models, 'cloud/unknown'), 'cloud/qwen-tts-1');
});
