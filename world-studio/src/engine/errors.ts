export function isContextOverflowText(value: unknown): boolean {
  const message = String(value || '').toLowerCase();
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

export function isContextOverflowError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return isContextOverflowText(message);
}

const SYNTHETIC_NAME_PATTERN = /^(char|loc|evt|t|segment|future|primary|secondary)-/i;

export function isSyntheticEntityName(name: string): boolean {
  return SYNTHETIC_NAME_PATTERN.test(name);
}
