import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractTtsFailureActionHint,
  extractTtsFailureReasonCode,
  isVoiceUnsupportedTtsFailure,
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

test('extractTtsFailureReasonCode normalizes plain timeout messages to AI_PROVIDER_TIMEOUT', () => {
  assert.equal(
    extractTtsFailureReasonCode(new Error('Timeout expired')),
    'AI_PROVIDER_TIMEOUT',
  );
  assert.equal(
    extractTtsFailureReasonCode(new Error('operation timed out after 30000ms')),
    'AI_PROVIDER_TIMEOUT',
  );
});

test('extractTtsFailureReasonCode normalizes transport protocol errors to RUNTIME_GRPC_UNAVAILABLE', () => {
  assert.equal(
    extractTtsFailureReasonCode(new Error('h2 protocol error: http2 error')),
    'RUNTIME_GRPC_UNAVAILABLE',
  );
});

test('extractTtsFailureReasonCode prefers AI reason from message over non-AI object reason', () => {
  const reasonCode = extractTtsFailureReasonCode({
    reasonCode: 'RUNTIME_CALL_FAILED',
    message: 'rpc error: code = InvalidArgument desc = {"reasonCode":"AI_MEDIA_OPTION_UNSUPPORTED"}',
  });
  assert.equal(reasonCode, 'AI_MEDIA_OPTION_UNSUPPORTED');
});

test('extractTtsFailureActionHint reads actionHint from payload and message', () => {
  assert.equal(
    extractTtsFailureActionHint({
      actionHint: 'adjust_tts_voice_or_audio_options',
    }),
    'adjust_tts_voice_or_audio_options',
  );
  assert.equal(
    extractTtsFailureActionHint(new Error('rpc error: {"actionHint":"adjust_tts_voice_or_audio_options"}')),
    'adjust_tts_voice_or_audio_options',
  );
});

test('isVoiceUnsupportedTtsFailure matches reason + hint exactly', () => {
  assert.equal(
    isVoiceUnsupportedTtsFailure('AI_MEDIA_OPTION_UNSUPPORTED', 'adjust_tts_voice_or_audio_options'),
    true,
  );
  assert.equal(
    isVoiceUnsupportedTtsFailure('AI_MEDIA_OPTION_UNSUPPORTED', 'switch_tts_model_or_refresh_connector_models'),
    false,
  );
});
