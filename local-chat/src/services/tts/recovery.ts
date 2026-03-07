function readObjectReasonCode(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return '';
  }
  const record = input as Record<string, unknown>;
  const reasonCode = String(record.reasonCode || '').trim();
  if (reasonCode) {
    return reasonCode;
  }
  return '';
}

function readObjectActionHint(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return '';
  }
  const record = input as Record<string, unknown>;
  return String(record.actionHint || record.action_hint || '').trim();
}

function readObjectMessage(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return '';
  }
  const record = input as Record<string, unknown>;
  const directMessage = String(record.message || '').trim();
  if (directMessage) {
    return directMessage;
  }
  const nested = record.error;
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
    return '';
  }
  const nestedRecord = nested as Record<string, unknown>;
  return String(nestedRecord.message || '').trim();
}

export function extractTtsFailureReasonCode(error: unknown): string {
  const fromObject = readObjectReasonCode(error);
  if (fromObject.startsWith('AI_')) {
    return fromObject;
  }
  const message = String(
    error instanceof Error
      ? error.message
      : readObjectMessage(error) || error || '',
  ).trim();
  if (!message) {
    return fromObject;
  }
  const normalizedMessage = message.toLowerCase();
  if (
    normalizedMessage.includes('timeout expired')
    || normalizedMessage.includes('timed out')
    || normalizedMessage.includes('deadline exceeded')
  ) {
    return 'AI_PROVIDER_TIMEOUT';
  }
  if (
    normalizedMessage.includes('h2 protocol error')
    || normalizedMessage.includes('http2 error')
  ) {
    return 'RUNTIME_GRPC_UNAVAILABLE';
  }
  const matched = message.match(/\b(AI_[A-Z_]+)\b/);
  return matched?.[1] || fromObject;
}

export function extractTtsFailureActionHint(error: unknown): string {
  const fromObject = readObjectActionHint(error);
  if (fromObject) {
    return fromObject;
  }
  const message = String(
    error instanceof Error
      ? error.message
      : readObjectMessage(error) || error || '',
  ).trim();
  if (!message) {
    return '';
  }
  const matched = message.match(/"actionHint"\s*:\s*"([^"]+)"/i)
    || message.match(/"action_hint"\s*:\s*"([^"]+)"/i);
  return String(matched?.[1] || '').trim();
}

export function isVoiceUnsupportedTtsFailure(reasonCode: string, actionHint: string): boolean {
  return String(reasonCode || '').trim() === 'AI_MEDIA_OPTION_UNSUPPORTED'
    && String(actionHint || '').trim() === 'adjust_tts_voice_or_audio_options';
}
