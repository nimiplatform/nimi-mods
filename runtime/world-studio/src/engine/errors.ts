export type WorldStudioChunkFailureKind =
  | 'json_parse'
  | 'context_overflow'
  | 'provider_timeout'
  | 'provider_internal'
  | 'other';

function normalizeErrorText(value: unknown): string {
  if (value instanceof Error) return String(value.message || '').toLowerCase();
  return String(value || '').toLowerCase();
}

export function isContextOverflowText(value: unknown): boolean {
  const message = normalizeErrorText(value);
  if (!message) return false;
  return (
    message.includes('world_studio_context_overflow')
    || message.includes('context_overflow')
    || message.includes('context window')
    || message.includes('maximum context length')
    || message.includes('context length exceeded')
    || message.includes('exceeds the context')
    || message.includes('prompt is too long')
    || message.includes('input is too long')
  );
}

export function isProviderTimeoutText(value: unknown): boolean {
  const message = normalizeErrorText(value);
  if (!message) return false;
  return (
    message.includes('world_studio_provider_timeout')
    || message.includes('local_ai_provider_timeout')
    || message.includes('play_provider_timeout')
    || message.includes('ai_provider_timeout')
    || message.includes('timeout expired')
    || message.includes('timed out')
    || message.includes('deadline exceeded')
    || message.includes('request timeout')
  );
}

export function isProviderInternalText(value: unknown): boolean {
  const message = normalizeErrorText(value);
  if (!message) return false;
  return (
    message.includes('world_studio_provider_internal')
    || message.includes('local_ai_provider_internal_error')
    || message.includes('ai_output_invalid')
    || message.includes('sdk_runtime_tauri_unary_failed')
    || message.includes('runtime_bridge_unary')
    || message.includes('missing required key payload')
    || message.includes('invalid args `payload`')
    || message.includes('provider returned empty content')
    || message.includes('ai_stream_broken')
  );
}

export function isJsonParseText(value: unknown): boolean {
  const message = normalizeErrorText(value);
  if (!message) return false;
  return (
    message.includes('world_studio_json_object_required')
    || message.includes('world_studio_json_not_found')
    || message.includes('world_studio_empty_model_output')
    || message.includes('json')
    || message.includes('parse')
  );
}

export function classifyChunkFailureKind(value: unknown): WorldStudioChunkFailureKind {
  if (isContextOverflowText(value)) return 'context_overflow';
  if (isProviderTimeoutText(value)) return 'provider_timeout';
  if (isProviderInternalText(value)) return 'provider_internal';
  if (isJsonParseText(value)) return 'json_parse';
  return 'other';
}

export function isTransientChunkFailureKind(kind: WorldStudioChunkFailureKind): boolean {
  return kind === 'provider_timeout' || kind === 'provider_internal';
}

export function isRetryableChunkError(value: unknown): boolean {
  return isTransientChunkFailureKind(classifyChunkFailureKind(value));
}

export function resolveChunkFailureCode(stage: 'coarse' | 'fine', error: unknown): string {
  const kind = classifyChunkFailureKind(error);
  if (kind === 'context_overflow') return 'WORLD_STUDIO_CONTEXT_OVERFLOW';
  if (kind === 'provider_timeout') return 'WORLD_STUDIO_PROVIDER_TIMEOUT';
  if (kind === 'provider_internal') return 'WORLD_STUDIO_PROVIDER_INTERNAL';
  if (kind === 'json_parse') {
    return stage === 'coarse'
      ? 'WORLD_STUDIO_COARSE_JSON_PARSE_FAILED'
      : 'WORLD_STUDIO_FINE_JSON_PARSE_FAILED';
  }
  return 'WORLD_STUDIO_PROVIDER_INTERNAL';
}

export function isContextOverflowError(error: unknown): boolean {
  return isContextOverflowText(error);
}

const SYNTHETIC_NAME_PATTERN = /^(?:char(?:acter)?|role|persona?|loc(?:ation)?|evt|timeline|segment|future|primary|secondary)(?:[-_:][a-z0-9-]+|\d+)$/i;
const SYNTHETIC_CJK_NAME_PATTERN = /^(?:角色|人物|地点|事件|时间线)[-_:\s]*\d+$/;

export function isSyntheticEntityName(name: string): boolean {
  const value = String(name || '').trim();
  if (!value) return false;
  return SYNTHETIC_NAME_PATTERN.test(value) || SYNTHETIC_CJK_NAME_PATTERN.test(value);
}
