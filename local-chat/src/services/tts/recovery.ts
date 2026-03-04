const TTS_CORRECTABLE_REASON_CODES = new Set<string>([
  'AI_MODEL_NOT_FOUND',
  'AI_MODALITY_NOT_SUPPORTED',
  'AI_MEDIA_OPTION_UNSUPPORTED',
]);

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
  const matched = message.match(/\b(AI_[A-Z_]+)\b/);
  return matched?.[1] || fromObject;
}

export function isRetryableTtsModelFailure(reasonCode: string): boolean {
  return TTS_CORRECTABLE_REASON_CODES.has(String(reasonCode || '').trim());
}

export function selectNextTtsModelCandidate(models: string[], currentModel: string): string {
  const normalizedCurrent = String(currentModel || '').trim();
  const normalizedModels = models
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (normalizedModels.length === 0) {
    return '';
  }
  if (!normalizedCurrent) {
    return normalizedModels[0] || '';
  }
  const currentIndex = normalizedModels.findIndex((model) => model === normalizedCurrent);
  if (currentIndex < 0) {
    return normalizedModels[0] || '';
  }
  for (let index = currentIndex + 1; index < normalizedModels.length; index += 1) {
    const candidate = normalizedModels[index];
    if (candidate && candidate !== normalizedCurrent) {
      return candidate;
    }
  }
  return '';
}
